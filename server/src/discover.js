// Discover: this season's anime, upcoming releases, and recommendations.
//
// Recommendations use AniList's community recommendations ("fans of X also
// liked Y", with a vote count). For "For you", each anime in your catalogue is
// a seed weighted by your rating (5★ = 1, 2.5★ = 0, lower = negative), and a
// candidate's score is the sum of seed weight × log2(1 + votes).
// Anything already in your catalogue is excluded.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { gql, titleOf } = require('./anilist');
const { ensureAnime, toAnimeSummary } = require('./anime');

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const LIST_TTL_MS = 3 * 60 * 60 * 1000;
const RECS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CARD_FIELDS = `
  id title { romaji english } coverImage { large color } format episodes genres averageScore popularity
  isAdult status season seasonYear startDate { year month day } studios(isMain: true) { nodes { name } }
  trailer { id site } nextAiringEpisode { episode airingAt } relations { edges { relationType node { id type } } }
`;

const SEASON_QUERY = `
  query ($season: MediaSeason, $year: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      media(season: $season, seasonYear: $year, type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) { ${CARD_FIELDS} }
    }
  }
`;

const UPCOMING_QUERY = `
  query ($from: FuzzyDateInt, $to: FuzzyDateInt, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      media(type: ANIME, isAdult: false, status: NOT_YET_RELEASED, startDate_greater: $from, startDate_lesser: $to,
            sort: [POPULARITY_DESC]) { ${CARD_FIELDS} }
    }
  }
`;

const REC_FIELDS = `
  id
  recommendations(sort: [RATING_DESC], perPage: 25) {
    nodes {
      rating
      mediaRecommendation {
        id title { romaji english } coverImage { large color } format episodes seasonYear genres
        averageScore popularity isAdult trailer { id site }
      }
    }
  }
`;

const q = {
  catalogue: db.prepare('SELECT anime_id, status, rating FROM user_anime WHERE user_id = ?'),
  animeTitle: db.prepare('SELECT id, title FROM anime WHERE id = ?'),
  watchlistIds: db.prepare(`
    SELECT DISTINCT e.anilist_id AS id FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'watchlist' AND (l.owner_id = @me
      OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))`),
  getRecs: db.prepare('SELECT data, fetched_at FROM anime_recs WHERE anime_id = ?'),
  saveRecs: db.prepare('INSERT OR REPLACE INTO anime_recs (anime_id, data, fetched_at) VALUES (?, ?, ?)'),
};

function trailerOf(t) {
  const id = t?.id ? String(t.id).trim() : null;
  return id && ['youtube', 'dailymotion'].includes(t.site) ? { site: t.site, id } : null;
}

function toCard(m) {
  return {
    id: m.id,
    title: titleOf(m.title) || 'Unknown',
    cover: m.coverImage?.large ?? null,
    color: m.coverImage?.color ?? null,
    format: m.format ?? null,
    episodes: m.episodes ?? null,
    genres: m.genres ?? [],
    averageScore: m.averageScore ?? null,
    popularity: m.popularity ?? 0,
    status: m.status ?? null,
    season: m.season ?? null,
    seasonYear: m.seasonYear ?? null,
    startDate: m.startDate?.year ? m.startDate : null,
    studio: m.studios?.nodes?.[0]?.name ?? null,
    trailer: trailerOf(m.trailer),
    nextAiring: m.nextAiringEpisode ?? null,
    relations: (m.relations?.edges ?? [])
      .filter((e) => e?.node?.type === 'ANIME')
      .map((e) => ({ id: e.node.id, type: e.relationType })),
  };
}

// ---- Cached list fetching -----------------------------------------------------------

const listCache = new Map();

function cached(key, fn) {
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.promise;
  const promise = fn().catch((err) => {
    listCache.delete(key);
    throw err;
  });
  listCache.set(key, { at: Date.now(), promise });
  return promise;
}

async function fetchPages(query, variables, maxPages) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await gql(query, { ...variables, page });
    out.push(...(data?.Page?.media ?? []).filter((m) => m && !m.isAdult));
    if (!data?.Page?.pageInfo?.hasNextPage) break;
    await sleep(700);
  }
  return out.map(toCard);
}

const seasonList = (season, year) =>
  cached(`season:${season}:${year}`, () => fetchPages(SEASON_QUERY, { season, year }, 4));

function upcomingList() {
  const year = new Date().getUTCFullYear();
  // Fuzzy dates are YYYYMMDD; year-only dates are YYYY0000.
  return cached(`upcoming:${year}`, () => fetchPages(UPCOMING_QUERY, { from: year * 10000 - 1, to: (year + 3) * 10000 }, 6));
}

// ---- Personal decoration ---------------------------------------------------------------

function personal(me) {
  const catalogue = new Map(q.catalogue.all(me).map((r) => [r.anime_id, r]));
  const watchlist = new Set(q.watchlistIds.all({ me }).map((r) => r.id));
  const titles = new Map();
  const titleOfId = (id) => {
    if (!titles.has(id)) titles.set(id, q.animeTitle.get(id)?.title ?? null);
    return titles.get(id);
  };
  return { catalogue, watchlist, titleOfId };
}

// Adds your status, watchlist membership and "related to anime you've seen".
function decorate(card, p) {
  const { relations, ...rest } = card;
  const related = (relations ?? [])
    .filter((r) => p.catalogue.has(r.id))
    .map((r) => ({ id: r.id, type: r.type, title: p.titleOfId(r.id) }));
  return {
    ...rest,
    myStatus: p.catalogue.get(card.id)?.status ?? null,
    onWatchlist: p.watchlist.has(card.id),
    related,
  };
}

// ---- Recommendations ---------------------------------------------------------------------

function recCard(m) {
  return {
    id: m.id,
    title: titleOf(m.title) || 'Unknown',
    cover: m.coverImage?.large ?? null,
    color: m.coverImage?.color ?? null,
    format: m.format ?? null,
    episodes: m.episodes ?? null,
    seasonYear: m.seasonYear ?? null,
    genres: m.genres ?? [],
    averageScore: m.averageScore ?? null,
    popularity: m.popularity ?? 0,
    trailer: trailerOf(m.trailer),
    isAdult: !!m.isAdult,
  };
}

// Returns Map(animeId -> [{ votes, card }]). Missing or stale entries are
// fetched from AniList, 5 per request. If AniList refuses (rate limit), what
// is available is returned and `incomplete` is set.
async function getRecs(ids) {
  const result = new Map();
  const missing = [];
  for (const id of ids) {
    const row = q.getRecs.get(id);
    if (row && Date.now() - row.fetched_at < RECS_TTL_MS) result.set(id, JSON.parse(row.data));
    else missing.push({ id, stale: row ? JSON.parse(row.data) : null });
  }

  let incomplete = false;
  for (let i = 0; i < missing.length; i += 5) {
    const batch = missing.slice(i, i + 5);
    const query = `query { ${batch.map((b) => `a${b.id}: Media(id: ${b.id}, type: ANIME) { ${REC_FIELDS} }`).join('\n')} }`;
    try {
      const data = await gql(query, {});
      for (const b of batch) {
        const recs = (data?.[`a${b.id}`]?.recommendations?.nodes ?? [])
          .filter((n) => n?.mediaRecommendation && n.rating > 0)
          .map((n) => ({ votes: n.rating, card: recCard(n.mediaRecommendation) }));
        q.saveRecs.run(b.id, JSON.stringify(recs), Date.now());
        result.set(b.id, recs);
      }
    } catch (err) {
      incomplete = true;
      for (const b of batch) if (b.stale) result.set(b.id, b.stale);
      if (err.status === 503) break; // rate limited: stop for now
    }
    if (i + 5 < missing.length) await sleep(800);
  }
  return { recs: result, incomplete };
}

function seedWeight(r) {
  if (r.status === 'dropped') return r.rating != null ? Math.min(-0.2, (r.rating - 2.5) / 2.5) : -0.4;
  if (r.rating != null) return (r.rating - 2.5) / 2.5;
  return r.status === 'watched' ? 0.4 : 0.3;
}

async function forYou(me) {
  const p = personal(me);
  const seeds = [...p.catalogue.values()].map((r) => ({ id: r.anime_id, weight: seedWeight(r), rating: r.rating }));
  const positive = seeds.filter((s) => s.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 40);
  const negative = seeds.filter((s) => s.weight < 0).sort((a, b) => a.weight - b.weight).slice(0, 15);
  const used = [...positive, ...negative];
  if (!positive.length) return { seedCount: 0, incomplete: false, results: [] };

  const { recs, incomplete } = await getRecs(used.map((s) => s.id));
  const candidates = new Map();
  for (const seed of used) {
    for (const { votes, card } of recs.get(seed.id) ?? []) {
      if (card.isAdult || p.catalogue.has(card.id)) continue;
      const c = candidates.get(card.id) ?? { card, score: 0, reasons: [] };
      const contribution = seed.weight * Math.log2(1 + votes);
      c.score += contribution;
      if (contribution > 0) c.reasons.push({ id: seed.id, title: p.titleOfId(seed.id), rating: seed.rating, contribution });
      candidates.set(card.id, c);
    }
  }

  const ranked = [...candidates.values()].filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 200);
  const max = ranked[0]?.score || 1;
  return {
    seedCount: positive.length,
    incomplete,
    results: ranked.map((c) => ({
      ...c.card,
      score: Math.round((c.score / max) * 1000) / 1000,
      reasons: c.reasons
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 3)
        .map(({ id, title, rating }) => ({ id, title, rating })),
      onWatchlist: p.watchlist.has(c.card.id),
    })),
  };
}

async function similar(me, animeId) {
  const p = personal(me);
  const base = await ensureAnime(animeId);
  const { recs } = await getRecs([animeId]);
  const list = (recs.get(animeId) ?? []).filter(({ card }) => !card.isAdult && !p.catalogue.has(card.id) && card.id !== animeId);
  const max = Math.max(1, ...list.map((r) => Math.log2(1 + r.votes)));
  return {
    base: toAnimeSummary(base),
    results: list.map(({ votes, card }) => ({
      ...card,
      votes,
      score: Math.round((Math.log2(1 + votes) / max) * 1000) / 1000,
      onWatchlist: p.watchlist.has(card.id),
    })),
  };
}

// ---- Routes ------------------------------------------------------------------------------

function currentSeason(date = new Date()) {
  return { season: SEASONS[Math.floor(date.getUTCMonth() / 3)], year: date.getUTCFullYear() };
}

const router = express.Router();

router.get('/discover/season', wrap(async (req, res) => {
  const current = currentSeason();
  const season = SEASONS.includes(req.query.season) ? req.query.season : current.season;
  const year = req.query.year ? Number(req.query.year) : current.year;
  if (!Number.isInteger(year) || year < 1960 || year > current.year + 3) throw new HttpError(400, 'Invalid year');
  const p = personal(req.user.id);
  const items = (await seasonList(season, year)).map((c) => decorate(c, p));
  res.json({ season, year, current, items });
}));

router.get('/discover/upcoming', wrap(async (req, res) => {
  const p = personal(req.user.id);
  const items = (await upcomingList()).map((c) => decorate(c, p));
  res.json({ items });
}));

router.get('/discover/foryou', wrap(async (req, res) => {
  res.json(await forYou(req.user.id));
}));

router.get('/discover/similar/:id', wrap(async (req, res) => {
  res.json(await similar(req.user.id, parseId(req.params.id)));
}));

module.exports = { discoverRouter: router };
