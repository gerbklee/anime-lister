// Atelier's API (under /api/atelier): plan, path, lessons, today's session,
// reviews, focus blocks (the pomodoro timer), your valley, stats, the
// sketchbook (uploads, self-ratings, sharing), study files and critiques.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const sharp = require('sharp');
const { db, DATA_DIR } = require('../db');
const { HttpError, wrap, parseId } = require('../http');
const { isSpicy } = require('../adult');
const { usersById } = require('../users');
const { notify } = require('../notify');
const activity = require('../activity');
const C = require('./curriculum');
const core = require('./core');
const stats = require('./stats');
const { studyPsd } = require('./psd');
const crit = require('./critique');

const DRAW_DIR = path.join(DATA_DIR, 'atelier', 'drawings');
const REF_DIR = path.join(DATA_DIR, 'atelier', 'refs');
fs.mkdirSync(DRAW_DIR, { recursive: true });
fs.mkdirSync(REF_DIR, { recursive: true });

const q = {
  insertBlock: db.prepare('INSERT INTO atelier_blocks (user_id, started_at, planned, kind, lesson_id, area, tree, stage, status) VALUES (@u, @at, @planned, @kind, @lesson, @area, @tree, @stage, @status)'),
  block: db.prepare('SELECT * FROM atelier_blocks WHERE id = ? AND user_id = ?'),
  finishBlock: db.prepare('UPDATE atelier_blocks SET status = ?, ended_at = ?, minutes = ? WHERE id = ?'),
  logBlock: db.prepare("INSERT INTO atelier_blocks (user_id, started_at, ended_at, planned, minutes, status, kind, area, tree, stage) VALUES (@u, @start, @end, @planned, @minutes, 'done', @kind, @area, @tree, @stage)"),
  staleBlocks: db.prepare("UPDATE atelier_blocks SET status = 'done', ended_at = started_at + planned * 60000, minutes = planned WHERE user_id = ? AND status = 'running' AND started_at + planned * 60000 + 3600000 < ?"),
  insertDrawing: db.prepare(`INSERT INTO atelier_drawings (user_id, lesson_id, exercise_id, kind, skill, area, title, file, reference_file, reference_url, reference_post, check_round, adult, status, created_at)
    VALUES (@u, @lesson, @exercise, @kind, @skill, @area, @title, @file, @refFile, @refUrl, @refPost, @round, @adult, @status, @at)`),
  drawing: db.prepare('SELECT * FROM atelier_drawings WHERE id = ?'),
  myDrawings: db.prepare('SELECT * FROM atelier_drawings WHERE user_id = ? ORDER BY created_at DESC LIMIT 500'),
  sharedDrawings: db.prepare("SELECT * FROM atelier_drawings WHERE shared = 1 AND user_id != ? AND file IS NOT NULL ORDER BY created_at DESC LIMIT 200"),
  setFile: db.prepare("UPDATE atelier_drawings SET file = ?, status = 'done', created_at = ? WHERE id = ?"),
  setSelf: db.prepare('UPDATE atelier_drawings SET self_scores = ? WHERE id = ?'),
  setShared: db.prepare('UPDATE atelier_drawings SET shared = ? WHERE id = ?'),
  setTitle: db.prepare('UPDATE atelier_drawings SET title = ? WHERE id = ?'),
  setCritique: db.prepare('UPDATE atelier_drawings SET critique = ?, critique_cost = COALESCE(critique_cost, 0) + ? WHERE id = ?'),
  deleteDrawing: db.prepare('DELETE FROM atelier_drawings WHERE id = ?'),
  checkRounds: db.prepare("SELECT * FROM atelier_drawings WHERE user_id = ? AND kind = 'check' AND file IS NOT NULL ORDER BY check_round, exercise_id"),
  myCharacterTags: db.prepare(`
    SELECT DISTINCT t.tag, e.name FROM entries e JOIN lists l ON l.id = e.list_id
    JOIN fanart_tags t ON t.character_id = e.anilist_id AND t.source = 'danbooru'
    WHERE l.kind = 'character' AND t.tag IS NOT NULL AND (l.owner_id = @me OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))
    LIMIT 60`),
  reminderProfiles: db.prepare('SELECT user_id, reminder_at, tz, last_reminded, plan_when, plan_where, daily_minutes FROM atelier_profile WHERE reminder_at IS NOT NULL'),
  setReminded: db.prepare('UPDATE atelier_profile SET last_reminded = ? WHERE user_id = ?'),
};

// ---- Helpers ---------------------------------------------------------------------------------

const fileUrl = (name) => (name ? `/api/atelier/file/${name}` : null);
const randomName = (prefix) => `${prefix}-${crypto.randomBytes(10).toString('hex')}.jpg`;

// Adult-track level of a lesson: 2 for nude units (A1, A7), 1 for the rest of the track.
const adultLevel = (lesson) => (!lesson?.unit ? 0 : ['A1', 'A7'].includes(lesson.unit) ? 2 : 1);

function drawingView(d, me, users) {
  let critique = null;
  try {
    critique = d.critique ? JSON.parse(d.critique) : null;
  } catch {
    // ignore
  }
  let selfScores = null;
  try {
    selfScores = d.self_scores ? JSON.parse(d.self_scores) : null;
  } catch {
    // ignore
  }
  const lesson = d.lesson_id ? C.LESSON.get(d.lesson_id) : null;
  return {
    id: d.id,
    mine: d.user_id === me,
    user: users?.get(d.user_id) ?? null,
    lessonId: d.lesson_id,
    lessonTitle: lesson?.title ?? null,
    exerciseId: d.exercise_id,
    exerciseTitle: lesson?.exercises.find((e) => e.id === d.exercise_id)?.title ?? null,
    kind: d.kind,
    area: d.area,
    title: d.title,
    file: fileUrl(d.file),
    reference: fileUrl(d.reference_file),
    referencePost: d.reference_post,
    checkRound: d.check_round,
    selfScores,
    critique,
    shared: !!d.shared,
    adult: d.adult,
    status: d.status,
    createdAt: d.created_at,
    reactions: d.shared ? activity.reactionSummary(`drawing:${d.id}`, me) : null,
  };
}

function ownDrawing(id, userId) {
  const d = q.drawing.get(id);
  if (!d || d.user_id !== userId) throw new HttpError(404, 'Drawing not found');
  return d;
}

// Saves an uploaded picture (any common format) as a JPEG, max 4000 px.
async function saveImage(buffer, dir, prefix, max = 4000) {
  if (!buffer?.length) throw new HttpError(400, 'No picture uploaded');
  const name = randomName(prefix);
  try {
    await sharp(buffer, { failOn: 'none' }).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toFile(path.join(dir, name));
  } catch {
    throw new HttpError(400, 'That file isn’t a picture Atelier can read (use PNG or JPEG).');
  }
  return name;
}

// A reference from the Art search (a site URL or a stored /images/ copy).
async function saveReference(url) {
  if (!url) return null;
  const { pictureBytes } = require('../studio');
  const buf = await pictureBytes(String(url));
  return saveImage(buf, REF_DIR, 'ref', 2400);
}

function treeFor(userId) {
  const stage = core.currentStage(userId);
  return { tree: C.STAGES[stage]?.tree ?? 'sapling', stage };
}

// ---- Routes --------------------------------------------------------------------------------------

const router = express.Router();
const raw = express.raw({ type: ['image/*', 'application/octet-stream'], limit: '40mb' });

router.get('/atelier/me', (req, res) => {
  const p = core.profile(req.user.id);
  delete p.raw;
  res.json({ profile: p, critique: { available: crit.available(), spent: crit.spentThisMonth(req.user.id), cap: p.critiqueCap / 100 } });
});

router.put('/atelier/me', (req, res) => {
  const p = core.updateProfile(req.user.id, req.body ?? {});
  delete p.raw;
  res.json({ profile: p });
});

// The whole path: stages with lesson summaries and your progress.
router.get('/atelier/path', (req, res) => {
  const prof = core.profile(req.user.id);
  const { adult, state, stage } = core.visibleLessons(req.user.id, prof);
  const summary = (l) => ({
    id: l.id,
    title: l.title,
    area: l.area,
    minutes: l.minutes,
    exercises: l.exercises.length,
    read: !!state.get(l.id)?.read_at,
    done: !!state.get(l.id)?.done_at,
  });
  const current = core.currentLesson(req.user.id, state);
  res.json({
    currentLesson: current?.id ?? null,
    currentStage: stage,
    stages: C.STAGES.map((s) => ({ ...s, lessons: C.MAIN.filter((l) => l.stage === s.id).map(summary) })),
    adult: prof.adultTrack
      ? C.ADULT_UNITS.map((u) => ({ ...u, open: u.opensWith <= stage, lessons: C.ADULT.filter((l) => l.unit === u.id).map(summary) }))
      : null,
    adultAllowed: prof.adultAllowed,
    areas: C.AREAS,
  });
});

router.get('/atelier/lessons/:id', (req, res) => {
  const lesson = C.LESSON.get(req.params.id);
  const prof = core.profile(req.user.id);
  if (!lesson || (lesson.unit && !prof.adultTrack)) throw new HttpError(404, 'Lesson not found');
  const state = core.lessonState(req.user.id).get(lesson.id);
  const users = usersById();
  const drawings = q.myDrawings.all(req.user.id).filter((d) => d.lesson_id === lesson.id).map((d) => drawingView(d, req.user.id, users));
  const order = lesson.unit ? C.ADULT : C.MAIN;
  const i = order.findIndex((l) => l.id === lesson.id);
  res.json({
    lesson,
    stage: lesson.stage != null ? C.STAGES[lesson.stage] : null,
    unit: lesson.unit ? C.ADULT_UNITS.find((u) => u.id === lesson.unit) : null,
    area: lesson.area ? C.AREA[lesson.area] : null,
    read: !!state?.read_at,
    done: !!state?.done_at,
    drawings,
    prev: order[i - 1]?.id ?? null,
    next: order[i + 1]?.id ?? null,
  });
});

router.post('/atelier/lessons/:id/:action', (req, res) => {
  const lesson = C.LESSON.get(req.params.id);
  if (!lesson) throw new HttpError(404, 'Lesson not found');
  if (req.params.action === 'read') core.markRead(req.user.id, lesson.id);
  else if (req.params.action === 'done') core.markDone(req.user.id, lesson.id);
  else if (req.params.action === 'undo') core.undoDone(req.user.id, lesson.id);
  else throw new HttpError(400, 'Unknown action');
  res.json({ ok: true });
});

router.get('/atelier/today', (req, res) => {
  res.json({ ...core.todaySession(req.user.id), fresh: stats.weeklyReview(req.user.id).freshStart });
});

router.post('/atelier/reviews/:skill', (req, res) => {
  res.json(core.rateReview(req.user.id, String(req.params.skill), req.body?.rating));
});

// An exercise done without uploading (e.g. drills on paper).
router.post('/atelier/exercises/done', (req, res) => {
  const lesson = C.LESSON.get(String(req.body?.lessonId ?? ''));
  const exercise = lesson?.exercises.find((e) => e.id === req.body?.exerciseId);
  if (!lesson || !exercise) throw new HttpError(400, 'Unknown exercise');
  const id = Number(
    q.insertDrawing.run({ u: req.user.id, lesson: lesson.id, exercise: exercise.id, kind: exercise.kind, skill: lesson.skills[0] ?? null, area: lesson.area, title: exercise.title, file: null, refFile: null, refUrl: null, refPost: null, round: null, adult: adultLevel(lesson), status: 'done', at: Date.now() }).lastInsertRowid,
  );
  res.status(201).json({ id });
});

// ---- Focus blocks (pomodoro) ----------------------------------------------------------------

router.post('/atelier/blocks', (req, res) => {
  const planned = Math.max(1, Math.min(240, Math.round(Number(req.body?.minutes) || 25)));
  const lesson = req.body?.lessonId ? C.LESSON.get(String(req.body.lessonId)) : null;
  const area = C.AREA[req.body?.area] ? req.body.area : lesson?.area ?? null;
  const { tree, stage } = treeFor(req.user.id);
  q.staleBlocks.run(req.user.id, Date.now());
  const id = Number(
    q.insertBlock.run({ u: req.user.id, at: Date.now(), planned, kind: String(req.body?.kind ?? 'free').slice(0, 20), lesson: lesson?.id ?? null, area, tree, stage, status: 'running' }).lastInsertRowid,
  );
  res.status(201).json({ id, tree, stage, planned, area });
});

// status: 'done' (finished or ended at a natural point) or 'gave_up' (the tree withers).
router.post('/atelier/blocks/:id/finish', (req, res) => {
  const b = q.block.get(parseId(req.params.id), req.user.id);
  if (!b) throw new HttpError(404, 'Block not found');
  if (b.status !== 'running') return res.json({ id: b.id, status: b.status, minutes: b.minutes });
  const status = req.body?.status === 'gave_up' ? 'gave_up' : 'done';
  const elapsed = (Date.now() - b.started_at) / 60000;
  const minutes = Math.max(0, Math.min(b.planned, Number(req.body?.minutes) || elapsed, elapsed + 1));
  q.finishBlock.run(status, Date.now(), Math.round(minutes * 10) / 10, b.id);
  res.json({ id: b.id, status, minutes: Math.round(minutes), tree: status === 'gave_up' ? 'withered' : b.tree });
});

// Time from elsewhere (e.g. a gesture practice in Anime Hub) as a finished block.
router.post('/atelier/blocks/log', (req, res) => {
  const minutes = Math.max(1, Math.min(240, Math.round(Number(req.body?.minutes) || 0)));
  const { tree, stage } = treeFor(req.user.id);
  const end = Date.now();
  const area = C.AREA[req.body?.area] ? req.body.area : 'gesture';
  const id = Number(q.logBlock.run({ u: req.user.id, start: end - minutes * 60000, end, planned: minutes, minutes, kind: String(req.body?.kind ?? 'practice').slice(0, 20), area, tree, stage }).lastInsertRowid);
  res.status(201).json({ id, tree, minutes });
});

// ---- World, stats, review ---------------------------------------------------------------------

router.get('/atelier/world', (req, res) => res.json(stats.world(req.user.id)));

router.get('/atelier/stats', (req, res) => {
  res.json({ consistency: stats.consistency(req.user.id), skills: stats.skills(req.user.id), pace: stats.pace(req.user.id), areas: C.AREAS, stages: C.STAGES.map(({ id, title, tree, building }) => ({ id, title, tree, building })) });
});

router.get('/atelier/review', (req, res) => res.json(stats.weeklyReview(req.user.id)));

// Skill checks: status and every round so far (for "Then & now").
router.get('/atelier/checks', (req, res) => {
  const rounds = new Map();
  for (const d of q.checkRounds.all(req.user.id)) {
    if (!rounds.has(d.check_round)) rounds.set(d.check_round, { round: d.check_round, at: d.created_at, drawings: {} });
    rounds.get(d.check_round).drawings[d.exercise_id] = { id: d.id, file: fileUrl(d.file) };
  }
  res.json({ status: core.checkStatus(req.user.id), rounds: [...rounds.values()] });
});

router.get('/atelier/brief', (req, res) => res.json({ brief: C.BRIEFS[Math.floor(Math.random() * C.BRIEFS.length)] }));

// Your characters' Danbooru tags (references use them for "$character").
router.get('/atelier/characters', (req, res) => {
  res.json({ characters: q.myCharacterTags.all({ me: req.user.id }).map((r) => ({ tag: r.tag, name: r.name })) });
});

// ---- Sketchbook -------------------------------------------------------------------------------

router.get('/atelier/drawings', (req, res) => {
  const users = usersById();
  res.json({ drawings: q.myDrawings.all(req.user.id).filter((d) => d.file || d.status === 'todo').map((d) => drawingView(d, req.user.id, users)) });
});

router.get('/atelier/drawings/shared', (req, res) => {
  const users = usersById();
  const level = isSpicy(req.user.id);
  res.json({ drawings: q.sharedDrawings.all(req.user.id).filter((d) => d.adult <= level).map((d) => drawingView(d, req.user.id, users)) });
});

router.get('/atelier/drawings/:id', (req, res) => {
  const d = q.drawing.get(parseId(req.params.id));
  if (!d || (d.user_id !== req.user.id && !(d.shared && d.adult <= isSpicy(req.user.id)))) throw new HttpError(404, 'Drawing not found');
  res.json(drawingView(d, req.user.id, usersById()));
});

// Upload: the picture is the request body; details in the query string.
router.post('/atelier/drawings', raw, wrap(async (req, res) => {
  const lesson = req.query.lessonId ? C.LESSON.get(String(req.query.lessonId)) : null;
  const exercise = lesson?.exercises.find((e) => e.id === req.query.exerciseId) ?? null;
  const kind = ['drill', 'study', 'memory', 'project', 'check', 'review', 'free', 'warmup'].includes(req.query.kind) ? req.query.kind : exercise?.kind ?? 'free';
  const check = kind === 'check' ? C.SKILL_CHECK.find((c) => c.id === req.query.exerciseId) : null;
  const file = await saveImage(req.body, DRAW_DIR, `d${req.user.id}`);
  const refFile = req.query.referenceUrl ? await saveReference(req.query.referenceUrl).catch(() => null) : null;
  const id = Number(
    q.insertDrawing.run({
      u: req.user.id,
      lesson: lesson?.id ?? null,
      exercise: exercise?.id ?? check?.id ?? null,
      kind,
      skill: req.query.skill ? String(req.query.skill).slice(0, 40) : lesson?.skills[0] ?? null,
      area: C.AREA[req.query.area] ? req.query.area : check?.area ?? lesson?.area ?? null,
      title: String(req.query.title ?? exercise?.title ?? check?.title ?? '').slice(0, 120) || null,
      file,
      refFile,
      refUrl: req.query.referenceUrl ? String(req.query.referenceUrl).slice(0, 1000) : null,
      refPost: req.query.referencePost ? String(req.query.referencePost).slice(0, 500) : null,
      round: kind === 'check' ? Math.max(1, Number(req.query.round) || core.checkStatus(req.user.id).nextRound) : null,
      adult: adultLevel(lesson),
      status: 'done',
      at: Date.now(),
    }).lastInsertRowid,
  );
  res.status(201).json(drawingView(q.drawing.get(id), req.user.id, usersById()));
}));

// "Study this" from Anime Hub's Art viewer: a study waiting in your sketchbook.
router.post('/atelier/studies', wrap(async (req, res) => {
  const url = String(req.body?.referenceUrl ?? '');
  const refFile = await saveReference(url).catch(() => null);
  if (!refFile) throw new HttpError(400, 'Couldn’t load that picture.');
  const id = Number(
    q.insertDrawing.run({ u: req.user.id, lesson: null, exercise: null, kind: 'study', skill: null, area: C.AREA[req.body?.area] ? req.body.area : null, title: String(req.body?.title ?? 'Study').slice(0, 120), file: null, refFile, refUrl: url.slice(0, 1000), refPost: String(req.body?.referencePost ?? '').slice(0, 500) || null, round: null, adult: Math.max(0, Math.min(2, Number(req.body?.level) || 0)), status: 'todo', at: Date.now() }).lastInsertRowid,
  );
  res.status(201).json(drawingView(q.drawing.get(id), req.user.id, usersById()));
}));

// Upload the drawing for a waiting study.
router.post('/atelier/drawings/:id/file', raw, wrap(async (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  const file = await saveImage(req.body, DRAW_DIR, `d${req.user.id}`);
  q.setFile.run(file, Date.now(), d.id);
  res.json(drawingView(q.drawing.get(d.id), req.user.id, usersById()));
}));

router.put('/atelier/drawings/:id', (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  if (req.body?.selfScores && typeof req.body.selfScores === 'object') {
    const clean = Object.fromEntries(Object.entries(req.body.selfScores).filter(([k, v]) => /^[a-z]+$/.test(k) && Number(v) >= 1 && Number(v) <= 5).map(([k, v]) => [k, Math.round(Number(v))]));
    q.setSelf.run(JSON.stringify(clean), d.id);
    // A low self-rating brings the skill back sooner.
    const vals = Object.values(clean);
    if (vals.length && d.skill && vals.reduce((a, b) => a + b, 0) / vals.length <= 2) core.flagWeak(req.user.id, d.skill);
  }
  if (typeof req.body?.shared === 'boolean') q.setShared.run(req.body.shared ? 1 : 0, d.id);
  if (typeof req.body?.title === 'string') q.setTitle.run(req.body.title.slice(0, 120), d.id);
  if (C.AREA[req.body?.area]) db.prepare('UPDATE atelier_drawings SET area = ? WHERE id = ?').run(req.body.area, d.id);
  res.json(drawingView(q.drawing.get(d.id), req.user.id, usersById()));
});

router.delete('/atelier/drawings/:id', (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  q.deleteDrawing.run(d.id);
  for (const [dir, name] of [[DRAW_DIR, d.file], [REF_DIR, d.reference_file]]) if (name) fs.promises.unlink(path.join(dir, name)).catch(() => {});
  res.status(204).end();
});

// Files: your own, or shared ones you're allowed to see.
router.get('/atelier/file/:name', (req, res) => {
  const name = path.basename(String(req.params.name));
  if (!/^(d\d+|ref)-[0-9a-f]+\.jpg$/.test(name)) throw new HttpError(404, 'Not found');
  const row = db.prepare('SELECT user_id, shared, adult FROM atelier_drawings WHERE file = ? OR reference_file = ? LIMIT 1').get(name, name);
  if (!row || (row.user_id !== req.user.id && !(row.shared && row.adult <= isSpicy(req.user.id)))) throw new HttpError(404, 'Not found');
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(path.join(name.startsWith('ref') ? REF_DIR : DRAW_DIR, name));
});

// A Clip Studio study file (.psd) for a reference: ?ref=<url> or ?drawing=<id>.
router.get('/atelier/psd', wrap(async (req, res) => {
  let buf;
  let title = String(req.query.title ?? 'Study').slice(0, 50);
  if (req.query.drawing) {
    const d = ownDrawing(parseId(req.query.drawing), req.user.id);
    if (!d.reference_file) throw new HttpError(400, 'This drawing has no reference');
    buf = await fs.promises.readFile(path.join(REF_DIR, d.reference_file));
    title = d.title ?? title;
  } else {
    const { pictureBytes } = require('../studio');
    buf = await pictureBytes(String(req.query.ref ?? '')).catch(() => null);
    if (!buf) throw new HttpError(400, 'Couldn’t load the reference');
  }
  const psd = await studyPsd(buf, { layout: req.query.layout === 'under' ? 'under' : 'side', title });
  const safe = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'study';
  res.set('Content-Type', 'image/vnd.adobe.photoshop');
  res.set('Content-Disposition', `attachment; filename="atelier-${safe}.psd"`);
  res.send(psd);
}));

// A critique from Claude, within your monthly cap.
router.post('/atelier/drawings/:id/critique', wrap(async (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  if (!crit.available()) throw new HttpError(503, 'Critiques need an Anthropic API key on the server (ANTHROPIC_API_KEY).');
  if (!d.file) throw new HttpError(400, 'Upload your drawing first');
  const prof = core.profile(req.user.id);
  const spent = crit.spentThisMonth(req.user.id);
  if (spent >= prof.critiqueCap / 100) throw new HttpError(402, `This month’s critique budget ($${(prof.critiqueCap / 100).toFixed(2)}) is used up. Raise it in Settings if you like.`);
  const files = { drawing: await fs.promises.readFile(path.join(DRAW_DIR, d.file)) };
  if (d.reference_file) files.reference = await fs.promises.readFile(path.join(REF_DIR, d.reference_file)).catch(() => undefined);
  let selfScores = null;
  try {
    selfScores = d.self_scores ? JSON.parse(d.self_scores) : null;
  } catch {
    // ignore
  }
  let out;
  try {
    out = await crit.critique(d, files, { selfScores });
  } catch (err) {
    throw new HttpError(502, `The critique didn’t work: ${err.message}`);
  }
  q.setCritique.run(JSON.stringify(out.result), out.cost, d.id);
  // Weak scores bring the skill back tomorrow.
  const vals = Object.values(out.result.scores ?? {});
  if (vals.length && d.skill && vals.reduce((a, b) => a + b, 0) / vals.length <= 2.5) core.flagWeak(req.user.id, d.skill);
  res.json(drawingView(q.drawing.get(d.id), req.user.id, usersById()));
}));

// ---- Reminders ------------------------------------------------------------------------------

// At your planned time, a gentle reminder if you haven't drawn yet today.
function reminderTick() {
  const now = Date.now();
  for (const p of q.reminderProfiles.all()) {
    const today = core.dayKey(now, p.tz);
    if (p.last_reminded === today) continue;
    const [h, m] = p.reminder_at.split(':').map(Number);
    const t = core.localTime(now, p.tz);
    if (t.hour * 60 + t.minute < h * 60 + m) continue;
    const drawn = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM atelier_blocks WHERE user_id = ? AND started_at >= ?').get(p.user_id, core.startOfDay(now, p.tz)).m;
    q.setReminded.run(today, p.user_id);
    if (drawn > 0) continue;
    const plan = p.plan_when ? `${p.plan_when}${p.plan_where ? `, ${p.plan_where}` : ''}` : 'Your drawing time';
    notify([p.user_id], 'drawing', { title: '✏️ Time to draw', body: `${plan}: ${p.daily_minutes} minutes today. Your valley is waiting.`, url: '#/atelier', tag: 'atelier-reminder' });
  }
}
function startReminders() {
  setInterval(() => {
    try {
      reminderTick();
    } catch (err) {
      console.warn('Atelier reminders failed:', err.message);
    }
  }, 5 * 60 * 1000);
}

module.exports = { atelierRouter: router, startReminders };
