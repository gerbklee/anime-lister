// Critiques pasted from Claude.ai, and skill levels from proof.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, user, database, png } = require('./helpers');

let server;
test.before(async () => {
  server = await startServer();
});
test.after(() => server.close());

test('Claude.ai critique: prompt and images out, pasted answer in', async () => {
  const u = await user(server, 'pasty');
  const d = (await u.call('POST', '/api/atelier/drawings?kind=free&title=Box', null, await png())).data;
  await u.call('PUT', `/api/atelier/drawings/${d.id}`, { area: 'form' });
  const m = await u.call('GET', `/api/atelier/drawings/${d.id}/critique/manual?level=standard`);
  assert.equal(m.status, 200);
  assert.match(m.data.prompt, /Honesty over comfort/);
  assert.match(m.data.prompt, /"industry"/);
  assert.match(m.data.prompt, /"region"/);
  assert.equal(m.data.images.length, 1);
  const img = await u.call('GET', m.data.images[0].url);
  assert.equal(img.status, 200);
  assert.ok(img.type.includes('jpeg'));

  const answer = {
    summary: 'The box reads flat: the near corner is too square.',
    works: ['Confident outer lines'],
    fixes: [{ title: 'Converge the side edges', detail: 'They run parallel; tilt them towards one vanishing point.', x: 0.4, y: 0.5 }],
    scores: { solidity: 2, construction: 3, ellipses: 2, extra: 5 },
    industry: [{ area: 'form', level: 3, why: 'Perspective errors on every box.' }, { area: 'bogus', level: 9, why: 'x' }],
    nextStep: 'Draw 20 boxes with converging edges.',
    revisitLesson: null,
    marks: [{ kind: 'region', points: [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.8 }], note: 'Parallel edges', fix: 0, severity: 'major' }],
  };
  const bad = await u.call('POST', `/api/atelier/drawings/${d.id}/critique/manual`, { level: 'standard', text: 'Sure! Here is my critique: it looks nice.' });
  assert.equal(bad.status, 400);
  const saved = await u.call('POST', `/api/atelier/drawings/${d.id}/critique/manual`, { level: 'standard', text: 'Here you go:\n```json\n' + JSON.stringify(answer) + '\n```' });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const c = saved.data.critique;
  assert.equal(c.source, 'claude.ai');
  assert.equal(c.marks[0].kind, 'region');
  assert.deepEqual(c.industry.map((r) => r.area), ['form'], 'unknown areas are dropped');
  assert.equal(c.scores.extra, undefined, 'unknown criteria are dropped');
  const other = await user(server, 'nosy');
  assert.equal((await other.call('GET', `/api/atelier/drawings/${d.id}/critique/manual`)).status, 404);
});

test('levels: proven twice, Claude.ai critiques and self-ratings do not count, portfolio reviews do', async () => {
  const u = await user(server, 'climber');
  const db = database(server);
  const uid = db.prepare("SELECT id FROM users WHERE username = 'climber'").get().id;
  const ins = db.prepare("INSERT INTO atelier_drawings (user_id, kind, status, adult, file, critique, created_at) VALUES (?, 'free', 'done', 0, 'x.jpg', ?, ?)");
  const crit = (at, industry, source = 'api') => ins.run(uid, JSON.stringify({ summary: 's', fixes: [], scores: {}, industry, source, at }), at);
  const day = 86400000;
  const t = Date.now() - 30 * day;

  let s = (await u.call('GET', '/api/atelier/skills')).data;
  assert.equal(s.overall.level, 0);
  assert.equal(s.goal, 8);
  assert.equal(s.ranks.find((r) => r.level === 8).name, 'Industry pro');

  crit(t, [{ area: 'anatomy', level: 5, why: '' }]);
  s = (await u.call('GET', '/api/atelier/skills')).data;
  assert.equal(s.areas.find((a) => a.id === 'anatomy').level, 0, 'one drawing is not proof');

  crit(t + day, [{ area: 'anatomy', level: 4, why: '' }]);
  crit(t + 2 * day, [{ area: 'anatomy', level: 9, why: '' }], 'claude.ai');
  s = (await u.call('GET', '/api/atelier/skills')).data;
  assert.equal(s.areas.find((a) => a.id === 'anatomy').level, 4, 'second-best of the last three; Claude.ai ignored');

  crit(t + 3 * day, [{ area: 'anatomy', level: 5, why: '' }, { area: 'color', level: 3, why: '' }]);
  s = (await u.call('GET', '/api/atelier/skills')).data;
  const anatomy = s.areas.find((a) => a.id === 'anatomy');
  assert.equal(anatomy.level, 5, '5, 4, 5: Lv 5 proven twice');
  assert.ok(s.levelUps.some((l) => l.area === 'anatomy' && l.to === 5));
  assert.equal(s.overall.level, 5, 'title from the only proven core skill');
  assert.ok(s.overall.unproven.some((x) => x.id === 'color'), 'colour needs a second assessment');

  db.prepare('INSERT INTO atelier_portfolio_reviews (user_id, created_at, drawings, critique) VALUES (?, ?, ?, ?)').run(uid, t + 4 * day, '[]', JSON.stringify({ scores: { drawing: 5, composition: 4, light: 3, rendering: 4, appeal: 6, consistency: 4 }, at: t + 4 * day }));
  s = (await u.call('GET', '/api/atelier/skills')).data;
  assert.equal(s.areas.find((a) => a.id === 'color').level, 3, 'portfolio review proves colour');
  assert.equal(s.overall.level, 3);
  assert.equal(s.overall.heldBackBy.id, 'color', 'held back by the weakest core skill');
  assert.ok(s.quests.length > 0);
  assert.equal(s.quests[0].area, 'color', 'the quest that raises the title comes first');
  assert.ok(s.tree.find((x) => x.id === 'anatomy').lessons.length > 3);
  db.close();
});
