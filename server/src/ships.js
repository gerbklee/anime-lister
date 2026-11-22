// Ships: 2-4 characters, shared by everyone. Each user votes on a ship
// (0 = No way … 4 = OTP), and can post headcanons. Fan art of the group comes
// from Safebooru (all members' tags), which also gives a popularity count.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { fetchAnimeCharacters } = require('./anilist');
const { cacheImage, isAllowedImageUrl } = require('./images');
const { guessTag, sbPosts, sbCount, sbCoTags, character } = require('./pictures');
const { usersById, getUser } = require('./users');
const { getCharacterTraits } = require('./traits');
const activity = require('./activity');
const { notify } = require('./notify');
const { savedImageFor } = require('./fanart');

const STATUSES = ['canon', 'fanon', 'crack'];
const VOTE_LABELS = ['🚫 No way', '🤷 Meh', '🙂 Cute', '💕 Ship it', '💍 OTP'];
const PAIRINGS_FRESH_MS = 14 * 24 * 60 * 60 * 1000;

const q = {
  ship: db.prepare('SELECT * FROM ships WHERE id = ?'),
  bySignature: db.prepare('SELECT id FROM ships WHERE signature = ?'),
  all: db.prepare('SELECT * FROM ships ORDER BY updated_at DESC'),
  forCharacter: db.prepare(`
    SELECT s.* FROM ships s JOIN ship_members m ON m.ship_id = s.id WHERE m.character_id = ? ORDER BY s.updated_at DESC`),
  members: db.prepare('SELECT * FROM ship_members WHERE ship_id = ? ORDER BY position'),
  votes: db.prepare('SELECT user_id, vote, updated_at FROM ship_votes WHERE ship_id = ?'),
  insert: db.prepare(`
    INSERT INTO ships (signature, name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`),
  insertMember: db.prepare(`
    INSERT INTO ship_members (ship_id, character_id, name, image, series, position) VALUES (?, ?, ?, ?, ?, ?)`),
  update: db.prepare('UPDATE ships SET name = @name, status = @status, updated_at = @now WHERE id = @id'),
  setCover: db.prepare('UPDATE ships SET cover_url = ?, cover_file = ?, updated_at = ? WHERE id = ?'),
  setFanart: db.prepare('UPDATE ships SET fanart_count = ?, fanart_tags = ? WHERE id = ?'),
  touch: db.prepare('UPDATE ships SET updated_at = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM ships WHERE id = ?'),
  vote: db.prepare(`
    INSERT INTO ship_votes (ship_id, user_id, vote, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (ship_id, user_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`),
  unvote: db.prepare('DELETE FROM ship_votes WHERE ship_id = ? AND user_id = ?'),
  headcanons: db.prepare('SELECT * FROM headcanons WHERE ship_id = ? ORDER BY created_at DESC'),
  headcanonCount: db.prepare('SELECT COUNT(*) AS n FROM headcanons WHERE ship_id = ?'),
  tropes: db.prepare('SELECT trope FROM ship_tropes WHERE ship_id = ? ORDER BY created_at'),
  lastHistory: db.prepare('SELECT vote FROM ship_vote_history WHERE ship_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'),
  addHistory: db.prepare('INSERT INTO ship_vote_history (ship_id, user_id, vote, created_at) VALUES (?, ?, ?, ?)'),
  headcanon: db.prepare('SELECT * FROM headcanons WHERE id = ?'),
  insertHeadcanon: db.prepare('INSERT INTO headcanons (ship_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
  deleteHeadcanon: db.prepare('DELETE FROM headcanons WHERE id = ?'),
  shipLists: db.prepare(`
    SELECT e.id AS entry_id, COALESCE((SELECT rk.position FROM rankings rk WHERE rk.entry_id = e.id AND rk.user_id = @me), e.position) AS position,
           l.id AS list_id, l.name AS list_name, l.owner_id, l.is_shared,
           (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) AS list_size
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'ship' AND e.anilist_id = @ship AND (
      l.is_shared = 0 OR l.owner_id = @me OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))`),
  removeFromLists: db.prepare(`DELETE FROM entries WHERE anilist_id = ? AND list_id IN (SELECT id FROM lists WHERE kind = 'ship')`),
  removeActivities: db.prepare(`DELETE FROM activities WHERE item_id = ? AND type IN ('ship_create', 'ship_vote')`),
  pairingCache: db.prepare('SELECT data, fetched_at FROM pairing_cache WHERE character_id = ?'),
  savePairings: db.prepare('INSERT OR REPLACE INTO pairing_cache (character_id, data, fetched_at) VALUES (?, ?, ?)'),
  shipsWithBoth: db.prepare(`
    SELECT s.id FROM ships s
    WHERE (SELECT COUNT(*) FROM ship_members m WHERE m.ship_id = s.id AND m.character_id IN (?, ?)) = 2
      AND (SELECT COUNT(*) FROM ship_members m WHERE m.ship_id = s.id) = 2`),
  userVotes: db.prepare('SELECT ship_id, vote, updated_at FROM ship_votes WHERE user_id = ?'),
};

const signatureOf = (ids) => [...ids].sort((a, b) => a - b).join('-');

function popularity(count) {
  if (count == null) return null;
  if (count < 50) return 'rarepair';
  if (count < 500) return 'known';
  return 'popular';
}

function shipSummary(row, users, me) {
  if (!row) return null;
  const members = q.members.all(row.id).map((m) => ({ id: m.character_id, name: m.name, image: m.image, series: m.series }));
  const votes = q.votes.all(row.id).map((v) => ({ user: users.get(v.user_id) ?? null, vote: v.vote }));
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    cover: row.cover_file ? `/images/${row.cover_file}` : row.cover_url ?? null,
    fanartCount: row.fanart_count,
    popularity: popularity(row.fanart_count),
    members,
    votes,
    myVote: votes.find((v) => v.user?.id === me)?.vote ?? null,
    createdBy: users.get(row.created_by) ?? null,
    headcanonCount: q.headcanonCount.get(row.id).n,
    tropes: q.tropes.all(row.id).map((t) => t.trope),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Safebooru tags of all members (null if any member has no tag).
async function memberTags(shipId) {
  const tags = [];
  for (const m of q.members.all(shipId)) {
    const c = await character(m.character_id);
    const { tag } = await guessTag(c);
    if (!tag) return null;
    tags.push(tag);
  }
  return tags;
}

// Background: count the group's fan art and pick a cover if there is none.
async function enrichShip(shipId) {
  try {
    const tags = await memberTags(shipId);
    if (!tags) {
      q.setFanart.run(0, null, shipId);
      return;
    }
    const joined = tags.join(' ');
    const count = await sbCount(joined);
    q.setFanart.run(count, JSON.stringify(tags), shipId);
    const ship = q.ship.get(shipId);
    if (!ship.cover_url && count > 0) {
      const posts = await sbPosts(joined);
      const pick = posts.find((p) => p.width && p.height && p.height >= p.width * 0.8) ?? posts[0];
      if (pick) {
        const file = await cacheImage(pick.full).catch(() => null);
        q.setCover.run(pick.full, file, Date.now(), shipId);
        syncEntries(q.ship.get(shipId));
      }
    }
  } catch (err) {
    console.warn(`Fan art for ship ${shipId} unavailable: ${err.message}`);
  }
}

// Ship-list entries copy the ship's name and cover.
const bumpShipLists = db.prepare(`
  UPDATE lists SET version = version + 1 WHERE kind = 'ship' AND id IN (SELECT list_id FROM entries WHERE anilist_id = ?)`);
function syncEntries(ship) {
  db.prepare(`UPDATE entries SET name = ?, image_file = ?, image_url = ? WHERE anilist_id = ? AND list_id IN (SELECT id FROM lists WHERE kind = 'ship')`).run(
    ship.name,
    ship.cover_file,
    ship.cover_url ?? q.members.all(ship.id)[0]?.image ?? null,
    ship.id,
  );
  bumpShipLists.run(ship.id);
}

function requireShip(id) {
  const row = q.ship.get(id);
  if (!row) throw new HttpError(404, 'Ship not found');
  return row;
}

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new HttpError(400, 'Give the ship a name.');
  if (name.length > 60) throw new HttpError(400, 'Ship names can be at most 60 characters.');
  return name;
}

// ---- Popular pairings --------------------------------------------------------------------

const nameVariants = (name) => {
  const parts = String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return [];
  return [...new Set([parts.join('_'), [...parts].reverse().join('_')])];
};

async function popularPairings(characterId) {
  const cached = q.pairingCache.get(characterId);
  if (cached && Date.now() - cached.fetched_at < PAIRINGS_FRESH_MS) return JSON.parse(cached.data);

  const c = await character(characterId);
  const { tag } = await guessTag(c);
  if (!tag) return [];
  const co = await sbCoTags(tag);
  // Sum counts per tag base, so "levi_(shingeki_no_kyojin)" matches "levi".
  const byBase = new Map();
  for (const [t, n] of co) {
    const base = t.replace(/_\(.*\)$/, '');
    byBase.set(base, (byBase.get(base) ?? 0) + n);
  }

  // Candidates: the cast of the character's best-known anime/manga.
  const media = c.media.slice(0, 2);
  const cast = new Map();
  for (const m of media) {
    for (const page of [1, 2]) {
      try {
        const { characters } = await fetchAnimeCharacters(m.id, page);
        for (const x of characters) if (x.id !== characterId && !cast.has(x.id)) cast.set(x.id, x);
      } catch {
        break;
      }
    }
  }
  const scored = [...cast.values()]
    .map((x) => ({ x, n: Math.max(0, ...nameVariants(x.name).map((v) => byBase.get(v) ?? 0)) }))
    .filter((s) => s.n >= 3)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  const out = [];
  for (const { x } of scored) {
    let count = null;
    try {
      const other = await guessTag(await character(x.id));
      if (other.tag) count = await sbCount(`${tag} ${other.tag}`);
    } catch {
      // keep null
    }
    out.push({ character: { id: x.id, name: x.name, image: x.image }, count });
  }
  out.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  q.savePairings.run(characterId, JSON.stringify(out), Date.now());
  return out;
}

// ---- Shipping type & comparison ------------------------------------------------------------

function shippingType(userId) {
  const users = usersById();
  const votes = q.userVotes.all(userId).filter((v) => v.vote >= 3);
  const ships = votes.map((v) => ({ weight: v.vote === 4 ? 1 : 0.6, ship: shipSummary(q.ship.get(v.ship_id), users, userId) })).filter((s) => s.ship);
  const total = ships.reduce((s, x) => s + x.weight, 0);
  if (!total) return { count: 0 };
  const share = (pred) => Math.round((ships.filter((x) => pred(x.ship)).reduce((s, x) => s + x.weight, 0) / total) * 100) / 100;

  let ageGap = 0, ageN = 0, heightGap = 0, heightN = 0;
  for (const { ship, weight } of ships) {
    const facts = ship.members.map((m) => getCharacterTraits(m.id)?.facts).filter(Boolean);
    const ages = facts.map((f) => f.age).filter((a) => a != null);
    const heights = facts.map((f) => f.height).filter((h) => h != null);
    if (ages.length >= 2) {
      ageGap += (Math.max(...ages) - Math.min(...ages)) * weight;
      ageN += weight;
    }
    if (heights.length >= 2) {
      heightGap += (Math.max(...heights) - Math.min(...heights)) * weight;
      heightN += weight;
    }
  }
  return {
    count: ships.length,
    otps: votes.filter((v) => v.vote === 4).length,
    status: { canon: share((s) => s.status === 'canon'), fanon: share((s) => s.status === 'fanon'), crack: share((s) => s.status === 'crack') },
    crossover: share((s) => new Set(s.members.map((m) => m.series).filter(Boolean)).size > 1),
    rarepair: share((s) => s.popularity === 'rarepair'),
    popular: share((s) => s.popularity === 'popular'),
    poly: share((s) => s.members.length > 2),
    tropes: (() => {
      const t = new Map();
      for (const { ship, weight } of ships) for (const name of ship.tropes ?? []) t.set(name, (t.get(name) ?? 0) + weight);
      return [...t.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, w]) => ({ name, share: Math.round((w / total) * 100) / 100 }));
    })(),
    ageGap: ageN ? Math.round(ageGap / ageN) : null,
    heightGap: heightN ? Math.round(heightGap / heightN) : null,
    top: ships
      .sort((a, b) => b.weight - a.weight || b.ship.updatedAt - a.ship.updatedAt)
      .slice(0, 6)
      .map((x) => x.ship),
  };
}

function compareShips(meId, otherId) {
  const users = usersById();
  const mine = new Map(q.userVotes.all(meId).map((v) => [v.ship_id, v.vote]));
  const theirs = new Map(q.userVotes.all(otherId).map((v) => [v.ship_id, v.vote]));
  const both = [...mine.keys()].filter((id) => theirs.has(id));
  const rows = both.map((id) => ({ ship: shipSummary(q.ship.get(id), users, meId), me: mine.get(id), them: theirs.get(id) }));
  const similarity = rows.length ? 1 - rows.reduce((s, r) => s + Math.abs(r.me - r.them), 0) / rows.length / 4 : null;
  const smaller = Math.min(mine.size, theirs.size);
  const overlap = smaller ? both.length / smaller : 0;
  const score = rows.length ? Math.round(100 * (0.4 * overlap + 0.6 * similarity)) : 0;
  const only = (a, b) =>
    [...a.entries()]
      .filter(([id, v]) => v >= 3 && !b.has(id))
      .map(([id, v]) => ({ ship: shipSummary(q.ship.get(id), users, meId), vote: v }))
      .filter((x) => x.ship);
  return {
    stats: { score, overlap: Math.round(overlap * 100) / 100, similarity: similarity == null ? null : Math.round(similarity * 100) / 100, both: rows.length },
    bothLove: rows.filter((r) => r.me >= 3 && r.them >= 3).sort((a, b) => b.me + b.them - (a.me + a.them)),
    wars: rows.filter((r) => Math.abs(r.me - r.them) >= 2).sort((a, b) => Math.abs(b.me - b.them) - Math.abs(a.me - a.them)),
    onlyMine: only(mine, theirs),
    onlyTheirs: only(theirs, mine),
  };
}

// ---- Wrapped & games ---------------------------------------------------------------------

const yearOf = (ms) => new Date(ms).getUTCFullYear();

// The ship a user loved most among the ones they voted on that year.
function otpOfYear(userId, year) {
  const v = q.userVotes
    .all(userId)
    .filter((x) => yearOf(x.updated_at) === year && x.vote >= 3)
    .sort((a, b) => b.vote - a.vote || b.updated_at - a.updated_at)[0];
  return v ? { ship: shipSummary(q.ship.get(v.ship_id), usersById(), userId), vote: v.vote } : null;
}

// The ship two people disagreed on most (votes from that year).
function shipFight(meId, otherId, year) {
  const theirs = new Map(q.userVotes.all(otherId).map((v) => [v.ship_id, v]));
  let best = null;
  for (const v of q.userVotes.all(meId)) {
    const t = theirs.get(v.ship_id);
    if (!t || (yearOf(v.updated_at) !== year && yearOf(t.updated_at) !== year)) continue;
    const diff = Math.abs(v.vote - t.vote);
    if (diff >= 2 && (!best || diff > best.diff)) best = { id: v.ship_id, me: v.vote, them: t.vote, diff };
  }
  return best ? { ship: shipSummary(q.ship.get(best.id), usersById(), meId), me: best.me, them: best.them } : null;
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Guess the ship: blurred fan art of a ship, pick its name.
function guessShipQuestions(count) {
  const pool = q.all.all().filter((s) => s.cover_url || s.cover_file || savedImageFor(`ship:${s.id}`));
  if (pool.length < 4) throw new HttpError(400, 'You need at least 4 ships with a cover picture for this game.');
  return shuffle(pool)
    .slice(0, count)
    .map((s) => {
      const wrong = shuffle(pool.filter((o) => o.id !== s.id)).slice(0, 3);
      const label = (x) => `${x.name} (${q.members.all(x.id).map((m) => m.name.split(' ')[0]).join(' × ')})`;
      return {
        kind: 'character',
        prompt: 'Which ship is this?',
        image: savedImageFor(`ship:${s.id}`) ?? (s.cover_file ? `/images/${s.cover_file}` : s.cover_url),
        options: shuffle([s, ...wrong]).map((o) => ({ id: o.id, label: label(o) })),
        answer: s.id,
        reveal: label(s),
      };
    });
}

// Who ships it harder? Ships both players voted on.
function shipHarderQuestions(a, b, count) {
  const users = usersById();
  const theirs = new Map(q.userVotes.all(b).map((v) => [v.ship_id, v.vote]));
  const both = q.userVotes.all(a).filter((v) => theirs.has(v.ship_id));
  if (both.length < 3) throw new HttpError(400, 'Vote on at least 3 of the same ships first (Lists → 💕 Ships).');
  const nameA = users.get(a)?.username ?? 'you';
  const nameB = users.get(b)?.username ?? 'them';
  return shuffle(both)
    .slice(0, count)
    .map((v) => {
      const s = q.ship.get(v.ship_id);
      const vb = theirs.get(v.ship_id);
      const answer = v.vote > vb ? a : vb > v.vote ? b : 0;
      return {
        kind: 'ranked',
        prompt: `Who ships ${s.name} harder?`,
        image: s.cover_file ? `/images/${s.cover_file}` : s.cover_url ?? q.members.all(s.id)[0]?.image ?? null,
        options: [
          { id: a, label: nameA },
          { id: b, label: nameB },
          { id: 0, label: 'Same vote' },
        ],
        answer,
        reveal: `${nameA}: ${VOTE_LABELS[v.vote]} · ${nameB}: ${VOTE_LABELS[vb]}`,
      };
    });
}

// ---- Routes ------------------------------------------------------------------------------

const router = express.Router();

router.get('/ships', (req, res) => {
  const users = usersById();
  const me = req.user.id;
  const rows = req.query.character ? q.forCharacter.all(parseId(req.query.character)) : q.all.all();
  let ships = rows.map((r) => shipSummary(r, users, me));
  const term = String(req.query.q ?? '').trim().toLowerCase();
  if (term) ships = ships.filter((s) => s.name.toLowerCase().includes(term) || s.members.some((m) => m.name.toLowerCase().includes(term)));
  res.json({ ships, voteLabels: VOTE_LABELS });
});

// Remembers vote changes (for "mira went 🤷 → 💍").
function recordVoteHistory(shipId, userId, vote) {
  const last = q.lastHistory.get(shipId, userId);
  if (last && last.vote === vote) return;
  q.addHistory.run(shipId, userId, vote, Date.now());
}

// Creates a ship. `silent`: no feed item / notification (ship swipes).
async function createShip({ characterIds, name, status = 'fanon', user, vote = 3, silent = false }) {
  const me = user.id;
  const ids = [...new Set(characterIds.map(Number))];
  if (ids.length < 2 || ids.length > 4 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new HttpError(400, 'A ship needs 2 to 4 different characters.');
  }
  const signature = signatureOf(ids);
  const existing = q.bySignature.get(signature);
  if (existing) {
    const err = new HttpError(409, 'This ship already exists.');
    err.shipId = existing.id;
    throw err;
  }
  const chars = [];
  for (const id of ids) chars.push(await character(id));
  const shipName = cleanName(name ?? blendNames(chars.map((c) => c.name)));
  const now = Date.now();
  const shipId = db.transaction(() => {
    const sid = Number(q.insert.run(signature, shipName, STATUSES.includes(status) ? status : 'fanon', me, now, now).lastInsertRowid);
    chars.forEach((c, i) => q.insertMember.run(sid, c.anilistId, c.name, c.image, c.media.find((m) => m.type === 'ANIME')?.title ?? c.media[0]?.title ?? null, i));
    if (vote != null) {
      q.vote.run(sid, me, vote, now);
      q.addHistory.run(sid, me, vote, now);
    }
    if (!silent) activity.record({ userId: me, type: 'ship_create', itemId: sid, data: { name: shipName } });
    return sid;
  })();
  enrichShip(shipId);
  if (!silent) {
    notify(
      [...usersById().keys()],
      'ships',
      { title: `💕 ${user.username} shipped ${shipName}`, body: chars.map((c) => c.name).join(' × '), url: `#/ship/${shipId}`, tag: `ship-${shipId}` },
      me,
    );
  }
  return shipId;
}

// Fandom-style name: each first name up to its second vowel ("NaruSasu").
function blendNames(names) {
  const syllables = (n) => {
    const vowels = [...n.matchAll(/[aeiouy]+/gi)];
    const end = vowels.length >= 2 ? vowels[1].index + vowels[1][0].length : n.length;
    const part = n.slice(0, Math.min(end, 5)).toLowerCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  };
  const first = names.map((n) => String(n).trim().split(/[\s,]+/)[0]).filter(Boolean);
  return first.length < 2 ? first[0] ?? 'Ship' : first.map(syllables).join('');
}

router.post('/ships', wrap(async (req, res) => {
  const me = req.user.id;
  const ids = Array.isArray(req.body?.characterIds) ? [...new Set(req.body.characterIds.map(Number))] : [];
  if (ids.length < 2 || ids.length > 4 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new HttpError(400, 'A ship needs 2 to 4 different characters.');
  }
  const signature = signatureOf(ids);
  const existing = q.bySignature.get(signature);
  if (existing) {
    const err = new HttpError(409, 'This ship already exists.');
    err.shipId = existing.id;
    throw err;
  }
  const status = STATUSES.includes(req.body?.status) ? req.body.status : 'fanon';
  const name = cleanName(req.body?.name);
  // Creating a ship counts as shipping it.
  const shipId = await createShip({ characterIds: ids, name, status, user: req.user, vote: 3 });
  res.status(201).json(shipSummary(q.ship.get(shipId), usersById(), me));
}));

router.get('/ships/:id', (req, res) => {
  const me = req.user.id;
  const row = requireShip(parseId(req.params.id));
  const users = usersById();
  const headcanons = q.headcanons.all(row.id).map((h) => {
    const thread = `headcanon:${h.id}`;
    return {
      id: h.id,
      user: users.get(h.user_id) ?? null,
      body: h.body,
      createdAt: h.created_at,
      thread,
      commentCount: activity.commentCount(thread),
      reactions: activity.reactionSummary(thread, me),
    };
  });
  const lists = q.shipLists.all({ ship: row.id, me }).map((r) => ({
    rank: r.position,
    list: { id: r.list_id, name: r.list_name, size: r.list_size, isShared: !!r.is_shared },
    owner: users.get(r.owner_id) ?? null,
  }));
  res.json({ ...shipSummary(row, users, me), headcanons, lists, fanartTags: row.fanart_tags ? JSON.parse(row.fanart_tags) : null, voteLabels: VOTE_LABELS });
});

// Name, status and cover can be changed by anyone (ships are shared).
router.patch('/ships/:id', wrap(async (req, res) => {
  const row = requireShip(parseId(req.params.id));
  const body = req.body ?? {};
  const name = body.name !== undefined ? cleanName(body.name) : row.name;
  const status = body.status !== undefined ? body.status : row.status;
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');
  q.update.run({ id: row.id, name, status, now: Date.now() });
  if (body.coverUrl) {
    if (!isAllowedImageUrl(body.coverUrl)) throw new HttpError(400, 'Please pick one of the suggested pictures.');
    const file = await cacheImage(body.coverUrl).catch((err) => {
      throw new HttpError(502, `Could not download that picture: ${err.message}`);
    });
    q.setCover.run(body.coverUrl, file, Date.now(), row.id);
  }
  // Keep ship-list entries in sync with the ship's name and cover.
  const fresh = q.ship.get(row.id);
  syncEntries(fresh);
  res.json(shipSummary(fresh, usersById(), req.user.id));
}));

router.delete('/ships/:id', (req, res) => {
  const row = requireShip(parseId(req.params.id));
  if (row.created_by && row.created_by !== req.user.id) throw new HttpError(403, 'Only the person who created this ship can delete it.');
  db.transaction(() => {
    bumpShipLists.run(row.id);
    q.removeFromLists.run(row.id);
    q.removeActivities.run(row.id);
    q.remove.run(row.id);
  })();
  res.status(204).end();
});

router.put('/ships/:id/vote', (req, res) => {
  const me = req.user.id;
  const row = requireShip(parseId(req.params.id));
  const vote = req.body?.vote;
  if (vote === null) {
    q.unvote.run(row.id, me);
    recordVoteHistory(row.id, me, null);
  } else {
    if (!Number.isInteger(vote) || vote < 0 || vote > 4) throw new HttpError(400, 'Vote from 0 (No way) to 4 (OTP).');
    q.vote.run(row.id, me, vote, Date.now());
    recordVoteHistory(row.id, me, vote);
    q.touch.run(Date.now(), row.id);
    activity.record({ userId: me, type: 'ship_vote', itemId: row.id, data: { vote, name: row.name } });
    if (row.created_by && row.created_by !== me) {
      notify([row.created_by], 'ships', {
        title: `${req.user.username} voted on ${row.name}`,
        body: VOTE_LABELS[vote],
        url: `#/ship/${row.id}`,
        tag: `ship-vote-${row.id}`,
      });
    }
  }
  res.json(shipSummary(q.ship.get(row.id), usersById(), me));
});

router.post('/ships/:id/headcanons', (req, res) => {
  const me = req.user.id;
  const row = requireShip(parseId(req.params.id));
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) throw new HttpError(400, 'Write something first.');
  if (body.length > 1000) throw new HttpError(400, 'Headcanons can be at most 1000 characters.');
  const id = Number(q.insertHeadcanon.run(row.id, me, body, Date.now()).lastInsertRowid);
  q.touch.run(Date.now(), row.id);
  activity.record({ userId: me, type: 'headcanon', itemId: id, data: { shipId: row.id, name: row.name } });
  notify([...usersById().keys()], 'ships', { title: `💭 ${req.user.username}'s headcanon: ${row.name}`, body, url: `#/ship/${row.id}`, tag: `hc-${id}` }, me);
  res.status(201).json({ id });
});

router.delete('/headcanons/:id', (req, res) => {
  const h = q.headcanon.get(parseId(req.params.id));
  if (!h) throw new HttpError(404, 'Not found');
  if (h.user_id !== req.user.id) throw new HttpError(403, 'You can only delete your own headcanons.');
  db.transaction(() => {
    q.deleteHeadcanon.run(h.id);
    db.prepare("DELETE FROM activities WHERE type = 'headcanon' AND item_id = ?").run(h.id);
    db.prepare('DELETE FROM comments WHERE thread = ?').run(`headcanon:${h.id}`);
  })();
  res.status(204).end();
});

router.get('/ships/:id/fanart', wrap(async (req, res) => {
  const row = requireShip(parseId(req.params.id));
  const custom = typeof req.query.tags === 'string' ? req.query.tags.trim() : '';
  const tags = custom ? custom.split(/\s+/) : row.fanart_tags ? JSON.parse(row.fanart_tags) : await memberTags(row.id);
  if (!tags?.length) return res.json({ tags: null, images: [] });
  res.json({ tags, images: await sbPosts(tags.join(' ')) });
}));

router.get('/characters/:id/pairings', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const pairings = await popularPairings(id);
  // Mark pairs that already exist as a ship.
  res.json({
    pairings: pairings.map((p) => ({ ...p, shipId: q.shipsWithBoth.get(id, p.character.id)?.id ?? null })),
  });
}));

router.get('/compare/ships', (req, res) => {
  const otherId = parseId(req.query.with);
  if (otherId === req.user.id || !getUser(otherId)) throw new HttpError(400, 'Pick someone else.');
  res.json({ me: req.user, other: getUser(otherId), ...compareShips(req.user.id, otherId) });
});

router.get('/types/:userId/ships', (req, res) => {
  const userId = parseId(req.params.userId);
  if (!getUser(userId)) throw new HttpError(404, 'User not found');
  res.json(shippingType(userId));
});

// Error handler shortcut: 409 on create carries the existing ship's id.
router.use((err, req, res, next) => {
  if (err.status === 409 && err.shipId) return res.status(409).json({ error: err.message, shipId: err.shipId });
  next(err);
});

module.exports = {
  shipsRouter: router,
  shipSummary,
  VOTE_LABELS,
  otpOfYear,
  shipFight,
  guessShipQuestions,
  shipHarderQuestions,
  createShip,
  recordVoteHistory,
  popularPairings,
  signatureOf,
};
