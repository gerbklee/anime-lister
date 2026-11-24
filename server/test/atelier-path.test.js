// The path: lessons in order, sessions on separate days, stage hours, tracks.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, user, database } = require('./helpers');

let server;
test.before(async () => {
  server = await startServer();
});
test.after(() => server.close());

test('a new user starts at the first lesson, with details and a 14-stage path', async () => {
  const u = await user(server, 'pathfinder');
  const path = await u.call('GET', '/api/atelier/path');
  assert.equal(path.status, 200);
  assert.equal(path.data.stages.length, 14);
  assert.equal(path.data.currentLesson, 's0-brushes');
  assert.equal(path.data.tracks.length, 4);
  const lesson = await u.call('GET', '/api/atelier/lessons/s0-tablet');
  assert.ok(lesson.data.lesson.method.length > 3);
  assert.ok(lesson.data.lesson.exercises.every((e) => e.steps.length && e.success.length && e.example && e.sessions));
});

test('lessons go strictly in order', async () => {
  const u = await user(server, 'inorder');
  await u.call('POST', '/api/atelier/lessons/s1-lines/read');
  const future = await u.call('GET', '/api/atelier/lessons/s1-lines');
  assert.equal(future.data.locked, true, 'later lesson is locked');
  assert.equal(future.data.read, false, 'reading ahead does not start it');
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-tablet/done')).status, 409, 'cannot finish a later lesson');
  assert.equal((await u.call('POST', '/api/atelier/exercises/done', { lessonId: 's1-lines', exerciseId: 'ghosted' })).status, 409, 'cannot practise a later lesson');
  assert.equal((await u.call('POST', '/api/atelier/lessons/s1-lines/done', { force: true })).status, 409, 'force does not skip');
  await u.call('POST', '/api/atelier/lessons/s0-brushes/read');
  assert.equal((await u.call('GET', '/api/atelier/lessons/s0-brushes')).data.access, 'current');
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-brushes/done')).status, 409, 'its exercises come first');
  await u.call('POST', '/api/atelier/exercises/done', { lessonId: 's0-brushes', exerciseId: 'kit-setup' });
  await u.call('POST', '/api/atelier/exercises/done', { lessonId: 's0-brushes', exerciseId: 'test-sheet' });
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-brushes/done')).status, 200);
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-how/done')).status, 200);
});

test('sessions count once per day, stages need their hours, then the next stage opens', async () => {
  const u = await user(server, 'walker');
  const db = database(server);
  const uid = db.prepare("SELECT id FROM users WHERE username = 'walker'").get().id;
  const ins = db.prepare("INSERT INTO atelier_drawings (user_id, lesson_id, exercise_id, kind, status, adult, created_at) VALUES (?, ?, ?, 'drill', 'done', 0, ?)");
  const sessions = (lesson, ex, n) => {
    for (let d = 1; d <= n; d++) ins.run(uid, lesson, ex, Date.now() - d * 86400000);
  };
  sessions('s0-brushes', 'kit-setup', 1);
  sessions('s0-brushes', 'test-sheet', 1);
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-brushes/done')).status, 200);
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-how/done')).status, 200);
  const refused = await u.call('POST', '/api/atelier/lessons/s0-csp/done');
  assert.equal(refused.status, 409);
  assert.equal(refused.data.progress.ready, false);
  sessions('s0-csp', 'setup', 1);
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-csp/done')).status, 200);
  await u.call('POST', '/api/atelier/exercises/done', { lessonId: 's0-tablet', exerciseId: 'pressure' });
  await u.call('POST', '/api/atelier/exercises/done', { lessonId: 's0-tablet', exerciseId: 'pressure' });
  const tablet = await u.call('GET', '/api/atelier/lessons/s0-tablet');
  assert.equal(tablet.data.progress.exercises.find((x) => x.id === 'pressure').done, 1, 'two on one day count once');
  sessions('s0-tablet', 'pressure', 4);
  sessions('s0-tablet', 'arm', 6);
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-tablet/done')).status, 200);
  db.prepare("INSERT INTO atelier_drawings (user_id, exercise_id, kind, status, adult, file, check_round, created_at) VALUES (?, 'box', 'check', 'done', 0, 'x.jpg', 1, ?)").run(uid, Date.now());
  assert.equal((await u.call('POST', '/api/atelier/lessons/s0-routine/done')).status, 200);
  let path = await u.call('GET', '/api/atelier/path');
  assert.equal(path.data.currentStage, 0, 'stage 0 waits for its hours');
  assert.equal(path.data.currentLesson, null);
  const today = await u.call('GET', '/api/atelier/today');
  assert.ok(today.data.parts.some((p) => p.id.startsWith('practice:')), 'mixed stage practice');
  for (let i = 0; i < 2; i++) await u.call('POST', '/api/atelier/blocks/log', { minutes: 120 });
  path = await u.call('GET', '/api/atelier/path');
  assert.equal(path.data.currentStage, 1);
  assert.equal(path.data.currentLesson, 's1-lines');
  const world = await u.call('GET', '/api/atelier/world');
  assert.ok(world.data.buildings.some((b) => b.id === 'campfire'));
  const stats = await u.call('GET', '/api/atelier/stats');
  assert.ok(stats.data.pace.hoursTotal > 1500);
  db.close();
});

test('today: every planned task links to its lesson and ends with open free time', async () => {
  const u = await user(server, 'today');
  for (const exerciseId of ['kit-setup', 'test-sheet']) await u.call('POST', '/api/atelier/exercises/done', { lessonId: 's0-brushes', exerciseId });
  await u.call('POST', '/api/atelier/lessons/s0-brushes/done');
  await u.call('POST', '/api/atelier/lessons/s0-how/done');
  const t = await u.call('GET', '/api/atelier/today');
  const last = t.data.parts[t.data.parts.length - 1];
  assert.equal(last.id, 'free');
  assert.equal(last.open, true);
  for (const p of t.data.parts.filter((x) => !['check', 'lesson'].includes(x.kind) && !x.open)) assert.ok(p.lessonLink && p.lessonTitle, `${p.id} links to a lesson`);
});

test('tracks are readable but locked before their stage', async () => {
  const u = await user(server, 'tracker');
  const l = await u.call('GET', '/api/atelier/lessons/cd-silhouette');
  assert.equal(l.status, 200);
  assert.equal(l.data.locked, true);
  assert.equal(l.data.track.id, 'design');
  assert.equal((await u.call('POST', '/api/atelier/exercises/done', { lessonId: 'cd-silhouette', exerciseId: 'sil-sheet' })).status, 409);
});

test('the brush kit: whole kit in the first lesson, a stage’s part in later ones', async () => {
  const u = await user(server, 'brushes');
  const first = await u.call('GET', '/api/atelier/lessons/s0-brushes');
  assert.ok(first.data.brushes.length >= 12, 'the first lesson shows the whole kit');
  assert.deepEqual(first.data.brushes.filter((b) => b.isNew).map((b) => b.id), ['su-cream', 'g-pen', 'erasers']);
  for (const b of first.data.brushes) assert.ok(b.use && b.setup.length && b.how.length && b.where, `${b.id} is explained`);
  assert.ok(first.data.brushes.filter((b) => b.asset).every((b) => /^https:\/\/assets\.clip-studio\.com\/en-us\/detail\?id=\d+$/.test(b.asset.url)));
  const face = await u.call('GET', '/api/atelier/lessons/s4-head');
  assert.ok(face.data.brushes.some((b) => b.id === 'anime-gpen' && b.isNew), 'the anime line pen opens with faces');
  const manga = (await u.call('GET', '/api/atelier/path')).data.tracks.find((t) => t.id === 'manga');
  const kit = await u.call('GET', '/api/atelier/brushes');
  assert.ok(kit.data.brushes.find((b) => b.id === 'manga-tools').tracks.includes(manga.title));
  assert.deepEqual(kit.data.brushes.find((b) => b.id === 'su-cream').stages.slice(0, 2), [0, 1]);
});
