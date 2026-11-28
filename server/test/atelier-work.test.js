// Drawings, focus blocks, projects, milestones, portfolio review, export,
// and (with a sample file) Clip Studio uploads.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { startServer, user, png } = require('./helpers');

let server;
test.before(async () => {
  server = await startServer();
});
test.after(() => server.close());

test('upload, self-rating, sharing, files and deletion', async () => {
  const u = await user(server, 'sketcher');
  const up = await u.call('POST', '/api/atelier/drawings?kind=free&title=Test', null, await png());
  assert.equal(up.status, 201);
  const id = up.data.id;
  const put = await u.call('PUT', `/api/atelier/drawings/${id}`, { area: 'form', selfScores: { solidity: 3, construction: 2, ellipses: 3 }, shared: true });
  assert.equal(put.data.selfScores.construction, 2);
  assert.equal(put.data.shared, true);
  const file = await u.call('GET', put.data.file);
  assert.equal(file.status, 200);
  assert.ok(file.type.includes('jpeg'));
  const other = await user(server, 'friend');
  assert.equal((await other.call('GET', `/api/atelier/drawings/${id}`)).status, 200, 'shared drawings are visible to friends');
  assert.equal((await other.call('PUT', `/api/atelier/drawings/${id}`, { title: 'x' })).status, 404, 'but not editable');
  const crit = await u.call('POST', `/api/atelier/drawings/${id}/critique`, { level: 'full' });
  assert.equal(crit.status, 503, 'critiques need a key');
  assert.equal((await u.call('DELETE', `/api/atelier/drawings/${id}`)).status, 204);
  assert.equal((await u.call('GET', put.data.file)).status, 404);
  const broken = await u.call('POST', '/api/atelier/drawings?kind=free', null, Buffer.from('CSFCHUNK but not really a clip file'));
  assert.equal(broken.status, 400);
});

test('focus blocks: done, given up (withered), open-ended, logged practice with poses', async () => {
  const u = await user(server, 'focus');
  const b = await u.call('POST', '/api/atelier/blocks', { minutes: 25, kind: 'free' });
  assert.equal(b.status, 201);
  assert.equal((await u.call('POST', `/api/atelier/blocks/${b.data.id}/finish`, { status: 'gave_up' })).data.tree, 'withered');
  const open = await u.call('POST', '/api/atelier/blocks', { open: true, kind: 'free' });
  assert.equal(open.data.planned, 240);
  await u.call('POST', '/api/atelier/blocks/log', { minutes: 30, kind: 'practice', area: 'gesture', poses: 120 });
  const stats = await u.call('GET', '/api/atelier/stats');
  const poses = stats.data.milestones.find((m) => m.id === 'poses');
  assert.equal(poses.value, 120);
  assert.equal(poses.reached, 1);
  const world = await u.call('GET', '/api/atelier/world');
  assert.ok(world.data.landmarks.some((l) => l.kind === 'torii'));
  assert.ok(world.data.trees.some((t) => t.tree === 'withered'));
});

test('personal projects: versions, time, privacy', async () => {
  const u = await user(server, 'projector');
  const p = await u.call('POST', '/api/atelier/projects', { title: 'Fan art' });
  assert.equal(p.status, 201);
  const b = await u.call('POST', '/api/atelier/blocks', { open: true, kind: 'free', projectId: p.data.id });
  await u.call('POST', `/api/atelier/blocks/${b.data.id}/finish`, { status: 'done', minutes: 1 });
  for (let i = 0; i < 2; i++) await u.call('POST', `/api/atelier/drawings?kind=free&projectId=${p.data.id}&title=v${i + 1}`, null, await png());
  const detail = await u.call('GET', `/api/atelier/projects/${p.data.id}`);
  assert.equal(detail.data.versions.length, 2);
  assert.equal(detail.data.sessions.length, 1);
  const other = await user(server, 'snoop');
  assert.equal((await other.call('GET', `/api/atelier/projects/${p.data.id}`)).status, 404);
});

test('portfolio review: due with 3 pieces, saved, next one in 3 months', async () => {
  const u = await user(server, 'portfolio');
  assert.equal((await u.call('GET', '/api/atelier/portfolio')).data.status.due, false);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await u.call('POST', `/api/atelier/drawings?kind=piece&title=P${i}`, null, await png())).data.id);
  assert.equal((await u.call('GET', '/api/atelier/portfolio')).data.status.due, true);
  const save = await u.call('POST', '/api/atelier/portfolio', { drawingIds: ids, self: { drawing: 4, composition: 3, light: 4, rendering: 3, appeal: 5, consistency: 4 } });
  assert.equal(save.status, 201);
  const after = await u.call('GET', '/api/atelier/portfolio');
  assert.equal(after.data.reviews.length, 1);
  assert.equal(after.data.status.due, false);
});

test('export: a valid tar with drawings and an index', async () => {
  const u = await user(server, 'exporter');
  await u.call('POST', '/api/atelier/drawings?kind=free&title=Export%20me', null, await png());
  const r = await u.call('GET', '/api/atelier/export');
  assert.equal(r.status, 200);
  assert.ok(r.type.includes('tar'));
  const buf = r.data;
  assert.equal(buf.length % 512, 0, 'tar is made of 512-byte blocks');
  const names = [];
  for (let off = 0; off + 512 <= buf.length; ) {
    const name = buf.slice(off, off + 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const prefix = buf.slice(off + 345, off + 500).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(buf.slice(off + 124, off + 136).toString('utf8'), 8);
    names.push(prefix ? `${prefix}/${name}` : name);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  assert.ok(names.some((n) => /\/drawings\/.*Export-me\.jpg$/.test(n)), names.join(', '));
  assert.ok(names.some((n) => n.endsWith('/index.csv')));
});

// Clip Studio files: set CLIP_SAMPLE to a .clip file to run this one.
test('Clip Studio upload (needs CLIP_SAMPLE)', { skip: !process.env.CLIP_SAMPLE }, async () => {
  const u = await user(server, 'clipper');
  const clip = fs.readFileSync(process.env.CLIP_SAMPLE);
  const up = await u.call('POST', '/api/atelier/drawings?kind=free', null, clip);
  assert.equal(up.status, 201);
  assert.ok(up.data.clip.layers.length > 0);
  const dl = await u.call('GET', `/api/atelier/drawings/${up.data.id}/clip`);
  assert.equal(dl.data.length, clip.length);
});

test('a studio study keeps its reference and saved pass when the finished artwork arrives', async () => {
  const artist = await user(server, 'studio-artist');
  const other = await user(server, 'studio-neighbour');
  const picture = await png();
  const started = await artist.call('POST', '/api/atelier/studio/studies?title=First%20character', null, picture);
  assert.equal(started.status, 201);
  const {id, reference} = started.data;
  assert.ok(reference);
  const route = '/api/atelier/drawings/' + id;
  assert.equal((await other.call('GET', reference)).status, 404);
  assert.equal((await other.call('PUT', route, {studioPass: 1})).status, 404);
  assert.equal((await artist.call('PUT', route, {studioPass: 4})).status, 400);
  await artist.call('PUT', route, {studioPass: 2});
  assert.equal((await artist.call('GET', '/api/atelier/studio/studies')).data.studies[0].studioPass, 2);
  const finished = await artist.call('POST', route + '/file', null, picture);
  assert.equal(finished.data.reference, reference);
  assert.equal(finished.data.status, 'done');
  assert.ok(finished.data.file);
  assert.deepEqual((await other.call('GET', '/api/atelier/studio/studies')).data.studies, []);
});
