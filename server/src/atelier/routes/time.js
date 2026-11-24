// Atelier API: focus blocks (the timer), the valley, stats and the weekly review.
/* eslint-disable no-unused-vars */
const { crypto, fs, path, express, sharp, db, DATA_DIR, HttpError, wrap, parseId, isSpicy, usersById, notify, activity, C, core, stats, studyPsd, crit, lessonMedia, readClip, DRAW_DIR, REF_DIR, CLIP_DIR, LAYER_DIR, q, fileUrl, randomName, adultLevel, clipInfoOf, drawingView, ownDrawing, saveImage, saveReference, treeFor, raw } = require('../shared');

module.exports = (router) => {
// ---- Focus blocks (pomodoro) ----------------------------------------------------------------

router.post('/atelier/blocks', (req, res) => {
  // Open-ended blocks (free drawing) run up to 4 hours; you stop them when you like.
  const planned = req.body?.open === true ? 240 : Math.max(1, Math.min(240, Math.round(Number(req.body?.minutes) || 25)));
  const project = req.body?.projectId ? q.ownProject.get(Number(req.body.projectId), req.user.id) : null;
  const lesson = req.body?.lessonId ? C.LESSON.get(String(req.body.lessonId)) : null;
  const area = C.AREA[req.body?.area] ? req.body.area : lesson?.area ?? null;
  const { tree, stage } = treeFor(req.user.id);
  q.staleBlocks.run(req.user.id, Date.now());
  const id = Number(
    q.insertBlock.run({ u: req.user.id, at: Date.now(), planned, kind: String(req.body?.kind ?? 'free').slice(0, 20), lesson: lesson?.id ?? null, area, tree, stage, status: 'running', project: project?.id ?? null }).lastInsertRowid,
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
  const id = Number(q.logBlock.run({ u: req.user.id, start: end - minutes * 60000, end, planned: minutes, minutes, kind: String(req.body?.kind ?? 'practice').slice(0, 20), area, tree, stage, poses: Math.max(0, Math.min(500, Math.round(Number(req.body?.poses) || 0))) || null }).lastInsertRowid);
  res.status(201).json({ id, tree, minutes });
});

// ---- World, stats, review ---------------------------------------------------------------------

router.get('/atelier/world', (req, res) => res.json(stats.world(req.user.id)));

router.get('/atelier/stats', (req, res) => {
  res.json({ consistency: stats.consistency(req.user.id), skills: stats.skills(req.user.id), pace: stats.pace(req.user.id), milestones: stats.milestones(req.user.id), portfolio: core.portfolioStatus(req.user.id), piece: core.pieceStatus(req.user.id), areas: C.AREAS, stages: C.STAGES.map(({ id, title, tree, building }) => ({ id, title, tree, building })) });
});

router.get('/atelier/review', (req, res) => res.json(stats.weeklyReview(req.user.id)));

};
