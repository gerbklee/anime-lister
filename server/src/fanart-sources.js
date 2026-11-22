// Extra fan art sources (Zerochan, Wallhaven) and the cross-source ranking.
//
// Ranking is popularity only and fully automatic:
//   1. Each source returns its results ordered by its own popularity signal
//      (Danbooru score, Zerochan favourites, Wallhaven favourites). A picture's
//      rating is its position within that source's list as 0–100, pulled
//      towards 50 when a source returned only a few results.
//   2. The same picture on several sites (same file MD5, or the same original
//      X/Pixiv post) is merged into one entry; it keeps the best resolution,
//      all links, and gets +10 per extra site.
const { db } = require('./db');
const { character } = require('./pictures');

const ZEROCHAN = 'https://www.zerochan.net';
const WALLHAVEN = 'https://wallhaven.cc/api/v1';
// Zerochan asks for an identifying User-Agent; this one is generic on purpose.
const UA = { 'User-Agent': 'AnimeHub/1.0 (self-hosted fan art viewer)' };
const TAG_FRESH_MS = 30 * 24 * 3600 * 1000;

// Zerochan has no content rating. Nudity tags are always filtered out (as are
// low-quality tags); suggestive tags only pass with spicy art on, for subjects
// that are known adults. Wallhaven: SFW, plus "sketchy" with spicy art.
const ZC_BAD = new Set([
  'Nudity', 'Partially Nude', 'Nude', 'Nipples', 'Topless', 'Bottomless', 'Sex', 'Hentai',
  'Comic', '4-Koma', 'Doujinshi', 'Sketch', 'Monochrome', 'Lineart', 'Screenshot', 'Character Sheet', 'Text',
]);
const ZC_SPICY = new Set(['Ecchi', 'Fanservice', 'Underwear', 'Lingerie', 'Panties', 'Bra', 'Cleavage', 'Swimsuit', 'Bikini', 'Seductive']);
const { MINOR_TAGS } = require('./adult');

const q = {
  tag: db.prepare('SELECT tag, post_count, fetched_at FROM fanart_tags WHERE character_id = ? AND source = ?'),
  saveTag: db.prepare('INSERT OR REPLACE INTO fanart_tags (character_id, source, tag, post_count, fetched_at) VALUES (?, ?, ?, ?, ?)'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const cache = memo(6 * 3600 * 1000);

// Both sites limit requests per minute, so requests are queued and spaced.
function queue(spacingMs) {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(async () => {
      try {
        return await fn();
      } finally {
        await sleep(spacingMs);
      }
    });
    tail = run.catch(() => {});
    return run;
  };
}
const zcQueue = queue(1100); // Zerochan: max ~60/min
const whQueue = queue(1400); // Wallhaven: max 45/min

// Zerochan's JSON comes wrapped: a stray "{" before it, a bit of page HTML
// after it, and often status 500. This pulls out the first complete object.
function extractObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function parseLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Try each "{" near the start until one yields a complete, valid object.
    for (let i = text.indexOf('{'); i >= 0 && i < 200; i = text.indexOf('{', i + 1)) {
      const obj = extractObject(text, i);
      if (!obj) continue;
      try {
        return JSON.parse(obj);
      } catch {
        // not this one
      }
    }
    return null;
  }
}

async function zerochan(path, { follow = true } = {}) {
  return zcQueue(async () => {
    const res = await fetch(`${ZEROCHAN}${path}`, { headers: UA, signal: AbortSignal.timeout(15_000), redirect: follow ? 'follow' : 'manual' });
    if (!follow && res.status >= 300 && res.status < 400) return { status: res.status, location: res.headers.get('location'), data: null };
    const text = await res.text();
    return { status: res.status, url: res.url, data: parseLoose(text) };
  });
}

async function wallhaven(path) {
  return whQueue(async () => {
    const res = await fetch(`${WALLHAVEN}${path}`, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (res.status === 429) throw new Error('rate limited');
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  });
}

// ---- Zerochan ------------------------------------------------------------------------------

const zcPath = (tag) => tag.replace(/ /g, '+');

// Zerochan tags are "Surname Given" ("Gojou Satoru"); asking with AniList's
// order redirects to the right tag.
async function zerochanTag(characterId) {
  const cached = q.tag.get(characterId, 'zerochan');
  if (cached && Date.now() - cached.fetched_at < TAG_FRESH_MS) return cached.tag;
  const c = await character(characterId);
  const parts = c.name.replace(/[^\p{L}\p{N}\s.'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  let tag = null;
  for (const variant of [...new Set([parts.join(' '), [...parts].reverse().join(' ')])]) {
    if (!variant) continue;
    // A redirect means Zerochan knows the name under another spelling or order;
    // the redirect drops "?json", so read the tag from it and ask again.
    let r = await zerochan(`/${encodeURI(zcPath(variant))}?json&l=1`, { follow: false });
    let candidate = variant;
    if (r.location) {
      candidate = decodeURIComponent(r.location.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').split('?')[0]).replace(/\+/g, ' ');
      r = await zerochan(`/${encodeURI(zcPath(candidate))}?json&l=1`, { follow: false });
    }
    if (r.data?.items?.length) {
      tag = candidate;
      break;
    }
  }
  q.saveTag.run(characterId, 'zerochan', tag, null, Date.now());
  return tag;
}

function fromZerochan(p, { spicy = false } = {}) {
  if (!p?.id) return null;
  const tags = Array.isArray(p.tags) ? p.tags : [];
  if (tags.some((t) => ZC_BAD.has(t))) return null;
  const isSpicy = tags.some((t) => ZC_SPICY.has(t));
  if (isSpicy && (!spicy || tags.some((t) => MINOR_TAGS.has(t)))) return null;
  const width = Number(p.width) || 0;
  const height = Number(p.height) || 0;
  if (Math.max(width, height) < 600) return null;
  const primary = String(p.tag ?? '').replace(/ /g, '.');
  return {
    source: 'zerochan',
    id: String(p.id),
    thumb: p.thumbnail,
    full: primary ? `https://s1.zerochan.net/${encodeURIComponent(primary).replace(/%2E/g, '.')}.600.${p.id}.jpg` : p.thumbnail,
    remoteUrl: null, // looked up on save (the full file's extension varies)
    remoteThumb: p.thumbnail,
    width,
    height,
    score: null,
    artist: null,
    sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
    postUrl: `${ZEROCHAN}/${p.id}`,
    md5: p.md5 ?? null,
    solo: tags.includes('Solo'),
    spicy: isSpicy,
  };
}

async function zerochanResults(info, { sort, solo, spicy = false }) {
  const tags = [];
  for (const id of info.memberIds) {
    const t = await zerochanTag(id);
    if (!t) return [];
    tags.push(t);
  }
  const path = `/${encodeURI(tags.map(zcPath).join(','))}?json&l=100&s=${sort === 'best' ? 'fav' : 'id'}`;
  const r = await cache(`zc|${path}`, () => zerochan(path));
  return (r.data?.items ?? []).map((p) => fromZerochan(p, { spicy })).filter((i) => i && (!solo || i.solo));
}

// Exact post details (for saving).
async function zerochanPost(id, { spicy = false } = {}) {
  const r = await zerochan(`/${id}?json`);
  const p = r.data;
  if (!p?.id) return null;
  const tags = Array.isArray(p.tags) ? p.tags : [];
  if (tags.some((t) => ZC_BAD.has(t))) return null;
  const isSpicy = tags.some((t) => ZC_SPICY.has(t));
  if (isSpicy && (!spicy || tags.some((t) => MINOR_TAGS.has(t)))) return null;
  return {
    source: 'zerochan',
    id: String(p.id),
    thumb: p.medium ?? p.small,
    full: p.large ?? p.full,
    remoteUrl: p.full ?? p.large,
    remoteThumb: p.large ?? p.medium,
    width: p.width,
    height: p.height,
    score: null,
    artist: null,
    sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
    postUrl: `${ZEROCHAN}/${p.id}`,
    spicy: isSpicy,
  };
}

// ---- Wallhaven ---------------------------------------------------------------------------

function fromWallhaven(p, { spicy = false } = {}) {
  if (!p?.id || p.category !== 'anime' || !p.path) return null;
  if (!(p.purity === 'sfw' || (spicy && p.purity === 'sketchy'))) return null;
  return {
    source: 'wallhaven',
    id: String(p.id),
    thumb: p.thumbs?.large ?? p.thumbs?.original,
    full: p.path,
    remoteUrl: p.path,
    remoteThumb: p.thumbs?.large ?? p.thumbs?.original,
    width: p.dimension_x,
    height: p.dimension_y,
    score: p.favorites ?? null,
    artist: null,
    sourceUrl: /^https?:\/\//.test(p.source ?? '') ? p.source : null,
    postUrl: p.url,
    md5: null,
    spicy: p.purity === 'sketchy',
  };
}

// Single characters only (Wallhaven can't search for two characters at once),
// and only full names, so a bare "Levi" doesn't match random wallpapers.
async function wallhavenResults(info, { sort, solo, spicy = false }) {
  if (info.kind !== 'character' || solo) return [];
  const c = await character(info.memberIds[0]);
  if (c.name.trim().split(/\s+/).length < 2) return [];
  const sorting = sort === 'best' ? 'favorites' : 'date_added';
  // Wallhaven writes "Gojo", AniList "Gojou": try the short spelling first.
  const short = c.name.replace(/ou/g, 'o').replace(/uu/g, 'u');
  for (const name of [...new Set([short, c.name])]) {
    const out = [];
    for (const page of [1, 2]) {
      const path = `/search?q=${encodeURIComponent(`"${name}"`)}&categories=010&purity=${spicy ? '110' : '100'}&sorting=${sorting}&page=${page}`;
      const r = await cache(`wh|${path}`, () => wallhaven(path));
      out.push(...(r.data ?? []).map((p) => fromWallhaven(p, { spicy })).filter(Boolean));
      if ((r.meta?.last_page ?? 1) <= page) break;
    }
    if (out.length) return out;
  }
  return [];
}

async function wallhavenPost(id, { spicy = false } = {}) {
  if (!/^[a-z0-9]+$/i.test(String(id))) return null;
  const r = await wallhaven(`/w/${id}`);
  return fromWallhaven(r.data, { spicy });
}

// ---- Cross-source ranking ----------------------------------------------------------------

// Identifies the original post behind a picture (X/Twitter status or Pixiv page).
function originKey(url) {
  if (!url) return null;
  let m = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d+)/i);
  if (m) return `x:${m[1]}`;
  m = url.match(/pixiv\.net\/(?:[a-z]{2}\/)?artworks\/(\d+)/i) ?? url.match(/illust_id=(\d+)/i);
  if (m) return `px:${m[1]}_0`;
  m = url.match(/pximg\.net\/.*\/(\d+)_p(\d+)/i);
  if (m) return `px:${m[1]}_${m[2]}`;
  return null;
}

const SOURCE_LABELS = { danbooru: 'Danbooru', zerochan: 'Zerochan', wallhaven: 'Wallhaven', safebooru: 'Safebooru' };

// lists: { danbooru: [...], zerochan: [...], wallhaven: [...] }, each in that
// source's own popularity (or newest) order. Returns one ranked list.
function rankAcrossSources(lists) {
  const rated = [];
  for (const [source, list] of Object.entries(lists)) {
    const n = list.length;
    const confidence = Math.min(1, n / 40);
    list.forEach((item, i) => {
      const pct = n > 1 ? 100 * (1 - i / (n - 1)) : 100;
      rated.push({ ...item, sourceRating: 50 + (pct - 50) * confidence, topPercent: Math.max(1, Math.round(((i + 1) / n) * 100)) });
    });
  }

  // Merge duplicates (union by MD5 and origin post).
  const groupOf = new Map();
  const groups = [];
  for (const item of rated) {
    const keys = [item.md5 && `md5:${item.md5}`, originKey(item.sourceUrl)].filter(Boolean);
    let g = keys.map((k) => groupOf.get(k)).find((x) => x != null);
    if (g == null) {
      g = groups.length;
      groups.push([]);
    }
    groups[g].push(item);
    for (const k of keys) if (!groupOf.has(k)) groupOf.set(k, g);
  }

  return groups
    .map((members) => {
      // One entry per source in a group (keep that source's best).
      const bySource = new Map();
      for (const m of members) if (!bySource.has(m.source) || bySource.get(m.source).sourceRating < m.sourceRating) bySource.set(m.source, m);
      const unique = [...bySource.values()];
      const primary = [...unique].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
      const best = Math.max(...unique.map((m) => m.sourceRating));
      const rating = Math.min(100, Math.round(best + 10 * (unique.length - 1)));
      const top = [...unique].sort((a, b) => a.topPercent - b.topPercent)[0];
      return {
        ...primary,
        artist: unique.find((m) => m.artist)?.artist ?? null,
        sourceUrl: unique.find((m) => m.sourceUrl)?.sourceUrl ?? null,
        rating,
        popularity:
          unique.length > 1
            ? `On ${unique.map((m) => SOURCE_LABELS[m.source]).join(' & ')}`
            : `Top ${top.topPercent}% on ${SOURCE_LABELS[top.source]}`,
        sources: unique.map((m) => ({ source: m.source, id: m.id, postUrl: m.postUrl })),
      };
    })
    .sort((a, b) => b.rating - a.rating);
}

module.exports = { zerochanResults, wallhavenResults, zerochanPost, wallhavenPost, rankAcrossSources, SOURCE_LABELS };
