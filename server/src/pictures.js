// Alternative character images (no uploads):
//   - MyAnimeList pictures via the Jikan API. The AniList character is matched
//     to its MAL counterpart through an anime it appears in, by name.
//   - Fan art from Safebooru (work-safe image board), found by tag.
// Also handles choosing a profile photo from those images.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { getCharacter } = require('./anilist');
const { cacheImage, isAllowedImageUrl, removeImageIfUnused } = require('./images');
const { getUser } = require('./users');

const JIKAN = 'https://api.jikan.moe/v4';
const SAFEBOORU = 'https://safebooru.org';
const UA = { 'User-Agent': 'AnimeLister/1.0 (self-hosted)' };
const CACHE_MS = 60 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function memo() {
  const map = new Map();
  return async (key, fn) => {
    const hit = map.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await fn();
    map.set(key, { at: Date.now(), value });
    if (map.size > 300) map.delete(map.keys().next().value);
    return value;
  };
}

const characterCache = memo();
const malCache = memo();
const tagCache = memo();
const postCache = memo();

const character = (id) => characterCache(id, () => getCharacter(id));

// ---- MyAnimeList (Jikan) -----------------------------------------------------------

// Jikan allows ~3 requests/second; requests are queued and spaced out.
let jikanQueue = Promise.resolve();
function jikan(path) {
  const run = jikanQueue.then(async () => {
    try {
      const res = await fetch(`${JIKAN}${path}`, { headers: UA, signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`status ${res.status}`);
      return await res.json();
    } catch (err) {
      throw new HttpError(503, `MyAnimeList (Jikan) is unavailable right now (${err.message}). Try again later.`);
    } finally {
      await sleep(400);
    }
  });
  jikanQueue = run.catch(() => {});
  return run;
}

// "Yeager, Eren" and "Eren Yeager" both become "eren yeager".
const nameTokens = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .sort();

function findMalCharacter(list, aniName) {
  const target = nameTokens(aniName);
  const key = target.join(' ');
  const exact = list.find((c) => nameTokens(c.character.name).join(' ') === key);
  if (exact) return exact.character;
  // "Levi" vs "Ackerman, Levi": accept a unique subset match.
  const subset = list.filter((c) => {
    const tokens = nameTokens(c.character.name);
    const [small, big] = tokens.length < target.length ? [tokens, target] : [target, tokens];
    return small.length > 0 && small.every((t) => big.includes(t));
  });
  return subset.length === 1 ? subset[0].character : null;
}

async function malPictures(characterId) {
  return malCache(characterId, async () => {
    const c = await character(characterId);
    const animeWithMal = c.media.filter((m) => m.type === 'ANIME' && m.idMal).slice(0, 2);
    for (const anime of animeWithMal) {
      const cast = await jikan(`/anime/${anime.idMal}/characters`);
      const match = cast?.data ? findMalCharacter(cast.data, c.name) : null;
      if (!match) continue;
      const pics = await jikan(`/characters/${match.mal_id}/pictures`);
      const images = (pics?.data ?? [])
        .map((p) => p.jpg?.image_url || p.webp?.image_url)
        .filter((u) => u && isAllowedImageUrl(u));
      const main = match.images?.jpg?.image_url;
      if (main && isAllowedImageUrl(main) && !images.includes(main)) images.unshift(main);
      return { malId: match.mal_id, images };
    }
    return { malId: null, images: [] };
  });
}

// ---- Safebooru --------------------------------------------------------------------

async function sbJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new HttpError(503, `Safebooru is unavailable right now (${err.message}).`);
  }
  if (!res.ok) throw new HttpError(503, `Safebooru is unavailable right now (status ${res.status}).`);
  const text = await res.text();
  if (!text.trim()) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"');

function sbTags(term) {
  const clean = term.trim().toLowerCase().replace(/\s+/g, '_');
  if (clean.length < 2) return Promise.resolve([]);
  return tagCache(clean, async () => {
    const rows = await sbJson(`${SAFEBOORU}/autocomplete.php?q=${encodeURIComponent(clean)}`);
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      tag: decode(r.value),
      count: Number(String(r.label).match(/\((\d+)\)\s*$/)?.[1] ?? 0),
    }));
  });
}

function sbPosts(tag) {
  return postCache(tag, async () => {
    const tags = `${tag} rating:general`;
    const rows = await sbJson(
      `${SAFEBOORU}/index.php?page=dapi&s=post&q=index&json=1&limit=40&tags=${encodeURIComponent(tags)}`,
    );
    return (Array.isArray(rows) ? rows : [])
      .map((p) => ({ thumb: p.preview_url, full: p.sample_url || p.file_url, width: p.width, height: p.height }))
      .filter((p) => p.thumb && p.full && isAllowedImageUrl(p.full));
  });
}

// Guesses the Safebooru tag for a character, e.g. "gojou_satoru" or
// "levi_(shingeki_no_kyojin)". Returns the best tag and other candidates.
async function guessTag(c) {
  const parts = c.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { tag: null, candidates: [] };
  const variants = new Set([parts.join('_'), [...parts].reverse().join('_')]);
  const seriesWords = (c.media[0]?.romaji || c.media[0]?.title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

  const found = new Map();
  for (const v of variants) for (const t of await sbTags(v)) found.set(t.tag, t);

  const score = (t) => {
    const base = t.tag.replace(/_\(.*\)$/, '');
    const qualifier = t.tag.match(/_\((.*)\)$/)?.[1] ?? '';
    let s = 0;
    if (variants.has(base)) s += 100;
    if (qualifier && seriesWords.some((w) => qualifier.includes(w))) s += 50;
    return s + Math.log10(t.count + 1);
  };
  const ranked = [...found.values()].sort((a, b) => score(b) - score(a));
  const best = ranked[0] && score(ranked[0]) >= 100 ? ranked[0].tag : null;
  return { tag: best, candidates: ranked.slice(0, 8) };
}

// ---- Routes -------------------------------------------------------------------------

const router = express.Router();

router.get('/characters/:id/images/anilist', wrap(async (req, res) => {
  const c = await character(parseId(req.params.id));
  res.json({ name: c.name, images: c.image ? [c.image] : [] });
}));

router.get('/characters/:id/images/mal', wrap(async (req, res) => {
  const result = await malPictures(parseId(req.params.id));
  res.json(result);
}));

router.get('/characters/:id/images/fanart', wrap(async (req, res) => {
  const c = await character(parseId(req.params.id));
  const requested = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
  const guess = requested ? { tag: requested, candidates: [] } : await guessTag(c);
  const images = guess.tag ? await sbPosts(guess.tag) : [];
  res.json({ tag: guess.tag, candidates: guess.candidates, images });
}));

router.get('/fanart/tags', wrap(async (req, res) => {
  const term = String(req.query.q ?? '');
  res.json((await sbTags(term)).slice(0, 10));
}));

// Profile photo: any image from the sources above, cached on the server.
router.put('/me/avatar', wrap(async (req, res) => {
  const me = req.user.id;
  const old = db.prepare('SELECT avatar_file FROM users WHERE id = ?').get(me)?.avatar_file;
  let file = null;
  if (req.body?.imageUrl != null) {
    if (!isAllowedImageUrl(req.body.imageUrl)) throw new HttpError(400, 'Please pick one of the suggested images.');
    try {
      file = await cacheImage(req.body.imageUrl);
    } catch (err) {
      throw new HttpError(502, `Could not download that image: ${err.message}`);
    }
  }
  db.prepare('UPDATE users SET avatar_file = ? WHERE id = ?').run(file, me);
  if (old && old !== file) removeImageIfUnused(old);
  res.json(getUser(me));
}));

// Tag counts over a character's solo pictures (for "My type" looks traits).
// Requests are spaced out to be gentle with Safebooru.
let sbQueue = Promise.resolve();
function sbTagCounts(tag) {
  const run = sbQueue.then(async () => {
    try {
      const rows = await sbJson(
        `${SAFEBOORU}/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeURIComponent(`${tag} solo rating:general`)}`,
      );
      const counts = new Map();
      const posts = Array.isArray(rows) ? rows : [];
      for (const p of posts) {
        for (const t of new Set(String(p.tags ?? '').split(/\s+/))) if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      return { posts: posts.length, counts };
    } finally {
      await sleep(600);
    }
  });
  sbQueue = run.catch(() => {});
  return run;
}

module.exports = { picturesRouter: router, guessTag, sbTagCounts };
