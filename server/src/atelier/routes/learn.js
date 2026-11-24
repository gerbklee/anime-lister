// Atelier API: your plan, the path, lessons, Today, reviews, skill checks and the Clip Studio handbook.
/* eslint-disable no-unused-vars */
const { crypto, fs, path, express, sharp, db, DATA_DIR, HttpError, wrap, parseId, isSpicy, usersById, notify, activity, C, core, stats, studyPsd, crit, lessonMedia, readClip, DRAW_DIR, REF_DIR, CLIP_DIR, LAYER_DIR, q, fileUrl, randomName, adultLevel, clipInfoOf, drawingView, ownDrawing, saveImage, saveReference, treeFor, raw } = require('../shared');

module.exports = (router) => {
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
  const prog = core.practice(req.user.id);
  const currentId = core.currentLesson(req.user.id, state, prog)?.id;
  const summary = (l) => ({
    sessions: (({ sessionsDone, sessionsNeeded }) => ({ done: sessionsDone, need: sessionsNeeded }))(core.lessonProgress(l, prog)),
    id: l.id,
    title: l.title,
    area: l.area,
    minutes: l.minutes,
    exercises: l.exercises.length,
    // "Started" only for the lesson you are on (reading ahead doesn't count).
    read: !!state.get(l.id)?.read_at && !state.get(l.id)?.done_at && (l.id === currentId || ((!!l.unit || !!l.track) && core.lessonAccess(req.user.id, l, state, prog) === "current")),
    done: !!state.get(l.id)?.done_at,
  });
  const current = core.currentLesson(req.user.id, state);
  res.json({
    currentLesson: current?.id ?? null,
    currentAdultLesson: prof.adultTrack ? C.ADULT.find((l) => core.lessonAccess(req.user.id, l, state, prog) === "current")?.id ?? null : null,
    currentStage: stage,
    stages: C.STAGES.map((s) => ({ ...s, progress: core.stageInfo(s, state, prog), lessons: C.MAIN.filter((l) => l.stage === s.id).map(summary) })),
    adult: prof.adultTrack
      ? C.ADULT_UNITS.map((u) => ({ ...u, open: u.opensWith <= stage, lessons: C.ADULT.filter((l) => l.unit === u.id).map(summary) }))
      : null,
    tracks: C.TRACKS.map((t) => ({ ...t, open: stage >= t.opensWith, current: C.TRACK_LESSONS.find((l) => l.track === t.id && core.lessonAccess(req.user.id, l, state, prog) === "current")?.id ?? null, lessons: C.TRACK_LESSONS.filter((l) => l.track === t.id).map(summary) })),
    adultAllowed: prof.adultAllowed,
    areas: C.AREAS,
  });
});

router.get('/atelier/lessons/:id', (req, res) => {
  const lesson = C.LESSON.get(req.params.id);
  const prof = core.profile(req.user.id);
  if (!lesson || (lesson.unit && !prof.adultTrack)) throw new HttpError(404, 'Lesson not found');
  const allState = core.lessonState(req.user.id);
  const state = allState.get(lesson.id);
  const prog = core.practice(req.user.id);
  const users = usersById();
  // Opening a later lesson early doesn't start it: clear an old start mark from before this rule.
  if (state?.read_at && !state.done_at && core.lessonAccess(req.user.id, lesson, allState, prog) === "future") core.clearRead(req.user.id, lesson.id);
  const drawings = q.myDrawings.all(req.user.id).filter((d) => d.lesson_id === lesson.id).map((d) => drawingView(d, req.user.id, users));
  const order = lesson.track ? C.TRACK_LESSONS.filter((l) => l.track === lesson.track) : lesson.unit ? C.ADULT : C.MAIN;
  const i = order.findIndex((l) => l.id === lesson.id);
  res.json({
    lesson,
    stage: lesson.stage != null ? C.STAGES[lesson.stage] : null,
    unit: lesson.unit ? C.ADULT_UNITS.find((u) => u.id === lesson.unit) : null,
    track: lesson.track ? C.TRACKS.find((t) => t.id === lesson.track) : null,
    area: lesson.area ? C.AREA[lesson.area] : null,

    done: !!state?.done_at,
    drawings,
    progress: core.lessonProgress(lesson, prog),
    stageProgress: lesson.stage != null ? core.stageInfo(C.STAGES[lesson.stage], allState, prog) : null,
    access: core.lessonAccess(req.user.id, lesson, allState, prog),
    locked: core.lessonAccess(req.user.id, lesson, allState, prog) === "future",
    read: !!state?.read_at && core.lessonAccess(req.user.id, lesson, allState, prog) !== "future",
    guides: lesson.cspGuides.map((g) => C.CSP_GUIDE.get(g)).filter(Boolean),
    prev: order[i - 1]?.id ?? null,
    next: order[i + 1]?.id ?? null,
  });
});

// Example media for a lesson: GIFs, videos and pictures from Wikimedia Commons,
// plus the recommended YouTube videos when a key is set.
router.get('/atelier/lessons/:id/media', wrap(async (req, res) => {
  const lesson = C.LESSON.get(req.params.id);
  if (!lesson || (lesson.unit && !core.profile(req.user.id).adultTrack)) throw new HttpError(404, 'Lesson not found');
  res.json(await lessonMedia(lesson));
}));

router.post('/atelier/lessons/:id/:action', (req, res) => {
  const lesson = C.LESSON.get(req.params.id);
  if (!lesson) throw new HttpError(404, 'Lesson not found');
  const access = core.lessonAccess(req.user.id, lesson);
  // Only the current lesson counts as started; reading ahead changes nothing.
  if (req.params.action === "read") {
    if (access === "current") core.markRead(req.user.id, lesson.id);
  } else if (req.params.action === "done") {
    if (access === "future") return res.status(409).json({ error: "Lessons go in order: finish the ones before this first." });
    const r = core.markDone(req.user.id, lesson.id);
    if (!r.ok) return res.status(409).json({ error: "This lesson still needs practice sessions.", progress: r.progress });
  }
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
  if (core.lessonAccess(req.user.id, lesson) === "future") throw new HttpError(409, "This exercise belongs to a later lesson. Lessons go in order.");
  const id = Number(
    q.insertDrawing.run({ u: req.user.id, lesson: lesson.id, exercise: exercise.id, kind: exercise.kind, skill: lesson.skills[0] ?? null, area: lesson.area, title: exercise.title, file: null, refFile: null, refUrl: null, refPost: null, round: null, adult: adultLevel(lesson), status: 'done', at: Date.now() }).lastInsertRowid,
  );
  res.status(201).json({ id });
});

// Skill checks: status and every round so far (for "Then & now").
router.get('/atelier/checks', (req, res) => {
  const rounds = new Map();
  for (const d of q.checkRounds.all(req.user.id)) {
    if (!rounds.has(d.check_round)) rounds.set(d.check_round, { round: d.check_round, at: d.created_at, drawings: {} });
    rounds.get(d.check_round).drawings[d.exercise_id] = { id: d.id, file: fileUrl(d.file) };
  }
  res.json({ status: core.checkStatus(req.user.id), rounds: [...rounds.values()] });
});

// The Clip Studio handbook, with the lessons that use each guide.
router.get('/atelier/csp', (req, res) => {
  const prof = core.profile(req.user.id);
  const visible = C.LESSONS.filter((l) => !l.unit || prof.adultTrack);
  res.json({ groups: C.CSP_GROUPS, guides: C.CSP_GUIDES.map((g) => ({ ...g, lessons: visible.filter((l) => l.cspGuides.includes(g.id)).map((l) => ({ id: l.id, title: l.title })) })) });
});

router.get('/atelier/brief', (req, res) => res.json({ brief: C.BRIEFS[Math.floor(Math.random() * C.BRIEFS.length)] }));

// Your characters' Danbooru tags (references use them for "$character").
router.get('/atelier/characters', (req, res) => {
  res.json({ characters: q.myCharacterTags.all({ me: req.user.id }).map((r) => ({ tag: r.tag, name: r.name })) });
});

};
