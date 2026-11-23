// Studio: reference search for artists. One tag search (Danbooru's tag names)
// across many sources, merged (duplicates collapse to the highest-resolution
// copy), with filters for resolution, orientation, score, AI, sketches and
// comics. Originals are shown through the NAS where a site needs it, and can be
// sent to Eagle on the viewer's Mac via short-lived signed links.
//
// Sources and what they can search:
//   Danbooru            every tag (2 per request, the rest checked here)
//   Yande.re, Konachan  up to 4 tags (Danbooru-style names)
//   Gelbooru            every tag (needs GELBOORU_API_KEY + GELBOORU_USER_ID)
//   Zerochan, Wallhaven characters/series only (skipped for pose/style tags)
//   Pixiv               characters/series only, Japanese names from Danbooru's
//                       wiki (needs a connected Pixiv account)
//
// Spicy levels (adult.js) apply unchanged and fail closed:
//   Danbooru: every character tagged in the picture must be a known adult.
//   Yande.re, Konachan, Gelbooru, Zerochan: each picture is looked up on
//     Danbooru by file hash. If Danbooru has it, Danbooru's rating and
//     characters decide, with the same check. If not, their own rating is read
//     strictly (Yande.re/Konachan "safe" counts as spicy), and anything above
//     safe needs ONE known-adult character (searched for, or the only
//     character tag on a solo picture), a solo picture, and no minor tags.
//   Wallhaven and Pixiv: safe pictures only.
const crypto = require('crypto');
const { Readable } = require('stream');
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const fanart = require('./fanart');
const { zerochan, wallhaven, zerochanLevel, zcPath } = require('./fanart-sources');
const { isSpicy, adultTags, hasMinorTag } = require('./adult');
const pixiv = require('./pixiv');

const UA = { 'User-Agent': 'AnimeHub/1.0 (self-hosted reference viewer)' };
const DB_LEVEL = { g: 0, s: 1, q: 2, e: 2 };
const DB_FIELDS = [
  'id', 'md5', 'rating', 'score', 'image_width', 'image_height', 'file_ext', 'file_size', 'tag_string', 'tag_string_artist',
  'tag_string_character', 'tag_string_copyright', 'tag_string_general', 'source', 'pixiv_id', 'large_file_url', 'file_url',
  'preview_file_url', 'media_asset', 'created_at',
].join(',');

const AI_TAGS = ['ai-generated', 'ai-assisted', 'ai generated', 'ai art', 'ai-generated art'];
const SKETCH_TAGS = ['sketch', 'lineart', 'line art', 'monochrome', 'greyscale', 'grayscale', 'rough sketch'];
const COMIC_TAGS = ['comic', '4koma', '4-koma', 'doujinshi', 'manga'];
const LOW_TAGS = ['lowres', 'thumbnail'];

const q = {
  searches: db.prepare('SELECT id, name, query, created_at FROM studio_searches WHERE user_id = ? ORDER BY name COLLATE NOCASE'),
  addSearch: db.prepare('INSERT INTO studio_searches (user_id, name, query, created_at) VALUES (?, ?, ?, ?)'),
  delSearch: db.prepare('DELETE FROM studio_searches WHERE id = ? AND user_id = ?'),
};

const memo = fanart.memo;
const pageCache = memo(20 * 60 * 1000, 400);
const tagCache = memo(24 * 3600 * 1000, 2000);
const poolCache = memo(60 * 60 * 1000, 60);

// Danbooru for searches: up to 4 requests in parallel, outside the shared
// queue in fanart.js (which spaces out background jobs and made searches wait).
const dbDirectCache = memo(30 * 60 * 1000, 800);
let dbActive = 0;
const dbWaiting = [];
function dbDirect(path) {
  return dbDirectCache(path, async () => {
    if (dbActive >= 4) await new Promise((r) => dbWaiting.push(r));
    dbActive++;
    try {
      const res = await fetch(`https://danbooru.donmai.us${path}`, { headers: UA, signal: AbortSignal.timeout(15_000) });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) throw new Error(data?.message ?? `Danbooru: status ${res.status}`);
      return data;
    } finally {
      dbActive--;
      dbWaiting.shift()?.();
    }
  });
}

// ---- Image hosts ---------------------------------------------------------------------------

// Sites whose pictures may be fetched through the NAS. Some need a Referer.
const PROXY_DOMAINS = ['donmai.us', 'yande.re', 'konachan.com', 'pximg.net', 'zerochan.net', 'wallhaven.cc', 'gelbooru.com'];
const REFERERS = { 'pximg.net': pixiv.REFERER };
const MUST_PROXY = ['donmai.us', 'pximg.net', 'gelbooru.com'];

function domainOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return PROXY_DOMAINS.find((d) => u.hostname === d || u.hostname.endsWith(`.${d}`)) ?? null;
  } catch {
    return null;
  }
}
// What the browser loads: through the NAS where the site needs it, else direct.
const view = (url) => (url && MUST_PROXY.includes(domainOf(url)) ? `/api/studio/img?u=${encodeURIComponent(url)}` : url);

async function pipeImage(url, res) {
  const domain = domainOf(url);
  if (!domain) throw new HttpError(400, 'Invalid image');
  const headers = { ...UA, ...(REFERERS[domain] ? { Referer: REFERERS[domain] } : {}) };
  const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  const type = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !type.startsWith('image/')) throw new HttpError(502, 'Picture unavailable');
  res.set('Content-Type', type);
  const len = upstream.headers.get('content-length');
  if (len) res.set('Content-Length', len);
  res.set('Cache-Control', 'private, max-age=604800, immutable');
  await new Promise((resolve, reject) => {
    const body = Readable.fromWeb(upstream.body);
    body.on('error', reject);
    res.on('close', resolve);
    body.pipe(res);
  });
}

// Signed links let Eagle (which has no login cookie) download originals from
// the NAS for a while. The key changes on every restart; links last 30 minutes.
const SIGN_KEY = crypto.randomBytes(32);
const SIGN_MS = 30 * 60 * 1000;
const signature = (u, exp) => crypto.createHmac('sha256', SIGN_KEY).update(`${u}|${exp}`).digest('base64url').slice(0, 32);
function signedPath(url) {
  const exp = Date.now() + SIGN_MS;
  return `/api/studio-file?u=${encodeURIComponent(url)}&e=${exp}&s=${signature(url, exp)}`;
}

// ---- Tags -----------------------------------------------------------------------------------

// Danbooru's category and post count for each tag (0 general, 1 artist, 3 series, 4 character, 5 meta).
const TAG_INFO = new Map(); // tag -> { category, count, known, at }
async function tagInfo(tags) {
  const out = new Map();
  const missing = [];
  for (const t of tags) {
    const hit = TAG_INFO.get(t);
    if (hit && Date.now() - hit.at < 24 * 3600 * 1000) out.set(t, hit);
    else missing.push(t);
  }
  // 100 tags per request (the Eagle export can ask about hundreds at once).
  const chunks = [];
  for (let i = 0; i < missing.length; i += 100) chunks.push(missing.slice(i, i + 100));
  await Promise.all(
    chunks.map(async (chunk) => {
      const rows = await dbDirect(`/tags.json?search%5Bname_comma%5D=${encodeURIComponent(chunk.join(','))}&only=name,category,post_count&limit=1000`).catch(() => null);
      const byName = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.name, r]));
      for (const t of chunk) {
        const r = byName.get(t);
        const info = { category: r?.category ?? 0, count: r?.post_count ?? 0, known: !!r, at: Date.now() };
        out.set(t, info);
        if (rows) TAG_INFO.set(t, info); // don't remember failures
      }
    }),
  );
  while (TAG_INFO.size > 20000) TAG_INFO.delete(TAG_INFO.keys().next().value);
  return out;
}

const plainName = (tag) => tag.replace(/_\([^)]*\)$/, '').replace(/_/g, ' ').trim();
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const hasCJK = (s) => /[぀-ヿ㐀-鿿]/.test(s);

// A Japanese name for Pixiv from Danbooru's wiki, else the plain English name.
async function japaneseName(tag) {
  return tagCache(`jp|${tag}`, async () => {
    const rows = await dbDirect(`/wiki_pages.json?search%5Btitle%5D=${encodeURIComponent(tag)}&only=title,other_names`).catch(() => []);
    const names = (Array.isArray(rows) ? rows[0]?.other_names : null) ?? [];
    return names.find((n) => hasCJK(n) && !/[\s_]/.test(n)) ?? plainName(tag);
  });
}

// ---- Items ------------------------------------------------------------------------------------

const pixivIdFrom = (url) => String(url ?? '').match(/pixiv\.net\/(?:artworks\/|member_illust\.php\?.*illust_id=|i\/)(\d+)|pximg\.net\/.*\/(\d+)_p\d+/)?.slice(1).find(Boolean) ?? null;

// The artist's original post, when its address names one work (not a profile):
// copies on different sites (other files or sizes) still collapse into one.
function sourceKey(url) {
  const s = String(url ?? '');
  const m =
    s.match(/artstation\.com\/(?:artwork|projects)\/([A-Za-z0-9]+)/) ??
    s.match(/(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/) ??
    s.match(/deviantart\.com\/[^/]+\/art\/[^/?#]*?-(\d+)/) ??
    s.match(/weibo\.com\/\d+\/([A-Za-z0-9]{8,})/);
  return m ? `src:${m[0].split('/')[0]}:${m[1]}` : null;
}

function finish(item, rawTags) {
  item.rawTags = rawTags;
  item.lower = new Set(rawTags.map((t) => String(t).toLowerCase()));
  item.ai = item.ai || AI_TAGS.some((t) => item.lower.has(t));
  item.keys = [item.md5 && `md5:${item.md5}`, item.pixivId && `px:${item.pixivId}`, sourceKey(item.sourceUrl), `${item.source}:${item.id}`].filter(Boolean);
  // How to follow or open the artist: a Danbooru artist tag, or "pixiv:<user id>".
  item.artistKey = item.source === 'pixiv' ? (item.pixivUser ? `pixiv:${item.pixivUser}` : null) : (item.artists[0] ?? null);
  return item;
}

function danbooruItem(p) {
  if (!p?.file_url || !['jpg', 'jpeg', 'png', 'webp'].includes(p.file_ext) || !(p.rating in DB_LEVEL)) return null;
  const variants = Object.fromEntries((p.media_asset?.variants ?? []).map((v) => [v.type, v.url]));
  const all = String(p.tag_string ?? '').split(' ').filter(Boolean);
  const item = {
    source: 'danbooru',
    id: String(p.id),
    postUrl: `https://danbooru.donmai.us/posts/${p.id}`,
    sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
    thumb: view(variants['360x360'] ?? p.preview_file_url),
    thumbLarge: view(variants['720x720'] ?? variants['360x360'] ?? p.preview_file_url),
    preview: view(p.large_file_url ?? p.file_url),
    rawPreview: p.large_file_url ?? null,
    original: p.file_url,
    width: p.image_width,
    height: p.image_height,
    score: p.score,
    artists: String(p.tag_string_artist ?? '').split(' ').filter(Boolean),
    characters: String(p.tag_string_character ?? '').split(' ').filter(Boolean),
    series: String(p.tag_string_copyright ?? '').split(' ').filter(Boolean),
    tags: String(p.tag_string_general ?? '').split(' ').filter(Boolean),
    level: DB_LEVEL[p.rating],
    md5: p.md5 ?? null,
    pixivId: p.pixiv_id ? String(p.pixiv_id) : pixivIdFrom(p.source),
    createdAt: Date.parse(p.created_at) || null,
  };
  // for adult.js's check
  item.spicy = item.level;
  item.all = new Set(all);
  return finish(item, all);
}

function moebooruItem(source, base, p) {
  if (!p?.file_url || !['s', 'q', 'e'].includes(p.rating)) return null;
  const tags = String(p.tags ?? '').split(' ').filter(Boolean);
  return finish(
    {
      source,
      id: String(p.id),
      postUrl: `${base}/post/show/${p.id}`,
      sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
      thumb: view(p.actual_preview_url ?? p.preview_url),
      rawThumb: p.actual_preview_url ?? p.preview_url,
      boardUrl: p.jpeg_url ?? p.sample_url ?? p.file_url,
      preview: view(p.sample_url ?? p.jpeg_url ?? p.file_url),
      original: p.file_url,
      width: p.width,
      height: p.height,
      score: p.score,
      artists: [],
      characters: [],
      series: [],
      tags,
      // Their "safe" includes fanservice (Danbooru's "sensitive"), and their
      // tags miss too much to tell the two apart (tested: suggestive pictures
      // of a minor character got through a tag filter). So "safe" counts as
      // spicy and questionable as explicit, unless Danbooru has the picture,
      // whose rating then decides (crossCheck).
      level: p.rating === 's' ? 1 : 2,
      md5: p.md5 ?? null,
      pixivId: pixivIdFrom(p.source),
      createdAt: p.created_at ? p.created_at * 1000 : null,
    },
    tags,
  );
}

function gelbooruItem(p) {
  const levels = { general: 0, sensitive: 1, questionable: 2, explicit: 2 };
  if (!p?.file_url || !(p.rating in levels)) return null;
  const tags = String(p.tags ?? '').split(' ').filter(Boolean);
  return finish(
    {
      source: 'gelbooru',
      id: String(p.id),
      postUrl: `https://gelbooru.com/index.php?page=post&s=view&id=${p.id}`,
      sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
      thumb: view(p.preview_url),
      rawThumb: p.preview_url,
      boardUrl: p.sample_url || p.file_url,
      preview: view(p.sample_url || p.file_url),
      original: p.file_url,
      width: p.width,
      height: p.height,
      score: p.score,
      artists: [],
      characters: [],
      series: [],
      tags,
      level: levels[p.rating],
      md5: p.md5 ?? null,
      pixivId: pixivIdFrom(p.source),
      createdAt: Date.parse(p.created_at) || null,
    },
    tags,
  );
}

// ---- Danbooru cross-check ------------------------------------------------------------------------

// Other sites rate differently: Yande.re's and Konachan's "safe" includes
// swimsuits and fanservice, which Danbooru rates "sensitive". So pictures from
// them are looked up on Danbooru by file hash: when Danbooru has the picture,
// its rating and character tags decide (with the full adults-only check);
// when it doesn't, the site's own rating is read strictly (see moebooruItem).
async function danbooruByMd5(md5s) {
  const out = new Map();
  const list = [...new Set(md5s.filter((m) => /^[0-9a-f]{32}$/.test(m ?? '')))];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const rows = await dbDirect(`/posts.json?limit=200&only=md5,rating,tag_string,tag_string_character,tag_string_artist,tag_string_copyright&tags=${encodeURIComponent(`md5:${chunk.join(',')}`)}`)
      .catch(() => null);
    if (!Array.isArray(rows)) throw new Error('Danbooru check unavailable');
    for (const p of rows) if (p.md5 && p.rating in DB_LEVEL) out.set(p.md5, p);
  }
  return out;
}

// Applies a Danbooru copy's rating and tags to `item`; returns whether it may be shown.
function applyDanbooru(item, p, ctx) {
  const level = DB_LEVEL[p.rating];
  const characters = String(p.tag_string_character ?? '').split(' ').filter(Boolean);
  const all = new Set(String(p.tag_string ?? '').split(' ').filter(Boolean));
  item.level = Math.max(item.levelFloor ?? 0, level);
  item.characters = characters;
  item.artists = String(p.tag_string_artist ?? '').split(' ').filter(Boolean);
  item.series = String(p.tag_string_copyright ?? '').split(' ').filter(Boolean);
  if (AI_TAGS.some((t) => all.has(t))) item.ai = true;
  if (!item.level) return true;
  return fanart.spicyFilter(ctx.level)({ spicy: item.level, characters, all });
}

// Keeps the items that pass: Danbooru's verdict where it has the picture,
// else `fallback` (the source's own strict rule).
async function crossCheck(items, ctx, fallback) {
  let known;
  try {
    known = await danbooruByMd5(items.map((i) => i.md5));
  } catch {
    known = null; // Danbooru down: only pictures that are safe by the strict rule
  }
  return items.filter((i) => {
    const p = i.md5 && known?.get(i.md5);
    if (p) return applyDanbooru(i, p, ctx);
    return fallback(i);
  });
}

// ---- Rules shared by all sources -----------------------------------------------------------------

// Non-Danbooru pictures above level 0: one known-adult character searched,
// tagged solo, no minor tags (and, for boorus, tagged with that character).
function otherLevelOk(item, ctx, { needTag = true } = {}) {
  if (!item.level) return true;
  if (item.level > ctx.level) return false;
  if (!item.lower.has('solo')) return false;
  if (hasMinorTag(item.rawTags)) return false;
  if (ctx.adultScope) return !needTag || item.lower.has(ctx.adultScope);
  // Not searching for one adult: a solo picture whose only known character tag
  // is a known adult (Danbooru-style names) still qualifies.
  if (!needTag) return false;
  const adults = adultTags();
  return item.rawTags.filter((t) => adults.has(t)).length === 1;
}

function passesFilters(i, f) {
  const w = Number(i.width) || 0;
  const h = Number(i.height) || 0;
  if (f.minEdge && Math.max(w, h) < f.minEdge) return false;
  if (f.orient && w && h) {
    const r = w / h;
    if (f.orient === 'portrait' && r > 0.95) return false;
    if (f.orient === 'landscape' && r < 1.05) return false;
    if (f.orient === 'square' && (r < 0.9 || r > 1.1)) return false;
  }
  if (f.minScore && i.score != null && i.score < f.minScore) return false;
  if (f.ai !== 'show' && i.ai) return false;
  const sketchy = SKETCH_TAGS.some((t) => i.lower.has(t));
  if (f.sketch === 'exclude' && sketchy) return false;
  if (f.sketch === 'only' && !sketchy) return false;
  if (f.comics !== 'show' && (i.comic || COMIC_TAGS.some((t) => i.lower.has(t)))) return false;
  if (f.solo && !i.lower.has('solo') && i.source !== 'pixiv') return false;
  if (LOW_TAGS.some((t) => i.lower.has(t))) return false;
  return true;
}

// ---- Sources ------------------------------------------------------------------------------------

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401 || res.status === 403) throw new Error('access denied');
  if (res.status === 429) throw new Error('rate limited');
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

function spaced(ms) {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(async () => {
      try {
        return await fn();
      } finally {
        await new Promise((r) => setTimeout(r, ms));
      }
    });
    tail = run.catch(() => {});
    return run;
  };
}
const moeQueues = { yandere: spaced(600), konachan: spaced(600) };
const gbQueue = spaced(400);

const needsSubject = (ctx) =>
  ctx.general.length ? "can't search pose, style or other general tags" : !ctx.chars.length && !ctx.series.length ? 'needs a character or series' : null;

const SOURCES = {
  danbooru: {
    label: 'Danbooru',
    available: () => true,
    // Anonymous searches allow 2 terms, and order:score counts as one. One tag:
    // "<tag> order:score". Several tags, best first: a pool of up to 1000 posts
    // with the two rarest tags, ranked by score here, then paged locally.
    async search(ctx) {
      const byRarity = [...ctx.tags].sort((a, b) => (ctx.info.get(a)?.count ?? 0) - (ctx.info.get(b)?.count ?? 0));
      const rating = fanart.ratingFor(ctx.level);
      const allowed = fanart.spicyFilter(ctx.level);
      const keep = (rows) =>
        (Array.isArray(rows) ? rows : [])
          .map(danbooruItem)
          .filter(Boolean)
          .filter((i) => ctx.tags.every((t) => i.all.has(t)))
          .filter(allowed);
      const fetchPage = (terms, page) =>
        dbDirect(`/posts.json?limit=100&page=${page}&only=${DB_FIELDS}&tags=${encodeURIComponent(`${terms.join(' ')} ${rating}`.trim())}`);

      if (ctx.sort === 'best' && ctx.tags.length >= 2) {
        // The pool grows as you scroll: 2 Danbooru pages first, more when needed.
        const terms = byRarity.slice(0, 2);
        const pool = await poolCache(`dbpool|${terms.join(' ')}|${ctx.tags.join(' ')}|${rating}`, async () => ({ items: [], next: 1, done: false, shown: new Set(), pages: [] }));
        const per = 60;
        // Pages are built in order and then kept, so page N is always the same.
        while (pool.pages.length < ctx.page) {
          while (!pool.done && pool.next <= 16 && pool.items.length - pool.shown.size < per) {
            const pages = await Promise.all([fetchPage(terms, pool.next), fetchPage(terms, pool.next + 1)]);
            pool.next += 2;
            for (const rows of pages) {
              pool.items.push(...keep(rows));
              if (!Array.isArray(rows) || rows.length < 100) pool.done = true;
            }
          }
          if (pool.next > 16) pool.done = true;
          // Best of what's gathered and not shown yet.
          const fresh = pool.items.filter((i) => !pool.shown.has(i.id)).sort((a, b) => b.score - a.score).slice(0, per);
          fresh.forEach((i) => pool.shown.add(i.id));
          pool.pages.push({ items: fresh, more: !pool.done || pool.items.length > pool.shown.size });
          if (!fresh.length) break;
        }
        return pool.pages[ctx.page - 1] ?? { items: [], more: false };
      }
      const send = ctx.sort === 'best' ? [...byRarity.slice(0, 1), 'order:score'] : byRarity.slice(0, 2);
      const rows = await fetchPage(send, ctx.page);
      return { items: keep(rows), more: Array.isArray(rows) && rows.length >= 75 };
    },
  },
  yandere: moebooru('yandere', 'Yande.re', 'https://yande.re'),
  konachan: moebooru('konachan', 'Konachan', 'https://konachan.com'),
  gelbooru: {
    label: 'Gelbooru',
    available: () => !!(process.env.GELBOORU_API_KEY && process.env.GELBOORU_USER_ID),
    unavailable: 'needs GELBOORU_API_KEY and GELBOORU_USER_ID in the server config',
    async search(ctx) {
      const parts = [...ctx.tags];
      if (ctx.sort === 'best') parts.push('sort:score:desc');
      if (ctx.level === 0) parts.push('rating:general');
      else if (ctx.level === 1) parts.push('-rating:questionable', '-rating:explicit');
      const url =
        `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&pid=${ctx.page - 1}` +
        `&tags=${encodeURIComponent(parts.join(' '))}&api_key=${encodeURIComponent(process.env.GELBOORU_API_KEY)}&user_id=${encodeURIComponent(process.env.GELBOORU_USER_ID)}`;
      const data = await gbQueue(() => getJson(url));
      const list = Array.isArray(data?.post) ? data.post : [];
      const items = await crossCheck(list.map(gelbooruItem).filter(Boolean), ctx, (i) => otherLevelOk(i, ctx));
      return { items, more: list.length >= 100 };
    },
  },
  zerochan: {
    label: 'Zerochan',
    available: () => true,
    skip: needsSubject,
    async search(ctx) {
      // Zerochan often spells long vowels out ("Gojou Satoru" where Danbooru now
      // says "gojo_satoru"): try the current name, the old Danbooru name, then
      // the long-vowel spelling.
      const subjects = [...ctx.chars, ...ctx.series].slice(0, 3);
      const longVowels = (s) => s.replace(/(?<=[^aeiou\s])o\b/g, 'ou').replace(/(?<=[^aeiou\s])u\b/g, 'uu');
      const variants = [
        subjects.map((t) => titleCase(plainName(t))),
        subjects.map((t) => titleCase(plainName(ctx.aliasOf?.get(t) ?? t))),
        subjects.map((t) => longVowels(titleCase(plainName(t)))),
      ].filter((v, i, all) => all.findIndex((x) => x.join() === v.join()) === i);
      let list = [];
      for (const names of variants) {
        const r = await zerochan(`/${encodeURI(names.map(zcPath).join(','))}?json&l=100&p=${ctx.page}&s=${ctx.sort === 'best' ? 'fav' : 'id'}`);
        list = r.data?.items ?? [];
        if (list.length) break;
      }
      const allowed = ctx.adultScope ? ctx.level : 0;
      const items = [];
      for (const p of list) {
        const tags = Array.isArray(p.tags) ? p.tags : [];
        const level = zerochanLevel(tags, allowed);
        if (level == null) continue;
        const primary = String(p.tag ?? '').replace(/ /g, '.');
        const item = finish(
          {
            source: 'zerochan',
            id: String(p.id),
            postUrl: `https://www.zerochan.net/${p.id}`,
            sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
            thumb: p.thumbnail,
            preview: primary ? `https://s1.zerochan.net/${encodeURIComponent(primary).replace(/%2E/g, '.')}.600.${p.id}.jpg` : p.thumbnail,
            rawPreview: primary ? `https://s1.zerochan.net/${encodeURIComponent(primary).replace(/%2E/g, '.')}.600.${p.id}.jpg` : null,
            original: null,
            resolve: true,
            width: Number(p.width) || 0,
            height: Number(p.height) || 0,
            score: null,
            artists: [],
            characters: [],
            series: [],
            tags,
            level,
            md5: p.md5 ?? null,
            pixivId: pixivIdFrom(p.source),
            createdAt: null,
          },
          tags,
        );
        item.levelFloor = level; // Zerochan's own tags can only raise the level
        items.push(item);
      }
      const checked = await crossCheck(items, ctx, (i) => otherLevelOk(i, ctx, { needTag: false }));
      return { items: checked, more: list.length >= 100 };
    },
  },
  wallhaven: {
    label: 'Wallhaven',
    available: () => true,
    skip: needsSubject,
    async search(ctx) {
      const words = [...ctx.chars, ...ctx.series].slice(0, 3).map((t) => `"${plainName(t)}"`).join(' ');
      const ratios = ctx.filters.orient === 'portrait' || ctx.filters.orient === 'landscape' ? `&ratios=${ctx.filters.orient}` : '';
      const r = await wallhaven(`/search?q=${encodeURIComponent(words)}&categories=010&purity=100&sorting=${ctx.sort === 'best' ? 'favorites' : 'date_added'}&page=${ctx.page}${ratios}`);
      const items = (r.data ?? [])
        .filter((p) => p.purity === 'sfw' && p.path)
        .map((p) =>
          finish(
            {
              source: 'wallhaven',
              id: String(p.id),
              postUrl: p.url,
              sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
              thumb: p.thumbs?.large ?? p.thumbs?.original,
              preview: p.path,
              rawPreview: p.path,
              original: p.path,
              width: p.dimension_x,
              height: p.dimension_y,
              score: p.favorites ?? null,
              artists: [],
              characters: [],
              series: [],
              tags: [],
              level: 0,
              md5: null,
              pixivId: pixivIdFrom(p.source),
              createdAt: Date.parse(p.created_at) || null,
            },
            [],
          ),
        );
      return { items, more: (r.meta?.current_page ?? 1) < (r.meta?.last_page ?? 1) };
    },
  },
  pixiv: {
    label: 'Pixiv',
    available: () => pixiv.isConnected(),
    unavailable: 'connect a Pixiv account in Settings → Art sources',
    skip: (ctx) => (ctx.pixivUsers.length || ctx.artistOnly ? null : ctx.artists.length ? "can't combine an artist with other tags" : needsSubject(ctx)),
    async search(ctx) {
      // An artist: their own works (Pixiv account from Danbooru's artist page).
      let userId = ctx.pixivUsers[0] ?? null;
      if (!userId && ctx.artistOnly) {
        userId = (await artistInfo(ctx.artists[0]).catch(() => null))?.pixivIds?.[0] ?? null;
        if (!userId) return { items: [], more: false, note: 'no Pixiv account known for this artist' };
      }
      if (userId) {
        const r = await pixiv.userIllusts(userId, { page: ctx.page });
        return { items: pixivItems(r.illusts), more: r.more };
      }
      const words = [];
      for (const t of [...ctx.chars, ...ctx.series].slice(0, 3)) words.push(await japaneseName(t));
      const r = await pixiv.searchIllusts(words.join(' '), { sort: ctx.sort, page: ctx.page });
      return { items: pixivItems(r.illusts), more: r.more, note: r.sortedBy === 'newest' && ctx.sort === 'best' ? 'sorted by newest (popular needs Pixiv Premium)' : null };
    },
  },
};

function pixivItems(illusts) {
  const items = [];
  for (const p of illusts) {
    // Safe pictures only (see the top of this file), no animations.
    if (p.type === 'ugoira' || p.x_restrict !== 0 || (p.sanity_level ?? 0) > 2) continue;
    const original = p.meta_single_page?.original_image_url ?? p.meta_pages?.[0]?.image_urls?.original;
    if (!original) continue;
    const tags = (p.tags ?? []).map((t) => t.translated_name || t.name);
    items.push(
      finish(
        {
          source: 'pixiv',
          id: String(p.id),
          postUrl: `https://www.pixiv.net/artworks/${p.id}`,
          sourceUrl: null,
          thumb: view(p.image_urls?.medium ?? p.image_urls?.square_medium),
          rawThumb: p.image_urls?.medium ?? p.image_urls?.square_medium,
          preview: view(p.image_urls?.large ?? p.image_urls?.medium),
          original,
          boardUrl: p.image_urls?.large ?? original,
          width: p.width,
          height: p.height,
          score: p.total_bookmarks ?? null,
          artists: p.user?.name ? [p.user.name] : [],
          pixivUser: p.user?.id ? String(p.user.id) : null,
          characters: [],
          series: [],
          tags,
          level: 0,
          md5: null,
          pixivId: String(p.id),
          createdAt: Date.parse(p.create_date) || null,
          ai: p.illust_ai_type === 2,
          comic: p.type === 'manga',
          pages: p.page_count ?? 1,
        },
        tags,
      ),
    );
  }
  return items;
}

// ---- Artists across sites ------------------------------------------------------------------------

// An artist's Danbooru tag, other names, Pixiv accounts and links, from
// Danbooru's artist page. `key` is a Danbooru artist tag or "pixiv:<user id>".
const artistCache = memo(24 * 3600 * 1000, 500);
const SITE_NAMES = [
  ['pixiv.net', 'Pixiv'], ['twitter.com', 'X / Twitter'], ['x.com', 'X / Twitter'], ['artstation.com', 'ArtStation'], ['deviantart.com', 'DeviantArt'],
  ['instagram.com', 'Instagram'], ['bsky.app', 'Bluesky'], ['fanbox.cc', 'pixivFANBOX'], ['patreon.com', 'Patreon'], ['skeb.jp', 'Skeb'],
  ['tumblr.com', 'Tumblr'], ['youtube.com', 'YouTube'], ['weibo.com', 'Weibo'], ['lofter.com', 'Lofter'], ['misskey.io', 'Misskey'],
];
function artistInfo(key) {
  return artistCache(key, async () => {
    const px = String(key).match(/^pixiv:(\d+)$/)?.[1];
    const query = px ? `search%5Burl_matches%5D=${encodeURIComponent(`https://www.pixiv.net/users/${px}`)}` : `search%5Bname%5D=${encodeURIComponent(key)}`;
    const rows = await dbDirect(`/artists.json?${query}&only=name,other_names,urls%5Burl,is_active%5D&limit=1`);
    const a = Array.isArray(rows) ? rows[0] : null;
    const urls = (a?.urls ?? []).filter((u) => u.is_active !== false).map((u) => u.url);
    const pixivIds = [...new Set([...(px ? [px] : []), ...urls.map((u) => u.match(/pixiv\.net\/(?:en\/)?(?:users\/|member\.php\?id=)(\d+)/)?.[1]).filter(Boolean)])];
    // One link per site (for Pixiv, the profile page rather than old addresses).
    const ranked = [...urls].sort((x, y) => Number(/pixiv\.net\/(en\/)?users\//.test(y)) - Number(/pixiv\.net\/(en\/)?users\//.test(x)));
    const seen = new Set();
    const links = ranked
      .map((url) => ({ url, site: SITE_NAMES.find(([d]) => url.includes(d))?.[1] ?? null }))
      .filter((l) => l.site && /^https?:\/\//.test(l.url) && !seen.has(l.site) && seen.add(l.site));
    if (px && !links.some((l) => l.site === 'Pixiv')) links.unshift({ url: `https://www.pixiv.net/users/${px}`, site: 'Pixiv' });
    return { key, tag: a?.name ?? null, name: (a?.name ?? key).replace(/_/g, ' '), otherNames: a?.other_names ?? [], pixivIds, links };
  });
}

function moebooru(key, label, base) {
  return {
    label,
    available: () => true,
    skip: (ctx) => (ctx.tags.length > 4 ? 'searches at most 4 tags' : null),
    async search(ctx) {
      const parts = [...ctx.tags];
      if (ctx.sort === 'best') parts.push('order:score');
      if (ctx.level === 0) parts.push('rating:s');
      const rows = await moeQueues[key](() => getJson(`${base}/post.json?limit=100&page=${ctx.page}&tags=${encodeURIComponent(parts.join(' '))}`));
      const list = Array.isArray(rows) ? rows : [];
      const items = await crossCheck(list.map((p) => moebooruItem(key, base, p)).filter(Boolean), ctx, (i) => otherLevelOk(i, ctx));
      return { items, more: list.length >= 100 };
    },
  };
}

// ---- Merging ------------------------------------------------------------------------------------

const area = (i) => (Number(i.width) || 0) * (Number(i.height) || 0);

// Takes turns between sources (each in its own best/newest order), so no
// single site floods the top. Copies of the same picture collapse into one,
// showing the highest-resolution copy.
function merge(lists) {
  const out = [];
  const byKey = new Map();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let n = 0; n < longest; n++) {
    for (const list of lists) {
      const i = list[n];
      if (!i) continue;
      const hit = i.keys.map((k) => byKey.get(k)).find(Boolean);
      if (hit) {
        hit.sources.push({ source: i.source, id: i.id, postUrl: i.postUrl });
        for (const k of i.keys) if (!hit.keys.includes(k)) hit.keys.push(k);
        for (const f of ['artists', 'characters', 'series']) if (!hit[f].length && i[f].length) hit[f] = i[f];
        // A booru artist tag beats a Pixiv account (it covers more sites).
        if (i.artistKey && (!hit.artistKey || (hit.artistKey.startsWith('pixiv:') && !i.artistKey.startsWith('pixiv:')))) hit.artistKey = i.artistKey;
        if (!hit.sourceUrl && i.sourceUrl) hit.sourceUrl = i.sourceUrl;
        hit.level = Math.max(hit.level, i.level);
        if (area(i) > area(hit)) Object.assign(hit, { from: i.source, fromId: i.id, thumb: hit.thumb ?? i.thumb, preview: i.preview, original: i.original, resolve: i.resolve, width: i.width, height: i.height });
        i.keys.forEach((k) => byKey.set(k, hit));
        continue;
      }
      const entry = { ...i, from: i.source, fromId: i.id, sources: [{ source: i.source, id: i.id, postUrl: i.postUrl }], keys: [...i.keys] };
      i.keys.forEach((k) => byKey.set(k, entry));
      out.push(entry);
    }
  }
  return out;
}

const publicItem = (i) => ({
  key: i.keys[0],
  keys: i.keys,
  source: i.from,
  id: i.fromId,
  sources: i.sources,
  postUrl: i.sources.find((s) => s.source === i.from)?.postUrl ?? i.postUrl,
  sourceUrl: i.sourceUrl,
  thumb: i.thumb,
  thumbLarge: i.thumbLarge ?? i.thumb,
  preview: i.preview,
  original: i.original,
  originalView: view(i.original),
  rawPreview: i.rawPreview ?? null,
  resolve: !!i.resolve && !i.original,
  width: i.width,
  height: i.height,
  score: i.score,
  artist: i.artists[0] ?? null,
  artists: i.artists,
  characters: i.characters,
  series: i.series,
  tags: i.tags.slice(0, 60),
  level: i.level,
  ai: i.ai,
  pages: i.pages ?? 1,
  createdAt: i.createdAt ?? null,
  pixivUser: i.pixivUser ?? null,
  artistKey: i.artistKey ?? null,
});

// ---- Query --------------------------------------------------------------------------------------

const TAG_RE = /^[^\s,]{1,80}$/;
function parseFilters(qs) {
  const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));
  return {
    minEdge: num(qs.minEdge, 20000),
    orient: ['portrait', 'landscape', 'square'].includes(qs.orient) ? qs.orient : '',
    minScore: num(qs.minScore, 100000),
    ai: qs.ai === 'show' ? 'show' : 'hide',
    sketch: ['exclude', 'only'].includes(qs.sketch) ? qs.sketch : 'include',
    comics: qs.comics === 'show' ? 'show' : 'hide',
    solo: qs.solo === '1',
  };
}

// Old names Danbooru redirects ("gojou_satoru" -> "gojo_satoru"): pictures carry
// the new name, so the search uses it too.
const ALIASES = new Map(); // tag -> { to, at }
async function resolveAliases(tags) {
  const unknown = tags.filter((t) => !ALIASES.has(t) || Date.now() - ALIASES.get(t).at > 24 * 3600 * 1000);
  const plainTags = unknown.filter((t) => TAG_RE.test(t) && !t.includes(':'));
  const chunks = [];
  for (let i = 0; i < plainTags.length; i += 100) chunks.push(plainTags.slice(i, i + 100));
  await Promise.all(
    chunks.map(async (chunk) => {
      const rows = await dbDirect(
        `/tag_aliases.json?search%5Bantecedent_name_comma%5D=${encodeURIComponent(chunk.join(','))}&search%5Bstatus%5D=active&only=antecedent_name,consequent_name&limit=1000`,
      ).catch(() => null);
      if (!Array.isArray(rows)) return;
      const map = new Map(rows.map((r) => [r.antecedent_name, r.consequent_name]));
      for (const t of chunk) ALIASES.set(t, { to: map.get(t) ?? t, at: Date.now() });
    }),
  );
  while (ALIASES.size > 20000) ALIASES.delete(ALIASES.keys().next().value);
  return tags.map((t) => ALIASES.get(t)?.to ?? t);
}

const shipMembers = db.prepare('SELECT character_id FROM ship_members WHERE ship_id = ? ORDER BY position');

// p: { tags (comma list), sort, page, ...filters }. Tags can also be
// "ship:<id>" (its members' Danbooru tags) or "pixiv:<user id>" (an artist).
async function buildContext(p, userId) {
  const raw = [...new Set(String(p.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  const found = [];
  const pixivUsers = [];
  for (const t of raw) {
    const ship = t.match(/^ship:(\d+)$/);
    if (ship) {
      for (const r of shipMembers.all(Number(ship[1]))) {
        const tag = await fanart.danbooruTag(r.character_id).catch(() => null);
        if (tag?.tag) found.push(tag.tag);
      }
      continue;
    }
    const px = t.match(/^pixiv:(\d+)$/);
    if (px) {
      const a = await artistInfo(t).catch(() => null);
      if (a?.tag) found.push(a.tag);
      else pixivUsers.push(px[1]);
      continue;
    }
    const low = t.toLowerCase();
    if (TAG_RE.test(low)) found.push(low);
  }
  const before = [...new Set(found)];
  const after = await resolveAliases(before);
  const tags = [...new Set(after)].slice(0, 8);
  // new name -> the name that was searched for (Zerochan may still use the old one)
  const aliasOf = new Map(after.map((t, i) => [t, before[i]]).filter(([a, b]) => a !== b));
  const info = await tagInfo(tags);
  const of = (cat) => tags.filter((t) => info.get(t)?.category === cat);
  const chars = of(4);
  const artists = of(1);
  const level = isSpicy(userId);
  const adults = adultTags();
  return {
    tags,
    info,
    chars,
    series: of(3),
    artists,
    general: tags.filter((t) => ![1, 3, 4, 5].includes(info.get(t)?.category)),
    artistOnly: artists.length === 1 && tags.length === 1,
    pixivUsers,
    aliasOf,
    onlyPixiv: pixivUsers.length > 0 && tags.length === 0,
    level,
    // The one character searched, when they're a known adult (for non-Danbooru spicy pictures).
    adultScope: level > 0 && chars.length === 1 && adults.has(chars[0]) ? chars[0] : null,
    sort: p.sort === 'new' ? 'new' : 'best',
    page: Math.max(1, Math.min(200, Number(p.page) || 1)),
    filters: parseFilters(p),
  };
}

const availableKeys = (wanted) => {
  const list = String(wanted ?? '').split(',').filter((s) => SOURCES[s]);
  return (list.length ? list : Object.keys(SOURCES)).filter((k) => SOURCES[k].available());
};

// One source's page: filtered and ready for the browser.
async function runSource(ctx, k) {
  const s = SOURCES[k];
  const why = ctx.onlyPixiv && k !== 'pixiv' ? 'this artist is only known on Pixiv' : s.skip?.(ctx);
  if (why) return { key: k, label: s.label, state: 'skipped', note: why, items: [] };
  try {
    const cacheKey = `${k}|${ctx.tags.join(' ')}|${ctx.pixivUsers.join(' ')}|${ctx.sort}|${ctx.page}|${ctx.level}|${ctx.adultScope ?? ''}|${ctx.filters.orient}`;
    const r = await pageCache(cacheKey, () => s.search(ctx));
    const items = r.items.filter((i) => passesFilters(i, ctx.filters));
    return { key: k, label: s.label, state: 'ok', count: items.length, more: !!r.more, note: r.note ?? null, items: merge([items]).map(publicItem) };
  } catch (err) {
    return { key: k, label: s.label, state: 'error', note: err.message, items: [] };
  }
}

// Streams one JSON line per source as soon as it answers (fast sources show first).
function startStream(res) {
  res.set('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.set('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  return (obj) => {
    if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(obj)}\n`);
  };
}

// ---- Routes -------------------------------------------------------------------------------------

const router = express.Router();

router.get('/studio/status', (req, res) => {
  res.json({
    sources: Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label, available: s.available(), note: s.available() ? null : s.unavailable })),
    pixiv: { connected: pixiv.isConnected(), user: pixiv.connectedAs() },
    level: isSpicy(req.user.id),
  });
});

router.get('/studio/search', wrap(async (req, res) => {
  const ctx = await buildContext(req.query, req.user.id);
  const keys = availableKeys(req.query.sources);
  const send = startStream(res);
  send({ type: 'start', sources: keys.map((k) => ({ key: k, label: SOURCES[k].label })), tags: ctx.tags.map((t) => ({ tag: t, category: ctx.info.get(t)?.category ?? 0, known: ctx.info.get(t)?.known ?? false })) });
  await Promise.all(keys.map(async (k) => send({ type: 'source', ...(await runSource(ctx, k)) })));
  send({ type: 'done' });
  res.end();
}));

// An artist across sites: names, links, Pixiv accounts.
router.get('/studio/artist', wrap(async (req, res) => {
  const key = String(req.query.key ?? '');
  if (!/^(pixiv:\d+|[^\s,]{1,80})$/.test(key)) throw new HttpError(400, 'Invalid artist');
  res.json(await artistInfo(key).catch(() => ({ key, tag: null, name: key.replace(/_/g, ' '), otherNames: [], pixivIds: [], links: [] })));
}));

// Newest works of everyone you follow, from every site that has them (streamed).
const followsOf = db.prepare('SELECT artist, name FROM art_follows WHERE user_id = ? ORDER BY created_at DESC LIMIT 20');
router.get('/studio/following', wrap(async (req, res) => {
  const follows = followsOf.all(req.user.id);
  const keys = availableKeys('danbooru,yandere,konachan,gelbooru,pixiv');
  const send = startStream(res);
  send({ type: 'start', artists: follows.map((f) => ({ key: f.artist, name: f.name })) });
  await Promise.all(
    follows.map(async (f) => {
      const ctx = await buildContext({ tags: f.artist, sort: 'new', page: 1 }, req.user.id).catch(() => null);
      if (!ctx) return;
      await Promise.all(keys.map(async (k) => send({ type: 'source', artist: f.artist, artistName: f.name, ...(await runSource(ctx, k)) })));
    }),
  );
  send({ type: 'done' });
  res.end();
}));

// For saving to boards: re-checks one post at its site with the same rules as the search.
async function fetchPost(source, id, { level = 0, scope = null } = {}) {
  if (!/^\d+$/.test(String(id))) return null;
  const ctx = { level, adultScope: level > 0 && scope && adultTags().has(scope) ? scope : null };
  let item = null;
  if (source === 'yandere' || source === 'konachan') {
    const base = source === 'yandere' ? 'https://yande.re' : 'https://konachan.com';
    const rows = await moeQueues[source](() => getJson(`${base}/post.json?limit=1&tags=${encodeURIComponent(`id:${id}`)}`));
    item = moebooruItem(source, base, Array.isArray(rows) ? rows[0] : null);
    if (item) item = (await crossCheck([item], ctx, (i) => otherLevelOk(i, ctx)))[0] ?? null;
  } else if (source === 'gelbooru' && SOURCES.gelbooru.available()) {
    const url = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&id=${id}&api_key=${encodeURIComponent(process.env.GELBOORU_API_KEY)}&user_id=${encodeURIComponent(process.env.GELBOORU_USER_ID)}`;
    const data = await gbQueue(() => getJson(url));
    item = gelbooruItem(Array.isArray(data?.post) ? data.post[0] : null);
    if (item) item = (await crossCheck([item], ctx, (i) => otherLevelOk(i, ctx)))[0] ?? null;
  } else if (source === 'pixiv' && pixiv.isConnected()) {
    const p = await pixiv.illustDetail(id);
    item = p ? (pixivItems([p])[0] ?? null) : null;
  }
  if (!item) return null;
  return {
    source,
    id: item.id,
    remoteUrl: item.boardUrl ?? item.original,
    remoteThumb: item.rawThumb ?? null,
    sourceUrl: item.sourceUrl,
    postUrl: item.postUrl,
    artist: item.artists[0] ?? null,
    width: item.width,
    height: item.height,
    spicy: item.level,
  };
}

// ---- Series of a character (for search suggestions) ----------------------------------------------

const seriesRow = db.prepare('SELECT series, fetched_at FROM tag_series WHERE tag = ?');
const saveSeries = db.prepare('INSERT OR REPLACE INTO tag_series (tag, series, fetched_at) VALUES (?, ?, ?)');
// "fate_(series)" -> "Fate", "kimetsu_no_yaiba" -> "Kimetsu no Yaiba"
const pretty = (tag) => titleCase(plainName(tag)).replace(/(?<=\s)(No|Wa|Wo|Ga|Ni|De|To|Na|Mo)(?=\s)/g, (w) => w.toLowerCase());

// Quick guess without asking anyone: the series in the tag ("saber_(fate)") or a saved lookup.
function knownSeries(tag) {
  const row = seriesRow.get(tag);
  if (row) return row.series;
  const q = tag.match(/_\(([^)]+)\)$/)?.[1];
  return q ? pretty(q) : null;
}

// The most common series among a character's best-scored pictures, saved for later.
async function lookupSeries(tag) {
  const row = seriesRow.get(tag);
  if (row && Date.now() - row.fetched_at < 90 * 24 * 3600 * 1000) return row.series;
  const rows = await dbDirect(`/posts.json?limit=20&only=tag_string_copyright&tags=${encodeURIComponent(`${tag} order:score`)}`);
  const counts = new Map();
  for (const p of Array.isArray(rows) ? rows : []) {
    for (const c of String(p.tag_string_copyright ?? '').split(' ').filter(Boolean)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const series = best ? pretty(best) : null;
  saveSeries.run(tag, series, Date.now());
  return series;
}

// A Danbooru post's characters, series, artists and tags ("More like this" on
// pictures from For you and Trending).
router.get('/studio/post-tags', wrap(async (req, res) => {
  if (!/^\d+$/.test(String(req.query.id ?? ''))) throw new HttpError(400, 'Invalid picture');
  const p = await dbDirect(`/posts/${req.query.id}.json?only=tag_string_character,tag_string_copyright,tag_string_artist,tag_string_general`);
  const split = (s) => String(s ?? '').split(' ').filter(Boolean);
  res.json({ characters: split(p.tag_string_character), series: split(p.tag_string_copyright), artists: split(p.tag_string_artist), tags: split(p.tag_string_general) });
}));

router.get('/studio/series', wrap(async (req, res) => {
  const tags = String(req.query.tags ?? '').split(',').filter((t) => TAG_RE.test(t)).slice(0, 12);
  const out = {};
  await Promise.all(tags.map(async (t) => (out[t] = await lookupSeries(t).catch(() => knownSeries(t)))));
  res.json({ series: out });
}));

// The original file of a Zerochan picture (its search results only give previews).
router.get('/studio/resolve', wrap(async (req, res) => {
  if (req.query.source !== 'zerochan' || !/^\d+$/.test(String(req.query.id ?? ''))) throw new HttpError(400, 'Invalid picture');
  const r = await zerochan(`/${req.query.id}?json`);
  const p = r.data;
  if (!p?.id) throw new HttpError(404, 'Picture not found');
  const tags = Array.isArray(p.tags) ? p.tags : [];
  // Same rule as in the search: above level 0 only for one known-adult character, solo.
  const scope = String(req.query.scope ?? '');
  const level = isSpicy(req.user.id);
  const allowed = level > 0 && scope && adultTags().has(scope) && tags.includes('Solo') ? level : 0;
  if (zerochanLevel(tags, allowed) == null) throw new HttpError(403, 'Not allowed here');
  const original = p.full ?? p.large;
  res.json({ original, originalView: view(original), width: p.width, height: p.height });
}));

router.get('/studio/img', wrap(async (req, res) => {
  await pipeImage(String(req.query.u ?? ''), res);
}));

// Signed links for Eagle, for originals from the allowed sites.
router.post('/studio/sign', (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls.slice(0, 200) : [];
  res.json({ urls: urls.map((u) => (typeof u === 'string' && domainOf(u) ? signedPath(u) : null)) });
});

// Everything Eagle needs for each picture: a signed download link, a name,
// grouped tags (eagle-tags.js), a note with credits and links, a star rating
// from popularity, the posting date, and names for sorting into folders.
// items: [{ original, source, id, tags, characters, series, artists, width,
// height, score, ai, createdAt, sourceUrl, postUrl, sources }]
router.post('/studio/eagle', wrap(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
  const opts = { style: req.body?.style === 'plain' ? 'plain' : 'grouped', other: req.body?.other === true };
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 300) : []);
  // Ask Danbooru what kind of tag each one is (character, series, artist…) for
  // sites that don't say.
  // Tags from other sites go through Danbooru's aliases first, so one character
  // gets one name ("Gojou Satoru" on Zerochan = "gojo_satoru" on Danbooru).
  const norm = (t) => String(t).toLowerCase().replace(/ /g, '_');
  const unknown = new Set();
  for (const i of items) for (const t of [...arr(i.characters), ...arr(i.series), ...(i.source !== 'danbooru' ? arr(i.tags) : [])]) unknown.add(norm(t));
  const names = [...unknown].filter((t) => TAG_RE.test(t));
  const resolved = new Map();
  const after = await resolveAliases(names);
  names.forEach((t, n) => resolved.set(t, after[n]));
  const canon = (list) => list.map((t) => resolved.get(norm(t)) ?? norm(t));
  for (const i of items) {
    i.characters = canon(arr(i.characters));
    i.series = canon(arr(i.series));
    if (i.source !== 'danbooru') i.tags = canon(arr(i.tags));
  }
  const info = await tagInfo([...new Set(items.filter((i) => i.source !== 'danbooru').flatMap((i) => i.tags))].filter((t) => TAG_RE.test(t)));
  const { eagleTags, starsFor, personName, seriesName, plain, SITE_NAMES: SITES } = require('./eagle-tags');
  const out = items.map((i) => {
    const original = typeof i.original === 'string' && domainOf(i.original) ? i.original : null;
    if (!original) return null;
    const item = { ...i, tags: arr(i.tags), characters: arr(i.characters), series: arr(i.series), artists: arr(i.artists), sources: Array.isArray(i.sources) ? i.sources.slice(0, 10) : [] };
    const tags = eagleTags(item, info, opts);
    // Characters/series/artist as found (including ones only the tag lookup knew).
    const pick = (prefix) => tags.filter((t) => t.startsWith(`${prefix}: `)).map((t) => t.slice(prefix.length + 2));
    const chars = opts.style === 'plain' ? item.characters.map(personName) : pick('Character');
    const series = opts.style === 'plain' ? item.series.map(seriesName) : pick('Series');
    const artist = opts.style === 'plain' ? item.artists.map(plain)[0] : pick('Artist')[0];
    const name = [chars.slice(0, 3).join(', '), series[0], artist && `by ${artist}`].filter(Boolean).join(' – ') || `${SITES[i.source] ?? i.source} ${i.id}`;
    const date = Number(i.createdAt) || null;
    const annotation = [
      [artist && `Artist: ${artist}`, i.width && i.height && `${i.width}×${i.height}`, date && `posted ${new Date(date).toISOString().slice(0, 10)}`, i.score != null && `★ ${i.score} on ${SITES[i.source] ?? i.source}`].filter(Boolean).join(' · '),
      ...item.sources.filter((s) => typeof s?.postUrl === 'string').map((s) => `${SITES[s.source] ?? s.source}: ${s.postUrl}`),
      typeof i.sourceUrl === 'string' && i.sourceUrl ? `Artist's post: ${i.sourceUrl}` : null,
      `Saved from Anime Hub on ${new Date().toISOString().slice(0, 10)}`,
    ]
      .filter(Boolean)
      .join('\n');
    return {
      url: signedPath(original),
      name: name.slice(0, 200),
      website: (typeof i.sourceUrl === 'string' && i.sourceUrl) || (typeof i.postUrl === 'string' ? i.postUrl : ''),
      tags,
      annotation,
      star: starsFor(i),
      modificationTime: date,
      folders: { character: chars[0] ?? null, series: series[0] ?? null, artist: artist ?? null },
    };
  });
  res.json({ items: out });
}));

// Saved searches.
router.get('/studio/searches', (req, res) => {
  res.json(q.searches.all(req.user.id).map((s) => ({ id: s.id, name: s.name, query: JSON.parse(s.query), createdAt: s.created_at })));
});
router.post('/studio/searches', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  if (!name) throw new HttpError(400, 'Give the search a name');
  const query = JSON.stringify(req.body?.query ?? {});
  if (query.length > 4000) throw new HttpError(400, 'That search is too big to save');
  const id = Number(q.addSearch.run(req.user.id, name, query, Date.now()).lastInsertRowid);
  res.status(201).json({ id, name, query: JSON.parse(query) });
});
router.delete('/studio/searches/:id', (req, res) => {
  q.delSearch.run(parseId(req.params.id), req.user.id);
  res.status(204).end();
});

// Pixiv connection (server-wide).
router.post('/studio/pixiv/login', (req, res) => {
  res.json({ url: pixiv.loginUrl() });
});
router.post('/studio/pixiv/connect', wrap(async (req, res) => {
  try {
    const user = await pixiv.connect(req.body?.code);
    res.json({ connected: true, user });
  } catch (err) {
    throw new HttpError(400, err.message);
  }
}));
router.delete('/studio/pixiv', (req, res) => {
  pixiv.disconnect();
  res.json({ connected: pixiv.isConnected() });
});

// Public (no login): signed original downloads for Eagle.
const fileRouter = express.Router();
fileRouter.get('/studio-file', wrap(async (req, res) => {
  const u = String(req.query.u ?? '');
  const exp = Number(req.query.e);
  const sig = String(req.query.s ?? '');
  const good = signature(u, exp);
  if (!exp || Date.now() > exp || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) {
    throw new HttpError(403, 'This link has expired');
  }
  await pipeImage(u, res);
}));

module.exports = { studioRouter: router, studioFileRouter: fileRouter, merge, passesFilters, danbooruItem, moebooruItem, otherLevelOk, fetchPost, artistInfo, knownSeries, dbDirect, domainOf };
