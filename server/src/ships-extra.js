// More ship features: the swipe deck, tropes, moments, the ship map, the
// ship anthem, vote history and the AO3 link.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { character } = require('./pictures');
const { usersById } = require('./users');
const activity = require('./activity');
const { notify } = require('./notify');
const { shipSummary, VOTE_LABELS, createShip, recordVoteHistory, popularPairings, signatureOf } = require('./ships');

// ---- Tropes --------------------------------------------------------------------------------

const TROPES = [
  ['Enemies to lovers', '⚔️'], ['Rivals to lovers', '🥊'], ['Friends to lovers', '🤝'], ['Childhood friends', '🧸'],
  ['Slow burn', '🕯️'], ['Grumpy × sunshine', '☀️'], ['Opposites attract', '🧲'], ['Soulmates', '🔗'],
  ['Forbidden love', '🚫'], ['Star-crossed', '🌠'], ['Tragic', '💔'], ['Second chance', '🔁'],
  ['Found family', '🏠'], ['Fake dating', '🎭'], ['Arranged marriage', '💒'], ['Bodyguard', '🛡️'],
  ['Mentor × protégé', '🎓'], ['Power couple', '👑'], ['Protective', '🫂'], ['Pining', '🥺'],
  ['Idiots in love', '🤪'], ['Tsundere', '😤'], ['Yandere', '🔪'], ['Domestic', '🍳'],
  ['Height difference', '📏'], ['Age gap', '⏳'], ['Only one bed', '🛌'],
].map(([name, emoji]) => ({ name, emoji }));
const FIXED = new Map(TROPES.map((t) => [t.name.toLowerCase(), t.name]));

// ---- Queries -----------------------------------------------------------------------------

const q = {
  ship: db.prepare('SELECT * FROM ships WHERE id = ?'),
  all: db.prepare('SELECT * FROM ships'),
  members: db.prepare('SELECT character_id, name, image, series FROM ship_members WHERE ship_id = ? ORDER BY position'),
  allMembers: db.prepare('SELECT ship_id, character_id, name, image, series FROM ship_members'),
  allVotes: db.prepare('SELECT ship_id, user_id, vote FROM ship_votes'),
  myVote: db.prepare('SELECT vote FROM ship_votes WHERE ship_id = ? AND user_id = ?'),
  votes: db.prepare('SELECT user_id, vote FROM ship_votes WHERE ship_id = ?'),
  vote: db.prepare(`
    INSERT INTO ship_votes (ship_id, user_id, vote, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (ship_id, user_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`),
  unvote: db.prepare('DELETE FROM ship_votes WHERE ship_id = ? AND user_id = ?'),
  touch: db.prepare('UPDATE ships SET updated_at = ? WHERE id = ?'),
  bySignature: db.prepare('SELECT id FROM ships WHERE signature = ?'),
  unvotedShips: db.prepare(`
    SELECT s.* FROM ships s WHERE NOT EXISTS (SELECT 1 FROM ship_votes v WHERE v.ship_id = s.id AND v.user_id = ?)
    ORDER BY s.created_at DESC LIMIT 30`),
  myCharacters: db.prepare(`
    SELECT DISTINCT e.anilist_id AS id, e.name, e.image_file, e.image_url, e.series_title
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'character' AND (l.owner_id = @me OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))`),
  pairingCache: db.prepare('SELECT character_id, data, fetched_at FROM pairing_cache'),
  tropes: db.prepare('SELECT trope FROM ship_tropes WHERE ship_id = ? ORDER BY created_at'),
  allTropes: db.prepare('SELECT trope, COUNT(*) AS n FROM ship_tropes GROUP BY trope ORDER BY n DESC'),
  clearTropes: db.prepare('DELETE FROM ship_tropes WHERE ship_id = ?'),
  addTrope: db.prepare('INSERT OR IGNORE INTO ship_tropes (ship_id, trope, added_by, created_at) VALUES (?, ?, ?, ?)'),
  moments: db.prepare('SELECT * FROM ship_moments WHERE ship_id = ? ORDER BY anime_id IS NULL, anime_title, episode IS NULL, episode, created_at'),
  moment: db.prepare('SELECT * FROM ship_moments WHERE id = ?'),
  addMoment: db.prepare(`
    INSERT INTO ship_moments (ship_id, anime_id, anime_title, episode, body, spoiler, user_id, created_at)
    VALUES (@shipId, @animeId, @animeTitle, @episode, @body, @spoiler, @userId, @now)`),
  deleteMoment: db.prepare('DELETE FROM ship_moments WHERE id = ?'),
  progress: db.prepare('SELECT status, progress FROM user_anime WHERE user_id = ? AND anime_id = ?'),
  anime: db.prepare('SELECT id, title, cover_file, cover_url FROM anime WHERE id = ?'),
  history: db.prepare('SELECT user_id, vote, created_at FROM ship_vote_history WHERE ship_id = ? ORDER BY created_at, rowid'),
  yearHistory: db.prepare(`SELECT ship_id, vote, created_at FROM ship_vote_history WHERE user_id = ? ORDER BY ship_id, created_at, rowid`),
  setAnthem: db.prepare('UPDATE ships SET anthem = ? WHERE id = ?'),
  deleteComments: db.prepare('DELETE FROM comments WHERE thread = ?'),
  deleteReactions: db.prepare('DELETE FROM reactions WHERE target = ?'),
};

function requireShip(id) {
  const row = q.ship.get(id);
  if (!row) throw new HttpError(404, 'Ship not found');
  return row;
}

// ---- Swipe deck --------------------------------------------------------------------------

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Characters whose fan pairings are being looked up in the background.
const pairingQueue = new Set();
function warmPairings(ids) {
  for (const id of ids) {
    if (pairingQueue.has(id) || pairingQueue.size >= 3) continue;
    pairingQueue.add(id);
    popularPairings(id)
      .catch(() => {})
      .finally(() => pairingQueue.delete(id));
  }
}

function deck(me) {
  const users = usersById();
  const cards = [];
  const seen = new Set();
  const voted = new Set(q.allVotes.all().filter((v) => v.user_id === me).map((v) => v.ship_id));
  const sigToShip = new Map(q.all.all().map((s) => [s.signature, s]));

  // 1. Ships someone else made that you haven't voted on yet.
  for (const row of q.unvotedShips.all(me)) {
    seen.add(row.signature);
    const s = shipSummary(row, users, me);
    cards.push({ key: `ship:${row.id}`, kind: 'ship', ship: s, reason: s.createdBy ? `${s.createdBy.username} shipped this` : 'Nobody voted yet' });
  }

  const mine = q.myCharacters.all({ me });
  const byId = new Map(mine.map((c) => [c.id, c]));
  const member = (c) => ({ id: c.id, name: c.name, image: c.image_file ? `/images/${c.image_file}` : c.image_url, series: c.series_title });
  const unvotedOrNew = (ids) => {
    const sig = signatureOf(ids);
    if (seen.has(sig)) return null;
    const existing = sigToShip.get(sig);
    if (existing && voted.has(existing.id)) return null;
    seen.add(sig);
    return existing ?? 'new';
  };

  // 2. What fans ship characters from your lists with (cached lookups).
  const cache = new Map(q.pairingCache.all().map((r) => [r.character_id, JSON.parse(r.data)]));
  const fanCards = [];
  for (const c of mine) {
    const pairs = cache.get(c.id);
    if (!pairs) continue;
    for (const p of pairs.slice(0, 3)) {
      if (!p.character?.id || p.character.id === c.id) continue;
      const ex = unvotedOrNew([c.id, p.character.id]);
      if (!ex) continue;
      if (ex !== 'new') {
        fanCards.push({ key: `ship:${ex.id}`, kind: 'ship', ship: shipSummary(ex, users, me), reason: `Fans ship them${p.count ? ` · ${p.count} pictures` : ''}` });
      } else {
        const partner = byId.get(p.character.id);
        fanCards.push({
          key: `new:${signatureOf([c.id, p.character.id])}`,
          kind: 'new',
          members: [member(c), partner ? member(partner) : { id: p.character.id, name: p.character.name, image: p.character.image, series: c.series_title }],
          fanartCount: p.count ?? null,
          status: 'fanon',
          reason: `Fans ship them${p.count ? ` · ${p.count} pictures` : ''}`,
        });
      }
    }
  }
  warmPairings(shuffle(mine.filter((c) => !cache.has(c.id)).map((c) => c.id)));

  // 3. A few random crack pairs from your lists.
  const crackCards = [];
  for (let tries = 0; tries < 30 && crackCards.length < 4 && mine.length >= 2; tries++) {
    const [a, b] = shuffle(mine).slice(0, 2);
    const ex = unvotedOrNew([a.id, b.id]);
    if (!ex) continue;
    if (ex !== 'new') crackCards.push({ key: `ship:${ex.id}`, kind: 'ship', ship: shipSummary(ex, users, me), reason: '🤡 Random pair from your lists' });
    else crackCards.push({ key: `new:${signatureOf([a.id, b.id])}`, kind: 'new', members: [member(a), member(b)], status: 'crack', reason: '🤡 Random pair from your lists' });
  }

  // Existing ships first, then fan pairings and crack pairs mixed in.
  const rest = shuffle(fanCards).slice(0, 14);
  crackCards.forEach((c, i) => rest.splice(Math.min(rest.length, 2 + i * 4), 0, c));
  return [...cards.slice(0, 12), ...rest].slice(0, 24);
}

// The other users who also ship this (vote >= 3) when you do.
function matchesFor(shipId, me) {
  const users = usersById();
  return q.votes
    .all(shipId)
    .filter((v) => v.user_id !== me && v.vote >= 3)
    .map((v) => users.get(v.user_id))
    .filter(Boolean);
}

// ---- Routes ------------------------------------------------------------------------------

const router = express.Router();

router.get('/ships/swipe', (req, res) => {
  res.json({ cards: deck(req.user.id), voteLabels: VOTE_LABELS, warming: pairingQueue.size });
});

// Swipe on a card: vote on an existing ship, or create the pairing (silently,
// with your vote; a left swipe stores 🚫 so it never comes back).
router.post('/ships/swipe', wrap(async (req, res) => {
  const me = req.user.id;
  const vote = req.body?.vote;
  if (!Number.isInteger(vote) || vote < 0 || vote > 4) throw new HttpError(400, 'Vote from 0 (No way) to 4 (OTP).');
  let shipId = req.body?.shipId ? parseId(req.body.shipId) : null;
  let created = false;
  let previousVote = null;
  if (!shipId) {
    const ids = Array.isArray(req.body?.characterIds) ? req.body.characterIds : [];
    try {
      shipId = await createShip({ characterIds: ids, status: req.body?.status === 'crack' ? 'crack' : 'fanon', user: req.user, vote, silent: true });
      created = true;
    } catch (err) {
      if (err.status === 409 && err.shipId) shipId = err.shipId;
      else throw err;
    }
  }
  const row = requireShip(shipId);
  if (!created) {
    previousVote = q.myVote.get(row.id, me)?.vote ?? null;
    q.vote.run(row.id, me, vote, Date.now());
    recordVoteHistory(row.id, me, vote);
    q.touch.run(Date.now(), row.id);
  }

  // It's a match: you both ship it (and you didn't before).
  let match = [];
  if (vote >= 3 && !(previousVote >= 3)) {
    match = matchesFor(row.id, me);
    if (match.length) {
      activity.record({ userId: me, type: 'ship_match', itemId: row.id, data: { name: row.name, with: match.map((u) => u.id) } });
      notify(
        match.map((u) => u.id),
        'ships',
        { title: `💞 It's a match: ${row.name}`, body: `You and ${req.user.username} both ship it!`, url: `#/ship/${row.id}`, tag: `match-${row.id}` },
        me,
      );
    }
  }
  res.json({ ship: shipSummary(q.ship.get(row.id), usersById(), me), created, previousVote, match });
}));

// Undo a swipe: delete the ship it created, or restore the previous vote.
router.post('/ships/swipe/undo', (req, res) => {
  const me = req.user.id;
  const row = requireShip(parseId(req.body?.shipId));
  if (req.body?.created) {
    if (row.created_by !== me) throw new HttpError(403, 'Not your ship');
    const others = q.votes.all(row.id).filter((v) => v.user_id !== me);
    if (!others.length) {
      db.transaction(() => {
        db.prepare(`DELETE FROM activities WHERE item_id = ? AND type LIKE 'ship_%'`).run(row.id);
        db.prepare('DELETE FROM ships WHERE id = ?').run(row.id);
      })();
      return res.json({ deleted: true });
    }
  }
  const prev = req.body?.previousVote;
  if (prev == null) q.unvote.run(row.id, me);
  else q.vote.run(row.id, me, prev, Date.now());
  recordVoteHistory(row.id, me, prev ?? null);
  db.prepare(`DELETE FROM activities WHERE user_id = ? AND item_id = ? AND type = 'ship_match' AND created_at > ?`).run(me, row.id, Date.now() - 60_000);
  res.json({ deleted: false });
});

// Tropes: the fixed list plus custom ones you've used.
router.get('/ship-tropes', (req, res) => {
  const used = q.allTropes.all();
  const custom = used.filter((t) => !FIXED.has(t.trope.toLowerCase())).map((t) => ({ name: t.trope, emoji: '🏷️', count: t.n }));
  const counts = Object.fromEntries(used.map((t) => [t.trope, t.n]));
  res.json({ fixed: TROPES.map((t) => ({ ...t, count: counts[t.name] ?? 0 })), custom });
});

router.put('/ships/:id/tropes', (req, res) => {
  const row = requireShip(parseId(req.params.id));
  const raw = Array.isArray(req.body?.tropes) ? req.body.tropes : [];
  const seen = new Set();
  const tropes = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const clean = t.trim().replace(/\s+/g, ' ');
    if (clean.length < 2 || clean.length > 40) continue;
    const canonical = FIXED.get(clean.toLowerCase()) ?? clean;
    if (seen.has(canonical.toLowerCase())) continue;
    seen.add(canonical.toLowerCase());
    tropes.push(canonical);
  }
  if (tropes.length > 10) throw new HttpError(400, 'At most 10 tropes per ship.');
  db.transaction(() => {
    q.clearTropes.run(row.id);
    tropes.forEach((t, i) => q.addTrope.run(row.id, t, req.user.id, Date.now() + i));
    q.touch.run(Date.now(), row.id);
  })();
  res.json({ tropes: q.tropes.all(row.id).map((t) => t.trope) });
});

// Moments, anthem, history and AO3 link for the ship page.
router.get('/ships/:id/extra', wrap(async (req, res) => {
  const me = req.user.id;
  const row = requireShip(parseId(req.params.id));
  const users = usersById();
  const members = q.members.all(row.id);

  // Anime the members appear in (for moments and the anthem).
  const memberAnime = [];
  const seenAnime = new Set();
  for (const m of members) {
    try {
      const c = await character(m.character_id);
      for (const media of c.media) {
        if (media.type !== 'ANIME' || seenAnime.has(media.id)) continue;
        seenAnime.add(media.id);
        memberAnime.push({ id: media.id, title: media.title });
      }
    } catch {
      // AniList down: moments can still be added without an anime
    }
  }

  const moments = q.moments.all(row.id).map((m) => {
    const ua = m.anime_id ? q.progress.get(me, m.anime_id) : null;
    const seenIt = ua?.status === 'watched' || (ua?.status === 'watching' && m.episode != null && (ua.progress ?? 0) >= m.episode);
    const hidden = (m.spoiler && !(ua?.status === 'watched')) || (m.episode != null && !seenIt);
    const anime = m.anime_id ? q.anime.get(m.anime_id) : null;
    const thread = `moment:${m.id}`;
    return {
      id: m.id,
      anime: m.anime_id ? { id: m.anime_id, title: anime?.title ?? m.anime_title, cover: anime ? (anime.cover_file ? `/images/${anime.cover_file}` : anime.cover_url) : null } : null,
      episode: m.episode,
      body: m.body,
      spoiler: !!m.spoiler,
      hidden,
      user: users.get(m.user_id) ?? null,
      createdAt: m.created_at,
      thread,
      commentCount: activity.commentCount(thread),
      reactions: activity.reactionSummary(thread, me),
    };
  });

  // Vote history per person: [{ vote, at }] with only the changes.
  const history = {};
  for (const h of q.history.all(row.id)) {
    const list = (history[h.user_id] ??= []);
    if (!list.length || list[list.length - 1].vote !== h.vote) list.push({ vote: h.vote, at: h.created_at });
  }
  const names = members.map((m) => m.name);
  res.json({
    memberAnime,
    moments,
    history: Object.entries(history).map(([uid, changes]) => ({ user: users.get(Number(uid)) ?? null, changes })),
    anthem: row.anthem ? JSON.parse(row.anthem) : null,
    ao3Url: `https://archiveofourown.org/works/search?work_search%5Bquery%5D=${encodeURIComponent(names.map((n) => `"${n}"`).join(' '))}&work_search%5Bsort_column%5D=kudos_count`,
  });
}));

router.post('/ships/:id/moments', (req, res) => {
  const row = requireShip(parseId(req.params.id));
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) throw new HttpError(400, 'Describe the moment first.');
  if (body.length > 500) throw new HttpError(400, 'Moments can be at most 500 characters.');
  const animeId = req.body?.animeId ? parseId(req.body.animeId) : null;
  const episode = req.body?.episode != null && req.body.episode !== '' ? Number(req.body.episode) : null;
  if (episode != null && (!Number.isInteger(episode) || episode < 0 || episode > 5000)) throw new HttpError(400, 'Invalid episode');
  const id = Number(
    q.addMoment.run({
      shipId: row.id,
      animeId,
      animeTitle: typeof req.body?.animeTitle === 'string' ? req.body.animeTitle.slice(0, 200) : null,
      episode,
      body,
      spoiler: req.body?.spoiler ? 1 : 0,
      userId: req.user.id,
      now: Date.now(),
    }).lastInsertRowid,
  );
  q.touch.run(Date.now(), row.id);
  activity.record({ userId: req.user.id, type: 'ship_moment', itemId: row.id, data: { name: row.name, momentId: id } });
  res.status(201).json({ id });
});

router.delete('/moments/:id', (req, res) => {
  const m = q.moment.get(parseId(req.params.id));
  if (!m) throw new HttpError(404, 'Not found');
  if (m.user_id !== req.user.id) throw new HttpError(403, 'You can only delete your own moments.');
  db.transaction(() => {
    q.deleteMoment.run(m.id);
    q.deleteComments.run(`moment:${m.id}`);
    q.deleteReactions.run(`moment:${m.id}`);
    db.prepare(`DELETE FROM activities WHERE type = 'ship_moment' AND json_extract(data, '$.momentId') = ?`).run(m.id);
  })();
  res.status(204).end();
});

// The ship's theme song (an opening/ending from AnimeThemes), or null.
router.put('/ships/:id/anthem', (req, res) => {
  const row = requireShip(parseId(req.params.id));
  const a = req.body?.anthem;
  if (a == null) {
    q.setAnthem.run(null, row.id);
    return res.json({ anthem: null });
  }
  let video;
  try {
    video = new URL(String(a.video));
  } catch {
    throw new HttpError(400, 'Invalid song');
  }
  if (video.protocol !== 'https:' || !/(^|\.)animethemes\.moe$/.test(video.hostname)) throw new HttpError(400, 'Invalid song');
  const anthem = {
    animeId: a.animeId ? Number(a.animeId) : null,
    animeTitle: String(a.animeTitle ?? '').slice(0, 200),
    slug: String(a.slug ?? '').slice(0, 20),
    title: String(a.title ?? '').slice(0, 200),
    artists: (Array.isArray(a.artists) ? a.artists : []).map((x) => String(x).slice(0, 100)).slice(0, 5),
    video: video.href,
    setBy: req.user.id,
  };
  q.setAnthem.run(JSON.stringify(anthem), row.id);
  res.json({ anthem });
});

// The ship map: characters as nodes, ships as edges.
router.get('/ships/map', (req, res) => {
  const me = req.user.id;
  const users = usersById();
  const ships = q.all.all();
  const membersBy = new Map();
  for (const m of q.allMembers.all()) {
    if (!membersBy.has(m.ship_id)) membersBy.set(m.ship_id, []);
    membersBy.get(m.ship_id).push(m);
  }
  const votesBy = new Map();
  for (const v of q.allVotes.all()) {
    if (!votesBy.has(v.ship_id)) votesBy.set(v.ship_id, []);
    votesBy.get(v.ship_id).push(v);
  }
  const nodes = new Map();
  const edges = [];
  for (const s of ships) {
    const ms = membersBy.get(s.id) ?? [];
    for (const m of ms) if (!nodes.has(m.character_id)) nodes.set(m.character_id, { id: m.character_id, name: m.name, image: m.image, series: m.series, ships: 0 });
    const votes = votesBy.get(s.id) ?? [];
    const values = votes.map((v) => v.vote);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const war = values.length >= 2 && Math.max(...values) - Math.min(...values) >= 2;
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        edges.push({
          shipId: s.id,
          name: s.name,
          a: ms[i].character_id,
          b: ms[j].character_id,
          status: s.status,
          avg,
          voters: values.length,
          war,
          poly: ms.length > 2,
          mine: votes.find((v) => v.user_id === me)?.vote ?? null,
          everyone: users.size > 1 && votes.length >= users.size,
        });
      }
    }
    for (const m of ms) nodes.get(m.character_id).ships += 1;
  }
  res.json({ nodes: [...nodes.values()], edges, voteLabels: VOTE_LABELS });
});

// For Wrapped: the ship whose vote went up the most this year.
function wonOver(userId, year) {
  const from = Date.UTC(year, 0, 1);
  const to = Date.UTC(year + 1, 0, 1);
  const byShip = new Map();
  for (const h of q.yearHistory.all(userId)) {
    if (!byShip.has(h.ship_id)) byShip.set(h.ship_id, []);
    byShip.get(h.ship_id).push(h);
  }
  let best = null;
  for (const [shipId, list] of byShip) {
    const before = [...list].reverse().find((h) => h.created_at < from && h.vote != null);
    const inYear = list.filter((h) => h.created_at >= from && h.created_at < to && h.vote != null);
    if (!inYear.length) continue;
    const start = before?.vote ?? inYear[0].vote;
    const end = inYear[inYear.length - 1].vote;
    if (end - start >= 2 && (!best || end - start > best.gain)) best = { shipId, from: start, to: end, gain: end - start };
  }
  if (!best) return null;
  const row = q.ship.get(best.shipId);
  return row ? { ship: shipSummary(row, usersById(), userId), from: best.from, to: best.to } : null;
}

module.exports = { shipsExtraRouter: router, TROPES, wonOver };
