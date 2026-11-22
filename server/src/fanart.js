// Fan art 2.0: Danbooru (sorted by fan score, work-safe only) with Safebooru as
// fallback, plus a shared gallery of saved pictures and a shared "hidden" list.
//
// Subjects: 'character:<anilistId>' or 'ship:<shipId>'.
// Danbooru allows 2 tags per anonymous search; `rating:g` is free, `order:score`
// counts. So:
//   character, best   -> "<tag> rating:g order:score"
//   character, newest -> "<tag> rating:g"
//   ship, best        -> top-scored posts of the rarer member, filtered locally
//                        for the other members (falls back to the pair search)
//   ship, newest      -> "<a> <b> rating:g", filtered locally for members 3-4
// Quality filters (comics, sketches, lowres…) run here, since negative tags
// would count against the limit. Every picture is re-checked as work-safe.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { cacheImage, isAllowedImageUrl, removeImageIfUnused } = require('./images');
const { guessTag, character } = require('./pictures');
const { usersById } = require('./users');
const activity = require('./activity');
const { zerochanResults, wallhavenResults, zerochanPost, wallhavenPost, rankAcrossSources } = require('./fanart-sources');

const DANBOORU = 'https://danbooru.donmai.us';
const SAFEBOORU = 'https://safebooru.org';
const UA = { 'User-Agent': 'AnimeHub/1.0 (self-hosted)' };
const TAG_FRESH_MS = 30 * 24 * 3600 * 1000;
const PAGE_SIZE = 40;
const MERGE_MS = 10 * 60 * 1000;
const BAD_TAGS = ['comic', '4koma', 'sketch', 'monochrome', 'greyscale', 'lowres', 'text_focus', 'multiple_views', 'character_sheet', 'reference_sheet', 'lineart', 'animated'];
const OK_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const q = {
  tag: db.prepare('SELECT tag, post_count, fetched_at FROM fanart_tags WHERE character_id = ? AND source = ?'),
  saveTag: db.prepare('INSERT OR REPLACE INTO fanart_tags (character_id, source, tag, post_count, fetched_at) VALUES (?, ?, ?, ?, ?)'),
  ship: db.prepare('SELECT * FROM ships WHERE id = ?'),
  members: db.prepare('SELECT character_id, name FROM ship_members WHERE ship_id = ? ORDER BY position'),
  saved: db.prepare('SELECT * FROM fanart_saved WHERE subject = ? ORDER BY created_at DESC'),
  savedOne: db.prepare('SELECT * FROM fanart_saved WHERE id = ?'),
  savedByPost: db.prepare('SELECT id FROM fanart_saved WHERE subject = ? AND source = ? AND post_id = ?'),
  savedSamePost: db.prepare('SELECT * FROM fanart_saved WHERE source = ? AND post_id = ?'),
  insertSaved: db.prepare(`
    INSERT INTO fanart_saved (subject, subject_name, source, post_id, image_url, thumb_url, image_file, thumb_file,
      source_url, post_url, artist, width, height, score, saved_by, created_at)
    VALUES (@subject, @subjectName, @source, @postId, @imageUrl, @thumbUrl, @imageFile, @thumbFile,
      @sourceUrl, @postUrl, @artist, @width, @height, @score, @savedBy, @now)`),
  deleteSaved: db.prepare('DELETE FROM fanart_saved WHERE id = ?'),
  hiddenKeys: db.prepare('SELECT source, post_id FROM fanart_hidden'),
  hiddenAll: db.prepare('SELECT * FROM fanart_hidden ORDER BY created_at DESC'),
  hide: db.prepare('INSERT OR REPLACE INTO fanart_hidden (source, post_id, thumb_url, subject_name, hidden_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  unhide: db.prepare('DELETE FROM fanart_hidden WHERE source = ? AND post_id = ?'),
  gallery: db.prepare(`
    SELECT * FROM fanart_saved
    WHERE id < @before AND (@subject IS NULL OR subject = @subject) AND (@by IS NULL OR saved_by = @by)
    ORDER BY id DESC LIMIT @limit`),
  gallerySubjects: db.prepare(`
    SELECT subject, subject_name, COUNT(*) AS n, MAX(created_at) AS last FROM fanart_saved GROUP BY subject ORDER BY last DESC`),
  lastSaveActivity: db.prepare(`SELECT id, data, created_at FROM activities WHERE user_id = ? AND type = 'fanart_save' ORDER BY id DESC LIMIT 1`),
  updateActivity: db.prepare('UPDATE activities SET data = ?, updated_at = ? WHERE id = ?'),
  deleteReactions: db.prepare('DELETE FROM reactions WHERE target = ?'),
  randomSaved: db.prepare('SELECT image_file, image_url FROM fanart_saved WHERE subject = ? ORDER BY RANDOM() LIMIT 1'),
  pictureOfYear: db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM reactions r WHERE r.target = 'fanart:' || s.id) AS reactions
    FROM fanart_saved s WHERE s.created_at >= @from AND s.created_at < @to
    ORDER BY reactions DESC, s.created_at DESC LIMIT 1`),
};

// ---- HTTP helpers ------------------------------------------------------------------------

function memo(ms, max = 300) {
  const map = new Map();
  return async (key, fn) => {
    const hit = map.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.value;
    const value = await fn();
    map.set(key, { at: Date.now(), value });
    if (map.size > max) map.delete(map.keys().next().value);
    return value;
  };
}
const dbCache = memo(30 * 60 * 1000);
const sbCache = memo(30 * 60 * 1000);

// Requests to Danbooru are queued and spaced out a little.
let dbQueue = Promise.resolve();
function danbooru(path) {
  return dbCache(path, () => {
    const run = dbQueue.then(async () => {
      try {
        const res = await fetch(`${DANBOORU}${path}`, { headers: UA, signal: AbortSignal.timeout(15_000) });
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`status ${res.status}`);
        }
        if (!res.ok || data?.success === false) throw new Error(data?.message ?? `status ${res.status}`);
        return data;
      } finally {
        await sleep(150);
      }
    });
    dbQueue = run.catch(() => {});
    return run;
  });
}

async function safebooru(tags, page = 1) {
  return sbCache(`${tags}|${page}`, async () => {
    const url = `${SAFEBOORU}/index.php?page=dapi&s=post&q=index&json=1&limit=100&pid=${page - 1}&tags=${encodeURIComponent(`${tags} rating:general`)}`;
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const text = await res.text();
    if (!text.trim()) return [];
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  });
}

// ---- Normalising posts -------------------------------------------------------------------

const clean = (s) => String(s ?? '').replace(/_/g, ' ').trim();

// Danbooru's image server blocks browsers (Cloudflare), so pictures are
// fetched through the NAS (see /fanart/img below).
const proxied = (url) => (url ? `/api/fanart/img?u=${encodeURIComponent(url)}` : null);

function fromDanbooru(p) {
  if (!p || p.rating !== 'g' || !OK_EXT.has(p.file_ext) || !p.large_file_url) return null;
  const variants = Object.fromEntries((p.media_asset?.variants ?? []).map((v) => [v.type, v.url]));
  const artist = p.tag_string_artist ? clean(p.tag_string_artist.split(' ')[0]) : null;
  const thumbUrl = variants['360x360'] ?? p.preview_file_url;
  return {
    source: 'danbooru',
    id: String(p.id),
    thumb: proxied(thumbUrl),
    full: proxied(p.large_file_url),
    remoteUrl: p.large_file_url,
    remoteThumb: thumbUrl,
    md5: p.md5 ?? null,
    width: p.image_width,
    height: p.image_height,
    score: p.score,
    artist,
    sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
    postUrl: `${DANBOORU}/posts/${p.id}`,
    tags: `${p.tag_string_general ?? ''} ${p.tag_string_meta ?? ''}`,
    characters: (p.tag_string_character ?? '').split(' ').filter(Boolean),
  };
}

function fromSafebooru(p) {
  if (!p || !['general', 'safe'].includes(p.rating)) return null;
  const full = p.sample_url || p.file_url;
  if (!full || !p.preview_url || !isAllowedImageUrl(full)) return null;
  return {
    source: 'safebooru',
    id: String(p.id),
    thumb: p.preview_url,
    full,
    remoteUrl: full,
    remoteThumb: p.preview_url,
    width: p.width,
    height: p.height,
    score: p.score ?? null,
    artist: null,
    sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
    postUrl: `${SAFEBOORU}/index.php?page=post&s=view&id=${p.id}`,
    tags: p.tags ?? '',
    characters: null,
  };
}

function goodQuality(item, { solo, maxCharacters = Infinity }) {
  // Skip crowd pictures where the character is just one of many.
  if (item.characters && item.characters.length > maxCharacters) return false;
  const tags = new Set(item.tags.split(/\s+/));
  if (BAD_TAGS.some((t) => tags.has(t))) return false;
  if (Math.max(item.width ?? 0, item.height ?? 0) < 600) return false;
  if (solo && !tags.has('solo')) return false;
  return true;
}

const publicItem = ({ tags, characters, remoteThumb, ...rest }) => rest;

// ---- Danbooru tags for characters --------------------------------------------------------

// Romanisation differences: "Gojou" vs "Gojo", "Yuuji" vs "Yuji".
const norm = (s) => s.toLowerCase().replace(/ou/g, 'o').replace(/uu/g, 'u').replace(/oo/g, 'o');
const wordsOf = (tag) => norm(tag.replace(/_\(.*\)$/, '')).split('_').filter(Boolean).sort().join(' ');

async function danbooruTag(characterId) {
  const cached = q.tag.get(characterId, 'danbooru');
  if (cached && Date.now() - cached.fetched_at < TAG_FRESH_MS) return cached.tag ? { tag: cached.tag, count: cached.post_count } : null;

  const c = await character(characterId);
  const parts = c.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const target = norm(parts.join(' ')).split(' ').sort().join(' ');
  const seriesWords = (c.media[0]?.romaji || c.media[0]?.title || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const queries = new Set([parts.join('_'), [...parts].reverse().join('_')]);
  try {
    const sb = await guessTag(c);
    if (sb.tag) queries.add(sb.tag);
  } catch {
    // Safebooru down; the name variants are enough
  }

  const found = new Map();
  for (const query of queries) {
    if (!query) continue;
    const rows = await danbooru(`/autocomplete.json?search%5Bquery%5D=${encodeURIComponent(query)}&search%5Btype%5D=tag_query&limit=10`);
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r.category !== 4 || /\(cosplay\)/.test(r.value)) continue;
      found.set(r.value, { tag: r.value, count: r.post_count ?? 0, antecedent: r.antecedent ?? null });
    }
  }
  const score = (t) => {
    let s = 0;
    if (wordsOf(t.tag) === target || (t.antecedent && wordsOf(t.antecedent) === target)) s += 100;
    const qualifier = t.tag.match(/_\((.*)\)$/)?.[1] ?? '';
    if (qualifier && seriesWords.some((w) => qualifier.includes(w))) s += 50;
    return s + Math.log10(t.count + 1);
  };
  const best = [...found.values()].sort((a, b) => score(b) - score(a))[0];
  const result = best && score(best) >= 100 ? best : null;
  q.saveTag.run(characterId, 'danbooru', result?.tag ?? null, result?.count ?? null, Date.now());
  return result;
}

// ---- Searching ---------------------------------------------------------------------------

async function subjectInfo(subject) {
  const m = String(subject ?? '').match(/^(character|ship):(\d+)$/);
  if (!m) throw new HttpError(400, 'Unknown subject');
  const id = Number(m[2]);
  if (m[1] === 'character') {
    const c = await character(id);
    return { kind: 'character', id, name: c.name, memberIds: [id] };
  }
  const ship = q.ship.get(id);
  if (!ship) throw new HttpError(404, 'Ship not found');
  return { kind: 'ship', id, name: ship.name, memberIds: q.members.all(id).map((r) => r.character_id) };
}

const DB_FIELDS = 'id,md5,rating,score,image_width,image_height,file_ext,tag_string_artist,tag_string_character,tag_string_general,tag_string_meta,source,large_file_url,preview_file_url,media_asset';
const posts = (tags, page, limit = 100) =>
  danbooru(`/posts.json?limit=${limit}&page=${page}&only=${DB_FIELDS}&tags=${encodeURIComponent(tags)}`).then((rows) =>
    (Array.isArray(rows) ? rows : []).map(fromDanbooru).filter(Boolean),
  );

// Returns { items, hasMore, source } for one page (Danbooru), before filtering
// out hidden/saved pictures.
async function searchDanbooru(info, { sort, solo }) {
  const tags = [];
  for (const id of info.memberIds) {
    const t = await danbooruTag(id);
    if (!t) return null; // a member has no Danbooru tag
    tags.push(t);
  }
  if (tags.length === 1) {
    const raw = await posts(`${tags[0].tag} rating:g${sort === 'best' ? ' order:score' : ''}`, 1, 200);
    return { items: raw.filter((i) => goodQuality(i, { solo, maxCharacters: 3 })), source: 'danbooru', tags: [tags[0].tag] };
  }

  // Ships: collect a pool once (cached), then page through it locally.
  const names = tags.map((t) => t.tag);
  const hasAll = (i) => names.every((n) => i.characters?.includes(n));
  const pool = await dbCache(`pool|${names.join(' ')}|${sort}`, async () => {
    const seen = new Map();
    const add = (list) => list.filter(hasAll).forEach((i) => !seen.has(i.id) && seen.set(i.id, i));
    if (sort === 'best') {
      const rarest = [...tags].sort((a, b) => a.count - b.count)[0];
      for (let p = 1; p <= 4; p++) {
        const raw = await posts(`${rarest.tag} rating:g order:score`, p, 200);
        add(raw);
        if (raw.length < 150) break;
      }
    }
    if (sort !== 'best' || seen.size < 24) {
      const pair = [...tags].sort((a, b) => a.count - b.count).slice(0, 2).map((t) => t.tag);
      for (let p = 1; p <= 3; p++) {
        const raw = await posts(`${pair.join(' ')} rating:g`, p, 200);
        add(raw);
        if (raw.length < 150) break;
      }
    }
    const list = [...seen.values()].filter((i) => goodQuality(i, { solo: false, maxCharacters: names.length + 2 }));
    return sort === 'best' ? list.sort((a, b) => b.score - a.score) : list;
  });
  return { items: pool, source: 'danbooru', tags: names };
}

async function searchSafebooru(info, { sort, solo }) {
  const tags = [];
  for (const id of info.memberIds) {
    const { tag } = await guessTag(await character(id));
    if (!tag) return { items: [], hasMore: false, source: 'safebooru', tags: null };
    tags.push(tag);
  }
  const raw = (await safebooru(`${tags.join(' ')}${sort === 'best' ? ' sort:score:desc' : ''}`, 1)).map(fromSafebooru).filter(Boolean);
  return { items: raw.filter((i) => goodQuality(i, { solo })), source: 'safebooru', tags };
}

function savedView(row, users, me) {
  return {
    savedId: row.id,
    subject: row.subject,
    subjectName: row.subject_name,
    source: row.source,
    id: row.post_id,
    thumb: row.thumb_file ? `/images/${row.thumb_file}` : row.source === 'danbooru' ? proxied(row.thumb_url) : row.thumb_url,
    full: row.image_file ? `/images/${row.image_file}` : row.source === 'danbooru' ? proxied(row.image_url) : row.image_url,
    remoteUrl: row.image_url,
    width: row.width,
    height: row.height,
    score: row.score,
    artist: row.artist,
    sourceUrl: row.source_url,
    postUrl: row.post_url,
    savedBy: users.get(row.saved_by) ?? null,
    savedAt: row.created_at,
    reactions: activity.reactionSummary(`fanart:${row.id}`, me),
  };
}

// ---- Saving --------------------------------------------------------------------------------

// Looks the post up again at the source, so only real work-safe pictures are saved.
async function fetchPost(source, postId) {
  if (!/^[a-z0-9]+$/i.test(String(postId))) throw new HttpError(400, 'Invalid picture');
  if (source === 'danbooru') {
    const p = await danbooru(`/posts/${postId}.json?only=${DB_FIELDS}`).catch(() => null);
    return fromDanbooru(p);
  }
  if (source === 'zerochan') return zerochanPost(postId);
  if (source === 'wallhaven') return wallhavenPost(postId);
  if (source === 'safebooru') {
    const res = await fetch(`${SAFEBOORU}/index.php?page=dapi&s=post&q=index&json=1&id=${postId}`, { headers: UA, signal: AbortSignal.timeout(15_000) });
    const rows = await res.json().catch(() => []);
    return fromSafebooru(Array.isArray(rows) ? rows[0] : null);
  }
  throw new HttpError(400, 'Unknown source');
}

function recordSave(userId, info, savedId) {
  const subject = `${info.kind}:${info.id}`;
  const last = q.lastSaveActivity.get(userId);
  if (last && Date.now() - last.created_at < MERGE_MS) {
    const data = JSON.parse(last.data);
    if (data.subject === subject) {
      data.ids = [...new Set([...(data.ids ?? []), savedId])];
      q.updateActivity.run(JSON.stringify(data), Date.now(), last.id);
      return;
    }
  }
  activity.record({ userId, type: 'fanart_save', itemId: savedId, data: { subject, name: info.name, ids: [savedId] } });
}

// ---- Routes ------------------------------------------------------------------------------

const router = express.Router();

// All sources in parallel, ranked together by popularity (cached per subject).
const poolCache = memo(3 * 3600 * 1000, 200);
async function rankedPool(info, { sort, solo }) {
  return poolCache(`${info.kind}:${info.id}|${sort}|${solo ? 1 : 0}`, async () => {
    const [db, zc, wh] = await Promise.allSettled([
      searchDanbooru(info, { sort, solo }),
      zerochanResults(info, { sort, solo }),
      wallhavenResults(info, { sort, solo }),
    ]);
    const lists = {};
    const failed = [];
    if (db.status === 'fulfilled' && db.value) lists.danbooru = db.value.items;
    else if (db.status === 'rejected') failed.push('Danbooru');
    if (zc.status === 'fulfilled') lists.zerochan = zc.value;
    else failed.push('Zerochan');
    if (wh.status === 'fulfilled') lists.wallhaven = wh.value;
    else failed.push('Wallhaven');
    if (!lists.danbooru) {
      // Danbooru down or no tag: Safebooru steps in.
      try {
        lists.safebooru = (await searchSafebooru(info, { sort, solo })).items;
      } catch {
        failed.push('Safebooru');
      }
    }
    const sources = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length]));
    if (!Object.values(sources).some((n) => n > 0) && failed.length) {
      throw new HttpError(503, `Fan art is unavailable right now (${failed.join(', ')} not reachable).`);
    }
    return {
      ranked: rankAcrossSources(lists),
      sources,
      notice: failed.length ? `${failed.join(' and ')} ${failed.length > 1 ? 'are' : 'is'} unavailable right now.` : null,
    };
  });
}

router.get('/fanart', wrap(async (req, res) => {
  const me = req.user.id;
  const info = await subjectInfo(req.query.subject);
  const sort = req.query.sort === 'new' ? 'new' : 'best';
  const solo = req.query.solo === '1' && info.kind === 'character';
  const page = Math.max(1, Math.min(50, Number(req.query.page) || 1));
  const subject = `${info.kind}:${info.id}`;
  const users = usersById();

  const { ranked, sources, notice } = await rankedPool(info, { sort, solo });
  const hidden = new Set(q.hiddenKeys.all().map((h) => `${h.source}:${h.post_id}`));
  const savedRows = q.saved.all(subject);
  const savedKeys = new Set(savedRows.map((r) => `${r.source}:${r.post_id}`));
  const keysOf = (i) => (i.sources ?? [{ source: i.source, id: i.id }]).map((s) => `${s.source}:${s.id}`);
  const visible = ranked.filter((i) => !keysOf(i).some((k) => hidden.has(k) || savedKeys.has(k)));
  const start = (page - 1) * PAGE_SIZE;
  res.json({
    subject,
    name: info.name,
    sources,
    notice,
    saved: page === 1 ? savedRows.map((r) => savedView(r, users, me)) : undefined,
    items: visible.slice(start, start + PAGE_SIZE).map(publicItem),
    hasMore: visible.length > start + PAGE_SIZE,
    total: visible.length,
    hiddenCount: hidden.size,
  });
}));

router.post('/fanart/saved', wrap(async (req, res) => {
  const me = req.user.id;
  const info = await subjectInfo(req.body?.subject);
  const subject = `${info.kind}:${info.id}`;
  const { source, id } = req.body?.item ?? {};
  const existing = q.savedByPost.get(subject, source, String(id));
  if (existing) return res.json(savedView(q.savedOne.get(existing.id), usersById(), me));

  const post = await fetchPost(source, id);
  if (!post) throw new HttpError(400, 'That picture is no longer available or not work-safe.');
  let imageFile = null;
  let thumbFile = null;
  try {
    imageFile = await cacheImage(post.remoteUrl);
    thumbFile = await cacheImage(post.remoteThumb);
  } catch (err) {
    throw new HttpError(502, `Could not download the picture: ${err.message}`);
  }
  const savedId = Number(
    q.insertSaved.run({
      subject,
      subjectName: info.name,
      source: post.source,
      postId: post.id,
      imageUrl: post.remoteUrl,
      thumbUrl: post.remoteThumb,
      imageFile,
      thumbFile,
      sourceUrl: post.sourceUrl,
      postUrl: post.postUrl,
      artist: post.artist,
      width: post.width,
      height: post.height,
      score: post.score,
      savedBy: me,
      now: Date.now(),
    }).lastInsertRowid,
  );
  q.unhide.run(post.source, post.id);
  recordSave(me, info, savedId);
  res.status(201).json(savedView(q.savedOne.get(savedId), usersById(), me));
}));

router.delete('/fanart/saved/:id', (req, res) => {
  const row = q.savedOne.get(parseId(req.params.id));
  if (!row) throw new HttpError(404, 'Not found');
  db.transaction(() => {
    q.deleteSaved.run(row.id);
    q.deleteReactions.run(`fanart:${row.id}`);
  })();
  for (const f of [row.image_file, row.thumb_file]) if (f) removeImageIfUnused(f);
  res.status(204).end();
});

// Hiding works everywhere, for everyone; a hidden picture is also unsaved.
router.post('/fanart/hidden', (req, res) => {
  const { source, id, thumb, subjectName, sources: copies } = req.body?.item ?? {};
  const valid = (s, i) => ['danbooru', 'safebooru', 'zerochan', 'wallhaven'].includes(s) && /^[a-z0-9]+$/i.test(String(i));
  if (!valid(source, id)) throw new HttpError(400, 'Invalid picture');
  const extra = (Array.isArray(copies) ? copies : []).filter((c) => valid(c?.source, c?.id) && !(c.source === source && String(c.id) === String(id))).slice(0, 5);
  const thumbUrl =
    typeof thumb === 'string' && (isAllowedImageUrl(thumb) || thumb.startsWith('/images/') || thumb.startsWith('/api/fanart/img?')) ? thumb : null;
  const removed = q.savedSamePost.all(source, String(id));
  db.transaction(() => {
    q.hide.run(source, String(id), thumbUrl, typeof subjectName === 'string' ? subjectName.slice(0, 100) : null, req.user.id, Date.now());
    for (const c of extra) q.hide.run(c.source, String(c.id), null, typeof subjectName === 'string' ? subjectName.slice(0, 100) : null, req.user.id, Date.now());
    for (const r of removed) {
      q.deleteSaved.run(r.id);
      q.deleteReactions.run(`fanart:${r.id}`);
    }
  })();
  for (const r of removed) for (const f of [r.image_file, r.thumb_file]) if (f) removeImageIfUnused(f);
  res.status(201).json({ ok: true, unsaved: removed.length });
});

router.get('/fanart/hidden', (req, res) => {
  const users = usersById();
  res.json(
    q.hiddenAll.all().map((h) => ({
      source: h.source,
      id: h.post_id,
      thumb: h.thumb_url,
      subjectName: h.subject_name,
      hiddenBy: users.get(h.hidden_by) ?? null,
      hiddenAt: h.created_at,
    })),
  );
});

router.delete('/fanart/hidden/:source/:id', (req, res) => {
  q.unhide.run(req.params.source, req.params.id);
  res.status(204).end();
});

// Image proxy for Danbooru pictures (their CDN refuses browsers). Only
// cdn.donmai.us; browsers cache the result for a week.
let proxyActive = 0;
const proxyWaiting = [];
const proxySlot = () => (proxyActive < 6 ? (proxyActive++, Promise.resolve()) : new Promise((r) => proxyWaiting.push(r)));
const proxyDone = () => {
  const next = proxyWaiting.shift();
  if (next) next();
  else proxyActive--;
};

router.get('/fanart/img', wrap(async (req, res) => {
  let url;
  try {
    url = new URL(String(req.query.u ?? ''));
  } catch {
    throw new HttpError(400, 'Invalid image');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.donmai.us') throw new HttpError(400, 'Invalid image');
  await proxySlot();
  try {
    const upstream = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
    const type = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !type.startsWith('image/')) throw new HttpError(502, 'Picture unavailable');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', type);
    res.set('Cache-Control', 'private, max-age=604800, immutable');
    res.send(buf);
  } finally {
    proxyDone();
  }
}));

// Everything both of you saved, newest first.
router.get('/gallery', (req, res) => {
  const me = req.user.id;
  const users = usersById();
  const limit = 60;
  const subject = typeof req.query.subject === 'string' && /^(character|ship):\d+$/.test(req.query.subject) ? req.query.subject : null;
  const rows = q.gallery.all({
    before: Number(req.query.before) || Number.MAX_SAFE_INTEGER,
    subject,
    by: req.query.by ? parseId(req.query.by) : null,
    limit,
  });
  res.json({
    items: rows.map((r) => savedView(r, users, me)),
    nextBefore: rows.length === limit ? rows[rows.length - 1].id : null,
    subjects: q.gallerySubjects.all().map((s) => ({ subject: s.subject, name: s.subject_name, count: s.n })),
  });
});

// ---- Helpers for other modules -----------------------------------------------------------

// A random saved picture of a subject (for games), or null.
function savedImageFor(subject) {
  const r = q.randomSaved.get(subject);
  return r ? (r.image_file ? `/images/${r.image_file}` : r.image_url) : null;
}

function pictureOfYear(year, me) {
  const row = q.pictureOfYear.get({ from: Date.UTC(year, 0, 1), to: Date.UTC(year + 1, 0, 1) });
  return row ? { ...savedView(row, usersById(), me), reactionCount: row.reactions } : null;
}

// Saved pictures for feed items.
const feedPictures = (ids) =>
  (ids ?? [])
    .map((id) => q.savedOne.get(id))
    .filter(Boolean)
    .map((r) => ({ savedId: r.id, thumb: r.thumb_file ? `/images/${r.thumb_file}` : r.source === 'danbooru' ? proxied(r.thumb_url) : r.thumb_url, subject: r.subject }));

module.exports = {
  fanartRouter: router,
  savedImageFor,
  pictureOfYear,
  feedPictures,
  // shared with the Art area
  danbooru,
  posts,
  fromDanbooru,
  goodQuality,
  publicItem,
  danbooruTag,
  subjectInfo,
  rankedPool,
  fetchPost,
  proxied,
  memo,
  hiddenKeys: () => new Set(q.hiddenKeys.all().map((h) => `${h.source}:${h.post_id}`)),
  DB_FIELDS,
};
