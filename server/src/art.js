// The Art area: search by tags/colour, "more like this", boards (personal,
// can be shared), wallpapers, followed artists, art of the day, "for you",
// trending, and "What is this?" (reverse image search via IQDB).
//
// Searches use Danbooru (work-safe only). It allows 2 search terms (order:score
// counts as one, rating:g is free), so the rarest term goes to Danbooru and
// the rest are checked here against each picture's own tags.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { db, IMAGE_DIR } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { cacheImage, isAllowedImageUrl, removeImageIfUnused, cropImage, cleanCrop } = require('./images');
const { usersById, getUser } = require('./users');
const { notify } = require('./notify');
const fanart = require('./fanart');
const { isSpicy, allAdults } = require('./adult');

const COLOURS = {
  red: 'red_theme', orange: 'orange_theme', yellow: 'yellow_theme', green: 'green_theme', blue: 'blue_theme',
  purple: 'purple_theme', pink: 'pink_theme', black: 'black_theme', white: 'white_theme', pastel: 'pastel_colors',
};
const CATEGORY = { 0: 'tag', 1: 'artist', 3: 'series', 4: 'character' };
const GENERIC = new Set(['solo', '1girl', '1boy', '2girls', '2boys', 'multiple_girls', 'multiple_boys', 'highres', 'absurdres', 'looking_at_viewer', 'simple_background', 'white_background', 'upper_body', 'commentary', 'commentary_request', 'translated', 'english_commentary', 'artist_name', 'signature', 'twitter_username', 'male_focus', 'female_focus']);
const PAGE = 60;
const FIELDS = `${fanart.DB_FIELDS},tag_string`;

const cache = fanart.memo(30 * 60 * 1000, 400);
const forYouCache = fanart.memo(3 * 3600 * 1000, 20);
const forYouFresh = new Map(); // user -> time of last (re)build
const longCache = fanart.memo(3 * 3600 * 1000, 200);

const q = {
  shipsByName: db.prepare(`SELECT id, name FROM ships WHERE name LIKE @q OR EXISTS (SELECT 1 FROM ship_members m WHERE m.ship_id = ships.id AND m.name LIKE @q) LIMIT 4`),
  shipMembers: db.prepare('SELECT character_id FROM ship_members WHERE ship_id = ? ORDER BY position'),
  boardsFor: db.prepare(`
    SELECT b.* FROM art_boards b
    WHERE b.owner_id = @me OR EXISTS (SELECT 1 FROM art_board_members m WHERE m.board_id = b.id AND m.user_id = @me)
    ORDER BY b.updated_at DESC`),
  board: db.prepare('SELECT * FROM art_boards WHERE id = ?'),
  members: db.prepare('SELECT user_id FROM art_board_members WHERE board_id = ?'),
  isMember: db.prepare('SELECT 1 FROM art_board_members WHERE board_id = ? AND user_id = ?'),
  addMember: db.prepare('INSERT OR IGNORE INTO art_board_members (board_id, user_id) VALUES (?, ?)'),
  removeMember: db.prepare('DELETE FROM art_board_members WHERE board_id = ? AND user_id = ?'),
  userByName: db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE'),
  insertBoard: db.prepare('INSERT INTO art_boards (name, emoji, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
  updateBoard: db.prepare('UPDATE art_boards SET name = ?, emoji = ?, updated_at = ? WHERE id = ?'),
  touchBoard: db.prepare('UPDATE art_boards SET updated_at = ? WHERE id = ?'),
  deleteBoard: db.prepare('DELETE FROM art_boards WHERE id = ?'),
  items: db.prepare('SELECT * FROM art_board_items WHERE board_id = ? ORDER BY created_at DESC'),
  item: db.prepare('SELECT * FROM art_board_items WHERE id = ?'),
  itemByPost: db.prepare('SELECT * FROM art_board_items WHERE board_id = ? AND source = ? AND post_id = ?'),
  covers: db.prepare('SELECT thumb_file, thumb_url, source FROM art_board_items WHERE board_id = ? AND spicy <= ? ORDER BY created_at DESC LIMIT 4'),
  count: db.prepare('SELECT COUNT(*) AS n FROM art_board_items WHERE board_id = ? AND spicy <= ?'),
  insertItem: db.prepare(`
    INSERT INTO art_board_items (board_id, source, post_id, image_url, thumb_url, image_file, thumb_file, source_url, post_url, artist, width, height, added_by, created_at, spicy)
    VALUES (@boardId, @source, @postId, @imageUrl, @thumbUrl, @imageFile, @thumbFile, @sourceUrl, @postUrl, @artist, @width, @height, @addedBy, @now, @spicy)`),
  deleteItem: db.prepare('DELETE FROM art_board_items WHERE id = ?'),
  boardFiles: db.prepare('SELECT image_file, thumb_file FROM art_board_items WHERE board_id = ?'),
  boardsWithPost: db.prepare(`
    SELECT i.board_id FROM art_board_items i JOIN art_boards b ON b.id = i.board_id
    WHERE i.source = @source AND i.post_id = @postId AND (b.owner_id = @me OR EXISTS (SELECT 1 FROM art_board_members m WHERE m.board_id = b.id AND m.user_id = @me))`),
  follows: db.prepare('SELECT * FROM art_follows WHERE user_id = ? ORDER BY created_at DESC'),
  allFollows: db.prepare('SELECT * FROM art_follows'),
  follow: db.prepare('INSERT OR IGNORE INTO art_follows (user_id, artist, name, last_seen, created_at) VALUES (?, ?, ?, ?, ?)'),
  unfollow: db.prepare('DELETE FROM art_follows WHERE user_id = ? AND artist = ?'),
  setSeen: db.prepare('UPDATE art_follows SET last_seen = ? WHERE user_id = ? AND artist = ?'),
  daily: db.prepare('SELECT * FROM art_daily WHERE day = ?'),
  latestDaily: db.prepare('SELECT * FROM art_daily ORDER BY day DESC LIMIT 1'),
  recentDaily: db.prepare('SELECT data FROM art_daily ORDER BY day DESC LIMIT 90'),
  saveDaily: db.prepare('INSERT OR REPLACE INTO art_daily (day, data, created_at) VALUES (?, ?, ?)'),
  listCharacters: db.prepare(`
    SELECT e.anilist_id AS id, MIN(COALESCE((SELECT rk.position FROM rankings rk WHERE rk.entry_id = e.id AND rk.user_id = @me), e.position)) AS pos
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'character' AND (@me IS NULL OR l.owner_id = @me OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))
    GROUP BY e.anilist_id ORDER BY pos LIMIT 40`),
  lovedShips: db.prepare('SELECT ship_id FROM ship_votes WHERE (@me IS NULL OR user_id = @me) AND vote >= 3 GROUP BY ship_id'),
  savedKeys: db.prepare('SELECT source, post_id FROM fanart_saved'),
  watching: db.prepare(`
    SELECT a.id, a.title, a.title_romaji FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
    WHERE ua.user_id = ? AND a.type = 'ANIME' AND ua.status IN ('watching', 'watched')
    ORDER BY ua.status = 'watching' DESC, ua.updated_at DESC LIMIT 4`),
  tagCache: db.prepare('SELECT tag, fetched_at FROM fanart_tags WHERE character_id = ? AND source = ?'),
  saveTag: db.prepare('INSERT OR REPLACE INTO fanart_tags (character_id, source, tag, post_count, fetched_at) VALUES (?, ?, ?, ?, ?)'),
};

// ---- Danbooru helpers --------------------------------------------------------------------

const toItem = (p) => {
  const item = fanart.fromDanbooru(p);
  if (!item) return null;
  item.all = new Set(String(p.tag_string ?? '').split(' '));
  return item;
};

const fetchPosts = (tags, page = 1, limit = 200) =>
  cache(`p|${tags}|${page}|${limit}`, () =>
    fanart.danbooru(`/posts.json?limit=${limit}&page=${page}&only=${FIELDS}&tags=${encodeURIComponent(tags)}`).then((rows) =>
      (Array.isArray(rows) ? rows : []).map(toItem).filter(Boolean),
    ),
  );

async function tagCounts(tags) {
  if (!tags.length) return new Map();
  const rows = await cache(`c|${[...tags].sort().join(',')}`, () =>
    fanart.danbooru(`/tags.json?limit=100&only=name,post_count&search%5Bname_comma%5D=${encodeURIComponent(tags.join(','))}`),
  );
  return new Map((Array.isArray(rows) ? rows : []).map((r) => [r.name, r.post_count]));
}

const strip = (item) => {
  const { all, ...rest } = item;
  return fanart.publicItem(rest);
};

function filterItems(items, { shape, quality, solo }) {
  return items.filter((i) => {
    if (!fanart.goodQuality(i, { solo })) return false;
    const w = i.width ?? 0;
    const h = i.height ?? 0;
    if (shape === 'portrait' && !(h > w * 1.15)) return false;
    if (shape === 'landscape' && !(w > h * 1.15)) return false;
    if (shape === 'phone' && !(h >= w * 1.6 && h >= 1500)) return false;
    if (quality === 'hd' && Math.max(w, h) < 1500) return false;
    if (quality === '4k' && Math.max(w, h) < 3500) return false;
    return true;
  });
}

// Search Danbooru for pictures with all `tags`. Returns sorted items (with `all`).
// With spicy art on, the general-only results are merged in too, so pictures
// that fail the adults-only check never leave a search empty.
async function searchTags(tags, opts = {}) {
  if (!opts.spicy) return searchTagsOnce(tags, opts);
  const [spicyRes, safeRes] = await Promise.all([searchTagsOnce(tags, opts), searchTagsOnce(tags, { ...opts, spicy: false })]);
  const seen = new Map();
  for (const i of [...spicyRes.items, ...safeRes.items]) if (!seen.has(i.id)) seen.set(i.id, i);
  const merged = [...seen.values()].sort((a, b) => (opts.sort === 'new' ? Number(b.id) - Number(a.id) : b.score - a.score));
  return { items: merged, hasMore: spicyRes.hasMore || safeRes.hasMore };
}

async function searchTagsOnce(tags, { sort = 'best', page = 1, spicy = false } = {}) {
  const R = fanart.ratingFor(spicy);
  const allowed = fanart.spicyFilter(spicy);
  const uniq = [...new Set(tags.filter(Boolean))];
  if (!uniq.length) throw new HttpError(400, 'Search for something first.');
  const counts = await tagCounts(uniq);
  const known = uniq.filter((t) => counts.has(t));
  if (!known.length) return { items: [], hasMore: false };
  const ordered = [...known].sort((a, b) => counts.get(a) - counts.get(b));
  const hasAll = (i) => ordered.every((t) => i.all.has(t));

  // One term: page straight through Danbooru.
  if (ordered.length === 1 || (ordered.length === 2 && sort === 'new')) {
    const raw = await fetchPosts(`${ordered.join(' ')} ${R}${sort === 'best' ? ' order:score' : ''}`, page);
    return { items: raw.filter(allowed), hasMore: raw.length >= 150 };
  }

  // Several terms: build a pool once (cached), filter locally, page through it.
  const pool = await longCache(`pool|${ordered.join(' ')}|${sort}|${R}`, async () => {
    const seen = new Map();
    const add = (list) => list.filter((i) => hasAll(i) && allowed(i)).forEach((i) => !seen.has(i.id) && seen.set(i.id, i));
    if (sort === 'best') {
      for (let p = 1; p <= 3; p++) {
        const raw = await fetchPosts(`${ordered[0]} ${R} order:score`, p);
        add(raw);
        if (raw.length < 150 || seen.size >= 200) break;
      }
    }
    if (sort !== 'best' || seen.size < 40) {
      for (let p = 1; p <= 3; p++) {
        const raw = await fetchPosts(`${ordered[0]} ${ordered[1]} ${R}`, p);
        add(raw);
        if (raw.length < 150) break;
      }
    }
    const list = [...seen.values()];
    return sort === 'best' ? list.sort((a, b) => b.score - a.score) : list.sort((a, b) => Number(b.id) - Number(a.id));
  });
  const start = (page - 1) * PAGE;
  return { items: pool.slice(start, start + PAGE), hasMore: pool.length > start + PAGE };
}

// Chips can name ships ("ship:12"); they expand to the members' tags.
async function expandTags(raw) {
  const out = [];
  for (const t of raw) {
    const m = String(t).match(/^ship:(\d+)$/);
    if (!m) {
      if (/^[^\s,]{1,80}$/.test(t)) out.push(t);
      continue;
    }
    for (const r of q.shipMembers.all(Number(m[1]))) {
      const tag = await fanart.danbooruTag(r.character_id).catch(() => null);
      if (tag) out.push(tag.tag);
    }
  }
  return out;
}

function markSaved(items, me) {
  const hidden = fanart.hiddenKeys();
  const saved = new Set(q.savedKeys.all().map((r) => `${r.source}:${r.post_id}`));
  return items
    .filter((i) => !hidden.has(`${i.source}:${i.id}`))
    .map((i) => ({ ...strip(i), inGallery: saved.has(`${i.source}:${i.id}`) }));
}

// ---- Boards -------------------------------------------------------------------------------

function boardAccess(id, me) {
  const b = q.board.get(id);
  if (!b) throw new HttpError(404, 'Board not found');
  const isOwner = b.owner_id === me;
  if (!isOwner && !q.isMember.get(b.id, me)) throw new HttpError(404, 'Board not found');
  return { board: b, isOwner };
}

const fileUrl = (file, remote, source) => (file ? `/images/${file}` : source === 'danbooru' ? fanart.proxied(remote) : remote);

function boardView(b, me, users) {
  const members = q.members.all(b.id).map((m) => users.get(m.user_id)).filter(Boolean);
  const spicyOn = isSpicy(me);
  return {
    id: b.id,
    name: b.name,
    emoji: b.emoji,
    owner: users.get(b.owner_id) ?? null,
    isOwner: b.owner_id === me,
    members,
    isShared: members.length > 0,
    count: q.count.get(b.id, spicyOn).n,
    covers: q.covers.all(b.id, spicyOn).map((c) => fileUrl(c.thumb_file, c.thumb_url, c.source)),
    updatedAt: b.updated_at,
  };
}

function itemView(r, users) {
  return {
    itemId: r.id,
    source: r.source,
    id: r.post_id,
    thumb: fileUrl(r.thumb_file, r.thumb_url, r.source),
    full: fileUrl(r.image_file, r.image_url, r.source),
    remoteUrl: r.image_url,
    sourceUrl: r.source_url,
    postUrl: r.post_url,
    artist: r.artist,
    width: r.width,
    height: r.height,
    addedBy: users.get(r.added_by) ?? null,
    savedBy: users.get(r.added_by) ?? null,
    addedAt: r.created_at,
    spicy: r.spicy || 0,
  };
}

function cleanBoardName(v) {
  const name = typeof v === 'string' ? v.trim() : '';
  if (!name || name.length > 60) throw new HttpError(400, 'Give the board a name (up to 60 characters).');
  return name;
}

// ---- For you / trending / daily ---------------------------------------------------------

async function subjectsFor(me) {
  const chars = q.listCharacters.all({ me }).map((r) => `character:${r.id}`);
  const ships = q.lovedShips.all({ me }).map((r) => `ship:${r.ship_id}`);
  return { chars, ships };
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function forYou(me) {
  const spicy = isSpicy(me);
  return forYouCache(`foryou|${me}|${spicy}`, async () => {
    forYouFresh.set(me, Date.now());
    const { chars, ships } = await subjectsFor(me);
    // Favour higher-ranked characters, with some variety.
    const picks = [...shuffle(chars.slice(0, 12)).slice(0, 5), ...shuffle(ships).slice(0, 2)];
    const pools = await Promise.allSettled(
      picks.map(async (subject) => {
        const info = await fanart.subjectInfo(subject);
        const { ranked } = await fanart.rankedPool(info, { sort: 'best', solo: false, spicy });
        return ranked.slice(0, 10).map((i) => ({ ...i, subject, subjectName: info.name }));
      }),
    );
    const lists = pools.filter((p) => p.status === 'fulfilled').map((p) => p.value);
    const out = [];
    for (let i = 0; out.length < 48 && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i]) out.push(l[i]);
    return out;
  });
}

async function copyrightTag(anime) {
  const cached = q.tagCache.get(anime.id, 'copyright');
  if (cached && Date.now() - cached.fetched_at < 30 * 24 * 3600 * 1000) return cached.tag;
  let tag = null;
  for (const title of [anime.title_romaji, anime.title].filter(Boolean)) {
    const query = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
    const rows = await fanart.danbooru(`/autocomplete.json?search%5Bquery%5D=${encodeURIComponent(query)}&search%5Btype%5D=tag_query&limit=5`).catch(() => []);
    const hit = (Array.isArray(rows) ? rows : []).find((r) => r.category === 3);
    if (hit) {
      tag = hit.value;
      break;
    }
  }
  q.saveTag.run(anime.id, 'copyright', tag, null, Date.now());
  return tag;
}

async function trending(me) {
  const spicy = isSpicy(me);
  const allowed = fanart.spicyFilter(spicy);
  return cache(`trending|${me}|${spicy}`, async () => {
    const anime = q.watching.all(me);
    const lists = [];
    for (const a of anime) {
      const tag = await copyrightTag(a).catch(() => null);
      if (!tag) continue;
      const raw = await fetchPosts(`${tag} ${fanart.ratingFor(spicy)} order:rank`, 1, 40).catch(() => []);
      lists.push(filterItems(raw.filter(allowed), {}).map((i) => ({ ...i, seriesTitle: a.title })));
    }
    const out = [];
    for (let i = 0; out.length < 40 && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i]) out.push(l[i]);
    return out;
  });
}

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

async function pickDaily() {
  const { chars, ships } = await subjectsFor(null);
  const recent = new Set(q.recentDaily.all().map((r) => {
    const d = JSON.parse(r.data);
    return `${d.item?.source}:${d.item?.id}`;
  }));
  const hidden = fanart.hiddenKeys();
  for (const subject of shuffle([...chars.slice(0, 30), ...ships])) {
    try {
      const info = await fanart.subjectInfo(subject);
      const { ranked } = await fanart.rankedPool(info, { sort: 'best', solo: false });
      const fresh = ranked.filter((i) => !recent.has(`${i.source}:${i.id}`) && !hidden.has(`${i.source}:${i.id}`)).slice(0, 8);
      if (!fresh.length) continue;
      const item = fresh[Math.floor(Math.random() * fresh.length)];
      return { subject, subjectName: info.name, item: fanart.publicItem(item) };
    } catch {
      // try the next one
    }
  }
  return null;
}

let dailyRunning = false;
async function dailyJob() {
  if (dailyRunning) return;
  const now = new Date();
  // Around 7–8 am in Central Europe.
  if (now.getUTCHours() < 6 || q.daily.get(dayKey(now))) return;
  dailyRunning = true;
  try {
    const pick = await pickDaily();
    if (!pick) return;
    q.saveDaily.run(dayKey(now), JSON.stringify(pick), Date.now());
    notify([...usersById().keys()], 'art', {
      title: '✨ Art of the day',
      body: `${pick.subjectName}${pick.item.artist ? ` · by ${pick.item.artist}` : ''}`,
      url: '#/art',
      tag: `daily-${dayKey(now)}`,
    });
  } catch (err) {
    console.warn(`Art of the day failed: ${err.message}`);
  } finally {
    dailyRunning = false;
  }
}

// Followed artists: tell followers about new pictures (every few hours).
async function followJob() {
  const follows = q.allFollows.all();
  const byArtist = new Map();
  for (const f of follows) {
    if (!byArtist.has(f.artist)) byArtist.set(f.artist, []);
    byArtist.get(f.artist).push(f);
  }
  for (const [artist, followers] of byArtist) {
    try {
      const raw = await fanart.danbooru(`/posts.json?limit=20&only=${FIELDS}&tags=${encodeURIComponent(`${artist} rating:g`)}`);
      const items = (Array.isArray(raw) ? raw : []).map(toItem).filter(Boolean);
      const newest = Math.max(0, ...items.map((i) => Number(i.id)));
      for (const f of followers) {
        const fresh = items.filter((i) => Number(i.id) > f.last_seen);
        if (fresh.length && f.last_seen > 0) {
          notify([f.user_id], 'art', {
            title: `🖌️ ${f.name} posted ${fresh.length === 1 ? 'a new piece' : `${fresh.length} new pieces`}`,
            body: fresh[0].characters?.slice(0, 2).map((c) => c.replace(/_\(.*\)$/, '').replace(/_/g, ' ')).join(', ') || 'New art',
            url: '#/art/artists',
            tag: `artist-${artist}`,
          });
        }
        if (newest > f.last_seen) q.setSeen.run(newest, f.user_id, f.artist);
      }
    } catch (err) {
      console.warn(`Artist check for ${artist} failed: ${err.message}`);
    }
  }
}

// "For you" takes a while to gather (several characters x three sources), so
// it is prepared in the background for every user.
async function warmForYou() {
  for (const id of usersById().keys()) {
    try {
      await forYou(id);
    } catch {
      // try again next time
    }
  }
}

function startArtJobs() {
  setTimeout(() => dailyJob().finally(() => warmForYou()), 20_000);
  setInterval(() => warmForYou(), 90 * 60 * 1000);
  setInterval(() => dailyJob(), 30 * 60 * 1000);
  setInterval(() => followJob().catch(() => {}), 3 * 3600 * 1000);
}

// ---- What is this? (IQDB) -----------------------------------------------------------------

// IQDB can take a minute or two when busy, so queries run in the background
// and the app polls for the result.
const jobs = new Map();

async function iqdbSearch(fileBuffer, fileName) {
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), fileName);
  const res = await fetch('https://danbooru.iqdb.org/', {
    method: 'POST',
    body: form,
    headers: { 'User-Agent': 'AnimeHub/1.0 (self-hosted)' },
    signal: AbortSignal.timeout(180_000),
  });
  const html = await res.text();
  const matches = [];
  // Each result table: a link to the Danbooru post and "NN% similarity".
  for (const table of html.split('<table>').slice(1)) {
    const id = table.match(/danbooru\.donmai\.us\/posts\/(\d+)/)?.[1];
    const sim = Number(table.match(/(\d+)% similarity/)?.[1]);
    if (id && sim) matches.push({ id, similarity: sim });
  }
  return matches;
}

async function runWhatIs(job, url) {
  try {
    let buf;
    if (url.startsWith('/images/')) {
      const file = path.join(IMAGE_DIR, path.basename(url));
      buf = await fs.promises.readFile(file);
    } else {
      const file = await cacheImage(url);
      buf = await fs.promises.readFile(path.join(IMAGE_DIR, file));
    }
    // Small JPEGs are enough for IQDB and upload faster.
    const sharp = require('sharp');
    const small = await sharp(buf, { failOn: 'none' }).resize({ width: 500, height: 500, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const matches = (await iqdbSearch(small, 'query.jpg')).filter((m) => m.similarity >= 60).slice(0, 4);
    const results = [];
    for (const m of matches) {
      const p = await fanart.danbooru(`/posts/${m.id}.json?only=${FIELDS},tag_string_copyright`).catch(() => null);
      if (!p) continue;
      const item = p.rating === 'g' ? toItem(p) : null;
      results.push({
        similarity: m.similarity,
        postUrl: `https://danbooru.donmai.us/posts/${m.id}`,
        workSafe: p.rating === 'g',
        item: item ? strip(item) : null,
        artists: String(p.tag_string_artist ?? '').split(' ').filter(Boolean),
        characters: String(p.tag_string_character ?? '').split(' ').filter(Boolean),
        series: String(p.tag_string_copyright ?? '').split(' ').filter(Boolean),
        sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
      });
    }
    job.status = 'done';
    job.results = results;
  } catch (err) {
    job.status = 'error';
    job.error = /timeout|aborted/i.test(err.message) ? 'IQDB is very busy right now. Try again in a few minutes.' : err.message;
  }
}

// ---- Routes ----------------------------------------------------------------------------------

const router = express.Router();

router.get('/art/autocomplete', wrap(async (req, res) => {
  const term = String(req.query.q ?? '').trim();
  if (term.length < 2) return res.json({ suggestions: [] });
  const query = term.toLowerCase().replace(/\s+/g, '_');
  const rows = await cache(`ac|${query}`, () =>
    fanart.danbooru(`/autocomplete.json?search%5Bquery%5D=${encodeURIComponent(query)}&search%5Btype%5D=tag_query&limit=10`),
  ).catch(() => []);
  const ships = q.shipsByName.all({ q: `%${term}%` }).map((s) => ({ tag: `ship:${s.id}`, label: s.name, kind: 'ship', count: null }));
  const tags = (Array.isArray(rows) ? rows : [])
    .filter((r) => CATEGORY[r.category])
    .map((r) => ({ tag: r.value, label: r.value.replace(/_/g, ' '), kind: CATEGORY[r.category], count: r.post_count }));
  res.json({ suggestions: [...ships, ...tags] });
}));

router.get('/art/search', wrap(async (req, res) => {
  const raw = String(req.query.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6);
  const tags = await expandTags(raw);
  if (req.query.color && COLOURS[req.query.color]) tags.push(COLOURS[req.query.color]);
  const sort = req.query.sort === 'new' ? 'new' : 'best';
  const page = Math.max(1, Math.min(30, Number(req.query.page) || 1));
  const { items, hasMore } = await searchTags(tags, { sort, page, spicy: isSpicy(req.user.id) });
  const filtered = filterItems(items, { shape: req.query.shape, quality: req.query.quality, solo: req.query.solo === '1' });
  res.json({ items: markSaved(filtered, req.user.id), hasMore, page, tags });
}));

// More like this: same artist, same characters, or similar contents.
router.get('/art/similar', wrap(async (req, res) => {
  const id = String(req.query.id ?? '');
  if (!/^\d+$/.test(id)) throw new HttpError(400, 'Only works for Danbooru pictures (use "What is this?" first).');
  const p = await fanart.danbooru(`/posts/${id}.json?only=${FIELDS}`);
  const mode = ['artist', 'characters', 'tags'].includes(req.query.mode) ? req.query.mode : 'tags';
  const artists = String(p.tag_string_artist ?? '').split(' ').filter(Boolean);
  const chars = String(p.tag_string_character ?? '').split(' ').filter(Boolean);
  let tags;
  if (mode === 'artist') {
    if (!artists.length) throw new HttpError(404, 'No artist known for this picture.');
    tags = [artists[0]];
  } else if (mode === 'characters') {
    if (!chars.length) throw new HttpError(404, 'No characters tagged on this picture.');
    tags = chars.slice(0, 2);
  } else {
    const general = String(p.tag_string_general ?? '').split(' ').filter((t) => t && !GENERIC.has(t));
    const counts = await tagCounts(general.slice(0, 60));
    const distinctive = general
      .filter((t) => (counts.get(t) ?? 0) >= 800 && (counts.get(t) ?? 0) <= 150000)
      .sort((a, b) => counts.get(a) - counts.get(b))
      .slice(0, 2);
    tags = [...chars.slice(0, 1), ...distinctive];
    if (!tags.length) throw new HttpError(404, 'Not enough tags to find similar pictures.');
  }
  // Very specific combinations can find nothing: loosen step by step.
  const [c0] = chars;
  const attempts = mode === 'tags'
    ? [tags, c0 && tags.length > 2 ? [c0, tags[1]] : null, tags.length > 1 ? tags.filter((t) => t !== c0) : null, c0 ? [c0] : null].filter((a) => a && a.length)
    : [tags];
  let used = tags;
  let found = [];
  for (const attempt of attempts) {
    const { items } = await searchTags(attempt, { sort: 'best', spicy: isSpicy(req.user.id) });
    found = filterItems(items.filter((i) => i.id !== id), {});
    used = attempt;
    if (found.length >= 6) break;
  }
  res.json({ tags: used, items: markSaved(found, req.user.id).slice(0, 60) });
}));

router.get('/art/foryou', wrap(async (req, res) => {
  const items = await forYou(req.user.id);
  res.json({ items: markSaved(items, req.user.id).map((i, k) => ({ ...i, subject: items[k]?.subject, subjectName: items[k]?.subjectName })) });
}));

router.get('/art/trending', wrap(async (req, res) => {
  res.json({ items: markSaved(await trending(req.user.id), req.user.id) });
}));

router.get('/art/daily', (req, res) => {
  const row = q.daily.get(dayKey()) ?? q.latestDaily.get();
  res.json(row ? { day: row.day, ...JSON.parse(row.data) } : null);
});

// Boards
router.get('/art/boards', (req, res) => {
  const users = usersById();
  res.json({ boards: q.boardsFor.all({ me: req.user.id }).map((b) => boardView(b, req.user.id, users)) });
});

router.post('/art/boards', (req, res) => {
  const name = cleanBoardName(req.body?.name);
  const emoji = typeof req.body?.emoji === 'string' && [...req.body.emoji].length <= 4 ? req.body.emoji : null;
  const id = Number(q.insertBoard.run(name, emoji, req.user.id, Date.now(), Date.now()).lastInsertRowid);
  res.status(201).json(boardView(q.board.get(id), req.user.id, usersById()));
});

router.get('/art/boards/:id', (req, res) => {
  const { board } = boardAccess(parseId(req.params.id), req.user.id);
  const users = usersById();
  const spicyOn = isSpicy(req.user.id);
  res.json({ ...boardView(board, req.user.id, users), items: q.items.all(board.id).filter((r) => r.spicy <= spicyOn).map((r) => itemView(r, users)) });
});

router.patch('/art/boards/:id', (req, res) => {
  const { board, isOwner } = boardAccess(parseId(req.params.id), req.user.id);
  if (!isOwner) throw new HttpError(403, 'Only the owner can rename the board.');
  const name = req.body?.name !== undefined ? cleanBoardName(req.body.name) : board.name;
  const emoji = req.body?.emoji !== undefined ? (typeof req.body.emoji === 'string' && [...req.body.emoji].length <= 4 ? req.body.emoji : null) : board.emoji;
  q.updateBoard.run(name, emoji, Date.now(), board.id);
  res.json(boardView(q.board.get(board.id), req.user.id, usersById()));
});

router.delete('/art/boards/:id', (req, res) => {
  const { board, isOwner } = boardAccess(parseId(req.params.id), req.user.id);
  if (!isOwner) throw new HttpError(403, 'Only the owner can delete the board.');
  const files = q.boardFiles.all(board.id);
  q.deleteBoard.run(board.id);
  for (const f of files) for (const x of [f.image_file, f.thumb_file]) if (x) removeImageIfUnused(x);
  res.status(204).end();
});

router.post('/art/boards/:id/members', (req, res) => {
  const { board, isOwner } = boardAccess(parseId(req.params.id), req.user.id);
  if (!isOwner) throw new HttpError(403, 'Only the owner can share the board.');
  const user = q.userByName.get(String(req.body?.username ?? '').trim());
  if (!user) throw new HttpError(404, 'No user with that name.');
  if (user.id === board.owner_id) throw new HttpError(400, "That's you.");
  q.addMember.run(board.id, user.id);
  q.touchBoard.run(Date.now(), board.id);
  notify([user.id], 'art', { title: `📌 ${req.user.username} shared a board with you`, body: board.name, url: `#/art/board/${board.id}`, tag: `board-${board.id}` });
  res.json(boardView(q.board.get(board.id), req.user.id, usersById()));
});

router.delete('/art/boards/:id/members/:userId', (req, res) => {
  const { board, isOwner } = boardAccess(parseId(req.params.id), req.user.id);
  const userId = parseId(req.params.userId);
  if (!isOwner && userId !== req.user.id) throw new HttpError(403, 'Only the owner can remove others.');
  q.removeMember.run(board.id, userId);
  res.status(204).end();
});

// Which of your boards already contain a picture (for the "Add to board" menu).
router.get('/art/boards-with', (req, res) => {
  const rows = q.boardsWithPost.all({ source: String(req.query.source ?? ''), postId: String(req.query.id ?? ''), me: req.user.id });
  res.json({ boardIds: rows.map((r) => r.board_id) });
});

router.post('/art/boards/:id/items', wrap(async (req, res) => {
  const { board } = boardAccess(parseId(req.params.id), req.user.id);
  const { source, id, subject } = req.body?.item ?? {};
  const existing = q.itemByPost.get(board.id, source, String(id));
  if (existing) return res.json(itemView(existing, usersById()));
  // Spicy pictures: Danbooru checks every tagged character; for other sources
  // the picture must come from a character/ship of known adults.
  let spicy = isSpicy(req.user.id);
  if (spicy && source !== 'danbooru') {
    const info = subject ? await fanart.subjectInfo(subject).catch(() => null) : null;
    spicy = info && (await allAdults(info.memberIds)) ? spicy : 0;
  }
  const post = await fanart.fetchPost(source, id, { spicy });
  if (!post) throw new HttpError(400, 'That picture is no longer available or not allowed here.');
  let imageFile;
  let thumbFile;
  try {
    imageFile = await cacheImage(post.remoteUrl);
    thumbFile = await cacheImage(post.remoteThumb ?? post.remoteUrl);
  } catch (err) {
    throw new HttpError(502, `Could not download the picture: ${err.message}`);
  }
  const itemId = Number(
    q.insertItem.run({
      boardId: board.id,
      source: post.source,
      postId: post.id,
      imageUrl: post.remoteUrl,
      thumbUrl: post.remoteThumb ?? null,
      imageFile,
      thumbFile,
      sourceUrl: post.sourceUrl,
      postUrl: post.postUrl,
      artist: post.artist,
      width: post.width,
      height: post.height,
      addedBy: req.user.id,
      now: Date.now(),
      spicy: Number(post.spicy) || 0,
    }).lastInsertRowid,
  );
  q.touchBoard.run(Date.now(), board.id);
  res.status(201).json(itemView(q.item.get(itemId), usersById()));
}));

router.delete('/art/boards/:id/items/:itemId', (req, res) => {
  const { board } = boardAccess(parseId(req.params.id), req.user.id);
  const item = q.item.get(parseId(req.params.itemId));
  if (!item || item.board_id !== board.id) throw new HttpError(404, 'Not found');
  q.deleteItem.run(item.id);
  for (const f of [item.image_file, item.thumb_file]) if (f) removeImageIfUnused(f);
  res.status(204).end();
});

// Wallpaper: crop a picture to the phone's or a desktop's shape.
const TARGETS = { phone: { width: 1290, height: 2796 }, desktop: { width: 2560, height: 1440 } };
router.post('/art/wallpaper', wrap(async (req, res) => {
  const url = String(req.body?.url ?? '');
  const target = TARGETS[req.body?.target] ? req.body.target : 'phone';
  const crop = cleanCrop(req.body?.crop);
  if (!crop) throw new HttpError(400, 'Choose the area first.');
  let file;
  if (url.startsWith('/images/')) file = path.basename(url);
  else if (isAllowedImageUrl(url)) file = await cacheImage(url);
  else throw new HttpError(400, 'Please pick one of the pictures in the app.');
  const out = await cropImage(file, crop, { ...TARGETS[target], prefix: 'wall', quality: 92 });
  res.json({ url: `/images/${out}`, target });
}));

// Followed artists
router.get('/art/follows', (req, res) => {
  res.json({ follows: q.follows.all(req.user.id).map((f) => ({ artist: f.artist, name: f.name, followedAt: f.created_at })) });
});

router.post('/art/follows', wrap(async (req, res) => {
  const artist = String(req.body?.artist ?? '').trim();
  if (!/^[^\s,]{1,80}$/.test(artist)) throw new HttpError(400, 'Invalid artist');
  const latest = await fanart.danbooru(`/posts.json?limit=1&only=id&tags=${encodeURIComponent(`${artist} rating:g`)}`).catch(() => []);
  const name = (typeof req.body?.name === 'string' && req.body.name.trim()) || artist.replace(/_/g, ' ');
  q.follow.run(req.user.id, artist, name.slice(0, 80), Number(latest?.[0]?.id ?? 0), Date.now());
  res.status(201).json({ ok: true });
}));

router.delete('/art/follows/:artist', (req, res) => {
  q.unfollow.run(req.user.id, req.params.artist);
  res.status(204).end();
});

router.get('/art/artists/feed', wrap(async (req, res) => {
  const follows = q.follows.all(req.user.id).slice(0, 15);
  const lists = await Promise.all(
    follows.map((f) =>
      fetchPosts(`${f.artist} ${fanart.ratingFor(isSpicy(req.user.id))}`, 1, 24)
        .then((items) => filterItems(items.filter(fanart.spicyFilter(isSpicy(req.user.id))), {}).map((i) => ({ ...i, artistName: f.name })))
        .catch(() => []),
    ),
  );
  const items = lists.flat().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 80);
  res.json({ items: markSaved(items, req.user.id) });
}));

// What is this? Start a reverse image search for a picture in the app.
router.post('/art/whatis', (req, res) => {
  const url = String(req.body?.url ?? '');
  if (!url.startsWith('/images/') && !isAllowedImageUrl(url)) throw new HttpError(400, 'Use a picture from the app or a link from AniList, Danbooru, Zerochan, Wallhaven or Safebooru.');
  for (const [k, j] of jobs) if (Date.now() - j.started > 30 * 60 * 1000) jobs.delete(k);
  const id = crypto.randomBytes(8).toString('hex');
  const job = { id, user: req.user.id, status: 'running', started: Date.now() };
  jobs.set(id, job);
  runWhatIs(job, url);
  res.status(202).json({ id, status: 'running' });
});

router.get('/art/whatis/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.user !== req.user.id) throw new HttpError(404, 'Search not found (it may have expired).');
  res.json({ status: job.status, results: job.results ?? null, error: job.error ?? null, seconds: Math.round((Date.now() - job.started) / 1000) });
});

module.exports = { artRouter: router, startArtJobs, COLOURS };
