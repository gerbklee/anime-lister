// Atelier API: export, personal projects and the quarterly portfolio review.
/* eslint-disable no-unused-vars */
const { crypto, fs, path, express, sharp, db, DATA_DIR, HttpError, wrap, parseId, isSpicy, usersById, notify, activity, C, core, stats, studyPsd, crit, lessonMedia, readClip, DRAW_DIR, REF_DIR, CLIP_DIR, LAYER_DIR, q, fileUrl, randomName, adultLevel, clipInfoOf, drawingView, ownDrawing, saveImage, saveReference, treeFor, raw } = require('../shared');

module.exports = (router) => {
// ---- Export -------------------------------------------------------------------------------------

// Everything you drew, as one .tar archive.
router.get('/atelier/export', wrap(async (req, res) => {
  const { exportSketchbook } = require('../export');
  const drawings = db.prepare('SELECT * FROM atelier_drawings WHERE user_id = ? AND (file IS NOT NULL OR clip_file IS NOT NULL) ORDER BY created_at').all(req.user.id);
  const projects = db.prepare('SELECT id, title, created_at, archived FROM atelier_projects WHERE user_id = ?').all(req.user.id);
  const reviews = db.prepare('SELECT created_at, drawings, self, critique FROM atelier_portfolio_reviews WHERE user_id = ? ORDER BY created_at').all(req.user.id).map((r) => ({ date: new Date(r.created_at).toISOString(), drawings: parseJson(r.drawings), self: parseJson(r.self), critique: parseJson(r.critique) }));
  await exportSketchbook(res, { username: req.user.username, drawings, dirs: { DRAW_DIR, REF_DIR, CLIP_DIR }, lessonTitle: (id) => C.LESSON.get(id)?.title, projects, reviews });
}));

// ---- Personal projects (free drawing) ---------------------------------------------------------

const projectStats = db.prepare(`SELECT p.*,
    (SELECT COALESCE(SUM(minutes), 0) FROM atelier_blocks b WHERE b.project_id = p.id AND b.status = 'done') AS minutes,
    (SELECT COUNT(*) FROM atelier_drawings d WHERE d.project_id = p.id AND d.file IS NOT NULL) AS versions,
    (SELECT d.file FROM atelier_drawings d WHERE d.project_id = p.id AND d.file IS NOT NULL ORDER BY d.created_at DESC LIMIT 1) AS cover,
    (SELECT MAX(d.created_at) FROM atelier_drawings d WHERE d.project_id = p.id) AS updated
  FROM atelier_projects p WHERE p.user_id = ? ORDER BY p.archived, COALESCE(updated, p.created_at) DESC`);
const projectView = (p) => ({ id: p.id, title: p.title, archived: !!p.archived, createdAt: p.created_at, minutes: Math.round(p.minutes ?? 0), versions: p.versions ?? 0, cover: fileUrl(p.cover), updatedAt: p.updated ?? p.created_at });

router.get('/atelier/projects', (req, res) => res.json({ projects: projectStats.all(req.user.id).map(projectView) }));

router.post('/atelier/projects', (req, res) => {
  const title = String(req.body?.title ?? '').trim().slice(0, 80);
  if (!title) throw new HttpError(400, 'Give your project a name');
  const id = Number(db.prepare('INSERT INTO atelier_projects (user_id, title, created_at) VALUES (?, ?, ?)').run(req.user.id, title, Date.now()).lastInsertRowid);
  res.status(201).json(projectView(projectStats.all(req.user.id).find((p) => p.id === id)));
});

router.get('/atelier/projects/:id', (req, res) => {
  const p = projectStats.all(req.user.id).find((x) => x.id === parseId(req.params.id));
  if (!p) throw new HttpError(404, 'Project not found');
  const users = usersById();
  const versions = db.prepare('SELECT * FROM atelier_drawings WHERE project_id = ? AND user_id = ? AND file IS NOT NULL ORDER BY created_at').all(p.id, req.user.id).map((d) => drawingView(d, req.user.id, users));
  const sessions = db.prepare("SELECT started_at, minutes FROM atelier_blocks WHERE project_id = ? AND user_id = ? AND status = 'done' ORDER BY started_at").all(p.id, req.user.id);
  res.json({ project: projectView(p), versions, sessions: sessions.map((s) => ({ at: s.started_at, minutes: Math.round(s.minutes ?? 0) })) });
});

router.put('/atelier/projects/:id', (req, res) => {
  const p = q.ownProject.get(parseId(req.params.id), req.user.id);
  if (!p) throw new HttpError(404, 'Project not found');
  if (typeof req.body?.title === 'string' && req.body.title.trim()) db.prepare('UPDATE atelier_projects SET title = ? WHERE id = ?').run(req.body.title.trim().slice(0, 80), p.id);
  if (typeof req.body?.archived === 'boolean') db.prepare('UPDATE atelier_projects SET archived = ? WHERE id = ?').run(req.body.archived ? 1 : 0, p.id);
  res.json(projectView(projectStats.all(req.user.id).find((x) => x.id === p.id)));
});

// ---- Quarterly portfolio review ------------------------------------------------------------------

const parseJson = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
router.get('/atelier/portfolio', (req, res) => {
  const users = usersById();
  const mine = q.myDrawings.all(req.user.id).filter((d) => d.file);
  const byId = new Map(mine.map((d) => [d.id, d]));
  const reviews = db.prepare('SELECT * FROM atelier_portfolio_reviews WHERE user_id = ? ORDER BY created_at').all(req.user.id).map((r) => ({
    id: r.id,
    at: r.created_at,
    self: parseJson(r.self),
    critique: parseJson(r.critique),
    drawings: (parseJson(r.drawings) ?? []).map((id) => byId.get(id)).filter(Boolean).map((d) => ({ id: d.id, title: d.title, file: fileUrl(d.file) })),
  }));
  // Finished pieces and projects first, then everything else (newest first).
  const rank = (d) => (['piece', 'project'].includes(d.kind) ? 0 : d.kind === 'study' ? 1 : 2);
  const candidates = [...mine].sort((a, b) => rank(a) - rank(b) || b.created_at - a.created_at).slice(0, 80).map((d) => drawingView(d, req.user.id, users));
  res.json({ status: core.portfolioStatus(req.user.id), rubric: crit.PRO_RUBRIC, levels: crit.PRO_LEVELS, reviews, candidates, critiqueAvailable: crit.available() });
});

// Saves a review: 3–5 of your drawings, your 1–10 ratings, and optionally a critique of the set.
router.post('/atelier/portfolio', wrap(async (req, res) => {
  const ids = [...new Set((req.body?.drawingIds ?? []).map(Number))].slice(0, 5);
  const pieces = ids.map((id) => q.drawing.get(id)).filter((d) => d && d.user_id === req.user.id && d.file);
  if (pieces.length < 3) throw new HttpError(400, 'Pick 3 to 5 of your finished drawings.');
  const self = Object.fromEntries(crit.PRO_RUBRIC.map((c) => [c.id, Math.max(1, Math.min(10, Math.round(Number(req.body?.self?.[c.id]) || 0)))]).filter(([, v]) => v));
  let critique = null;
  let cost = 0;
  if (req.body?.critique === true) {
    if (!crit.available()) throw new HttpError(503, 'Critiques need an Anthropic API key on the server (ANTHROPIC_API_KEY).');
    const prof = core.profile(req.user.id);
    if (crit.spentThisMonth(req.user.id) >= prof.critiqueCap / 100) throw new HttpError(402, 'This month’s critique budget is used up. Raise it in Settings if you like.');
    try {
      const out = await crit.portfolioCritique(await Promise.all(pieces.map(async (d) => ({ title: d.title, buf: await fs.promises.readFile(path.join(DRAW_DIR, d.file)) }))));
      critique = out.result;
      cost = out.cost;
    } catch (err) {
      throw new HttpError(502, `The review didn’t work: ${err.message}`);
    }
  }
  const id = Number(db.prepare('INSERT INTO atelier_portfolio_reviews (user_id, created_at, drawings, self, critique, cost) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, Date.now(), JSON.stringify(pieces.map((d) => d.id)), JSON.stringify(self), critique ? JSON.stringify(critique) : null, cost).lastInsertRowid);
  res.status(201).json({ id, critique });
}));

};
