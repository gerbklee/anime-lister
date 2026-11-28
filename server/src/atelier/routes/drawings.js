// Atelier API: the sketchbook (uploads incl. .clip files), files, study .psd files and critiques.
/* eslint-disable no-unused-vars */
const { crypto, fs, path, express, sharp, db, DATA_DIR, HttpError, wrap, parseId, isSpicy, usersById, notify, activity, C, core, stats, studyPsd, crit, lessonMedia, readClip, DRAW_DIR, REF_DIR, CLIP_DIR, LAYER_DIR, q, fileUrl, randomName, adultLevel, clipInfoOf, drawingView, ownDrawing, saveImage, saveReference, treeFor, raw } = require('../shared');

module.exports = (router) => {
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

// A .clip upload: keep the original, use its preview as the picture, save
// every raster layer as its own image, and remember the layer tree and the
// work time. Anything else is treated as a picture.
async function ingest(buf, userId) {
  if (!buf?.length) throw new HttpError(400, 'No file uploaded');
  if (buf.slice(0, 8).toString('latin1') !== 'CSFCHUNK') return { file: await saveImage(buf, DRAW_DIR, `d${userId}`), clipFile: null, clipInfo: null };
  let clip;
  try {
    clip = await readClip(buf, { layerImages: true, max: 1600 });
  } catch (err) {
    throw new HttpError(400, `Couldn’t read this Clip Studio file: ${err.message}`);
  }
  if (!clip.preview) throw new HttpError(400, 'This .clip file has no preview. Open it in Clip Studio, save it once more, and upload it again.');
  const file = await saveImage(clip.preview, DRAW_DIR, `d${userId}`);
  const clipFile = `c${userId}-${crypto.randomBytes(10).toString('hex')}.clip`;
  await fs.promises.writeFile(path.join(CLIP_DIR, clipFile), buf);
  const layers = [];
  for (const l of clip.layers) {
    let image = null;
    if (clip.images[l.id]) {
      image = `l${userId}-${crypto.randomBytes(10).toString('hex')}.webp`;
      await sharp(clip.images[l.id]).webp({ quality: 85, alphaQuality: 90 }).toFile(path.join(LAYER_DIR, image));
    }
    layers.push({ ...l, image });
  }
  return { file, clipFile, clipInfo: JSON.stringify({ width: clip.width, height: clip.height, dpi: clip.dpi, workMinutes: clip.workMinutes, layers }) };
}
const KINDS = ['drill', 'study', 'memory', 'project', 'check', 'review', 'free', 'warmup', 'piece'];

// Upload: the picture (or .clip file) is the request body; details in the query string.
router.post('/atelier/drawings', raw, wrap(async (req, res) => {
  const lesson = req.query.lessonId ? C.LESSON.get(String(req.query.lessonId)) : null;
  const exercise = lesson?.exercises.find((e) => e.id === req.query.exerciseId) ?? null;
  const kind = KINDS.includes(req.query.kind) ? req.query.kind : exercise?.kind ?? 'free';
  const check = kind === 'check' ? C.SKILL_CHECK.find((c) => c.id === req.query.exerciseId) : null;
  if (lesson && core.lessonAccess(req.user.id, lesson) === "future") throw new HttpError(409, "This exercise belongs to a later lesson. Lessons go in order.");
  const { file, clipFile, clipInfo } = await ingest(req.body, req.user.id);
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
  if (clipFile) q.setClip.run(clipFile, clipInfo, id);
  const project = req.query.projectId ? q.ownProject.get(Number(req.query.projectId), req.user.id) : null;
  if (project) q.setProject.run(project.id, id);
  res.status(201).json(drawingView(q.drawing.get(id), req.user.id, usersById()));
}));

router.get('/atelier/studio/studies', (req, res) => {
  const rows = db.prepare('SELECT * FROM atelier_drawings WHERE user_id = ? AND studio_pass IS NOT NULL ORDER BY id DESC').all(req.user.id);
  const users = usersById();
  res.json({ studies: rows.map(d => drawingView(d, req.user.id, users)) });
});

router.post('/atelier/studio/studies', raw, wrap(async (req, res) => {
  const title = String(req.query.title ?? '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, 'Enter your character’s name.');
  const refFile = await saveImage(req.body, REF_DIR, 'ref', 2400);
  let id;
  try {
    id = Number(db.prepare(`INSERT INTO atelier_drawings
      (user_id, title, kind, status, reference_file, reference_post, studio_pass, created_at)
      VALUES (?, ?, 'study', 'todo', ?, ?, 0, ?)`).run(req.user.id, title, refFile,
      /^https?:\/\//i.test(req.query.source) ? String(req.query.source).slice(0,500) : null, Date.now()).lastInsertRowid);
  } catch (err) {
    await fs.promises.unlink(path.join(REF_DIR, refFile)).catch(() => {});
    throw err;
  }
  res.status(201).json(drawingView(q.drawing.get(id), req.user.id, usersById()));
}));

router.post('/atelier/studies', wrap(async (req, res) => {
  const url = String(req.body?.referenceUrl ?? '');
  const refFile = await saveReference(url).catch(() => null);
  if (!refFile) throw new HttpError(400, 'Couldn’t load that picture.');
  const id = Number(
    q.insertDrawing.run({ u: req.user.id, lesson: null, exercise: null, kind: 'study', skill: null, area: C.AREA[req.body?.area] ? req.body.area : null, title: String(req.body?.title ?? 'Study').slice(0, 120), file: null, refFile, refUrl: url.slice(0, 1000), refPost: String(req.body?.referencePost ?? '').slice(0, 500) || null, round: null, adult: Math.max(0, Math.min(2, Number(req.body?.level) || 0)), status: 'todo', at: Date.now() }).lastInsertRowid,
  );
  res.status(201).json(drawingView(q.drawing.get(id), req.user.id, usersById()));
}));

// Upload the drawing (or .clip) for a waiting study, or replace a drawing's file.
router.post('/atelier/drawings/:id/file', raw, wrap(async (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  const { file, clipFile, clipInfo } = await ingest(req.body, req.user.id);
  removeClipFiles(d);
  q.setFile.run(file, Date.now(), d.id);
  q.setClip.run(clipFile, clipInfo, d.id);
  res.json(drawingView(q.drawing.get(d.id), req.user.id, usersById()));
}));

router.put('/atelier/drawings/:id', (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  if (req.body?.studioPass !== undefined) {
    const pass = req.body.studioPass;
    if (d.studio_pass == null || !Number.isInteger(pass) || pass < 0 || pass > 3) throw new HttpError(400, 'Unknown studio pass.');
    db.prepare('UPDATE atelier_drawings SET studio_pass = ? WHERE id = ?').run(pass, d.id);
  }
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

// Deletes a drawing's stored .clip and layer images.
function removeClipFiles(d) {
  if (d.clip_file) fs.promises.unlink(path.join(CLIP_DIR, d.clip_file)).catch(() => {});
  for (const l of clipInfoOf(d)?.layers ?? []) if (l.image) fs.promises.unlink(path.join(LAYER_DIR, l.image)).catch(() => {});
}

router.delete('/atelier/drawings/:id', (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  q.deleteDrawing.run(d.id);
  for (const [dir, name] of [[DRAW_DIR, d.file], [REF_DIR, d.reference_file]]) if (name) fs.promises.unlink(path.join(dir, name)).catch(() => {});
  removeClipFiles(d);
  res.status(204).end();
});

// Files: your own, or shared ones you're allowed to see (drawings, references, layers).
router.get('/atelier/file/:name', (req, res) => {
  const name = path.basename(String(req.params.name));
  if (!/^((d\d+|ref)-[0-9a-f]+\.jpg|l\d+-[0-9a-f]+\.webp)$/.test(name)) throw new HttpError(404, 'Not found');
  const layer = name.startsWith('l');
  const row = layer
    ? db.prepare('SELECT user_id, shared, adult FROM atelier_drawings WHERE instr(clip_info, ?) > 0 LIMIT 1').get(`"${name}"`)
    : db.prepare('SELECT user_id, shared, adult FROM atelier_drawings WHERE file = ? OR reference_file = ? LIMIT 1').get(name, name);
  if (!row || (row.user_id !== req.user.id && !(row.shared && row.adult <= isSpicy(req.user.id)))) throw new HttpError(404, 'Not found');
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(path.join(layer ? LAYER_DIR : name.startsWith('ref') ? REF_DIR : DRAW_DIR, name));
});

// The original .clip file (yours only).
router.get('/atelier/drawings/:id/clip', (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  if (!d.clip_file) throw new HttpError(404, 'No Clip Studio file for this drawing');
  const safe = (d.title ?? 'drawing').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'drawing';
  res.download(path.join(CLIP_DIR, d.clip_file), `${safe}.clip`);
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
    const { pictureBytes } = require('../../studio');
    buf = await pictureBytes(String(req.query.ref ?? '')).catch(() => null);
    if (!buf) throw new HttpError(400, 'Couldn’t load the reference');
  }
  const psd = await studyPsd(buf, { layout: req.query.layout === 'under' ? 'under' : 'side', title });
  const safe = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'study';
  res.set('Content-Type', 'image/vnd.adobe.photoshop');
  res.set('Content-Disposition', `attachment; filename="atelier-${safe}.psd"`);
  res.send(psd);
}));

// The layers worth showing a critic: construction sketch, line art and
// colour/flats first (by name, then by position), then the rest.
function pickLayers(info, max) {
  const raster = (info?.layers ?? []).filter((l) => l.image && l.kind === 'raster');
  if (!max || !raster.length) return [];
  const find = (re) => raster.find((l) => re.test(l.name));
  const picks = [];
  const add = (l) => l && !picks.includes(l) && picks.push(l);
  add(find(/sketch|skizze|rough|entwurf|construct|konstrukt|draft|gesture|pose|mannequin/i) ?? raster.find((l) => l.draft) ?? raster.find((l) => !l.visible) ?? raster[0]);
  add(find(/line|lineart|ink|linie|outline|kontur/i) ?? raster[raster.length - 1]);
  add(find(/colou?r|farbe|flat|base|fill|shade|schatten|render/i) ?? raster[Math.floor(raster.length / 2)]);
  for (const l of raster) add(l);
  return picks.slice(0, max);
}

// The files a critique looks at: the drawing, its reference and key layers.
async function critiqueInput(d, level) {
  const files = { drawing: await fs.promises.readFile(path.join(DRAW_DIR, d.file)) };
  if (d.reference_file) files.reference = await fs.promises.readFile(path.join(REF_DIR, d.reference_file)).catch(() => undefined);
  const clip = clipInfoOf(d);
  files.layers = [];
  for (const l of pickLayers(clip, crit.LEVELS[level].layers)) {
    const buf = await fs.promises.readFile(path.join(LAYER_DIR, l.image)).catch(() => null);
    if (buf) files.layers.push({ name: l.name, buf });
  }
  let selfScores = null;
  try {
    selfScores = d.self_scores ? JSON.parse(d.self_scores) : null;
  } catch {
    // ignore
  }
  return { files, opts: { selfScores, level, clip } };
}
const levelOf = (d, wanted) => (crit.LEVELS[wanted] ? wanted : crit.defaultLevel(d.kind));
// A critique was saved: weak scores bring the skill back tomorrow.
function afterCritique(userId, d, result) {
  const vals = Object.values(result.scores ?? {});
  if (vals.length && d.skill && vals.reduce((a, b) => a + b, 0) / vals.length <= 2.5) core.flagWeak(userId, d.skill);
}

// A critique from Claude, within your monthly cap. Body: { level: 'quick'|'standard'|'full' }.
router.post('/atelier/drawings/:id/critique', wrap(async (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  if (!crit.available()) throw new HttpError(503, 'Critiques need an Anthropic API key on the server (ANTHROPIC_API_KEY).');
  if (!d.file) throw new HttpError(400, 'Upload your drawing first');
  const level = levelOf(d, req.body?.level);
  const prof = core.profile(req.user.id);
  const spent = crit.spentThisMonth(req.user.id);
  if (spent >= prof.critiqueCap / 100) throw new HttpError(402, `This month’s critique budget ($${(prof.critiqueCap / 100).toFixed(2)}) is used up. Raise it in Settings if you like.`);
  const { files, opts } = await critiqueInput(d, level);
  let out;
  try {
    out = await crit.critique(d, files, opts);
  } catch (err) {
    throw new HttpError(502, `The critique didn’t work: ${err.message}`);
  }
  q.setCritique.run(JSON.stringify(out.result), out.cost, d.id);
  afterCritique(req.user.id, d, out.result);
  res.json(drawingView(q.drawing.get(d.id), req.user.id, usersById()));
}));

// Critique in Claude.ai with your own subscription: the prompt to paste, and
// the images to attach (?level=quick|standard|full).
router.get('/atelier/drawings/:id/critique/manual', wrap(async (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  if (!d.file) throw new HttpError(400, 'Upload your drawing first');
  const level = levelOf(d, req.query.level);
  const { files, opts } = await critiqueInput(d, level);
  const m = await crit.manualPrompt(d, files, opts);
  res.json({
    level: m.level,
    prompt: m.prompt,
    images: m.images.map((img, i) => ({ label: img.label, url: `/api/atelier/drawings/${d.id}/critique/manual/${i}.jpg?level=${m.level}`, name: `atelier-${d.id}-${i + 1}.jpg` })),
  });
}));
router.get('/atelier/drawings/:id/critique/manual/:n.jpg', wrap(async (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  if (!d.file) throw new HttpError(400, 'Upload your drawing first');
  const level = levelOf(d, req.query.level);
  const { files, opts } = await critiqueInput(d, level);
  const m = await crit.manualPrompt(d, files, opts);
  const img = m.images[Number(req.params.n)];
  if (!img) throw new HttpError(404, 'No such image');
  res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(img.buf);
}));
// Body: { level, text } where text is Claude.ai's answer.
router.post('/atelier/drawings/:id/critique/manual', wrap(async (req, res) => {
  const d = ownDrawing(parseId(req.params.id), req.user.id);
  if (!d.file) throw new HttpError(400, 'Upload your drawing first');
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  if (text.length > 200000) throw new HttpError(413, 'That answer is too long.');
  const level = levelOf(d, req.body?.level);
  const { files, opts } = await critiqueInput(d, level);
  let result;
  try {
    result = await crit.manualResult(d, files, opts, text);
  } catch (err) {
    throw new HttpError(400, err.message);
  }
  q.setCritique.run(JSON.stringify(result), 0, d.id);
  afterCritique(req.user.id, d, result);
  res.json(drawingView(q.drawing.get(d.id), req.user.id, usersById()));
}));

};
