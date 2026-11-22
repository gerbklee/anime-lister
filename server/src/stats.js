// Personal stats and the yearly "Wrapped" (personal and together).
// History comes from the catalogue and the activity log, so it only reaches
// back to when the site was first used.
const express = require('express');
const { db } = require('./db');
const { HttpError, parseId } = require('./http');
const { toAnimeSummary } = require('./anime');
const { getUser } = require('./users');
const { compareCatalogues } = require('./compare');
const { rankedByCategory } = require('./traits');
const { otpOfYear, shipFight } = require('./ships');
const { pictureOfYear } = require('./fanart');

const q = {
  catalogue: db.prepare(`
    SELECT ua.anime_id, ua.status AS ua_status, ua.progress, ua.progress_volumes, ua.rating, ua.review,
           ua.created_at AS ua_created, ua.updated_at AS ua_updated, a.*
    FROM user_anime ua JOIN anime a ON a.id = ua.anime_id WHERE ua.user_id = ?`),
  activities: db.prepare('SELECT type, anime_id, list_id, data, created_at FROM activities WHERE user_id = ? ORDER BY created_at'),
  rankedChars: db.prepare(`
    SELECT e.anilist_id AS id, e.name, e.image_file, e.image_url, l.name AS list_name, l.category,
           COALESCE(r.position, e.position) AS pos,
           CASE WHEN l.is_shared = 1
             THEN (SELECT COUNT(*) FROM rankings r2 JOIN entries e2 ON e2.id = r2.entry_id WHERE e2.list_id = l.id AND r2.user_id = @user)
             ELSE (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) END AS n
    FROM entries e JOIN lists l ON l.id = e.list_id
    LEFT JOIN rankings r ON r.entry_id = e.id AND r.user_id = @user
    WHERE l.kind = 'character' AND (
      (l.is_shared = 0 AND l.owner_id = @user) OR (l.is_shared = 1 AND r.user_id IS NOT NULL))`),
  games: db.prepare(`
    SELECT g.id, g.created_at, p.user_id, p.score FROM games g JOIN game_players p ON p.game_id = g.id
    WHERE p.finished_at IS NOT NULL AND g.id IN (SELECT game_id FROM game_players WHERE user_id = ?)`),
};

const yearOf = (v) => (typeof v === 'number' ? new Date(v) : new Date(String(v).replace(' ', 'T') + (String(v).includes('T') ? '' : 'Z'))).getUTCFullYear();
const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const epMinutes = (r) => r.duration ?? 24;

function topCounts(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, count]) => ({ label, count }));
}

function add(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function overview(userId) {
  const rows = q.catalogue.all(userId);
  const anime = rows.filter((r) => r.type !== 'MANGA');
  const manga = rows.filter((r) => r.type === 'MANGA');
  const byStatus = (list) => ({
    watched: list.filter((r) => r.ua_status === 'watched').length,
    watching: list.filter((r) => r.ua_status === 'watching').length,
    dropped: list.filter((r) => r.ua_status === 'dropped').length,
  });

  const ratingDist = Object.fromEntries([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => [v, 0]));
  const genres = new Map();
  const studios = new Map();
  for (const r of rows) {
    if (r.rating != null) ratingDist[r.rating] += 1;
    if (r.ua_status === 'dropped') continue;
    for (const g of JSON.parse(r.genres)) add(genres, g);
    if (r.type !== 'MANGA' && r.studios) for (const s of r.studios.split(', ')) add(studios, s);
  }
  const rated = rows.filter((r) => r.rating != null);

  // Activity per month for the last 12 months.
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  const perMonth = new Map(months.map((m) => [m, 0]));
  for (const a of q.activities.all(userId)) {
    const m = monthOf(a.created_at);
    if (perMonth.has(m)) add(perMonth, m);
  }

  // Favourite characters across all ranked character lists (best placement).
  const best = new Map();
  for (const c of q.rankedChars.all({ user: userId })) {
    const score = 1 - (c.pos - 1) / Math.max(c.n, 1);
    const cur = best.get(c.id);
    if (!cur || score > cur.score) best.set(c.id, { id: c.id, name: c.name, image: c.image_file ? `/images/${c.image_file}` : c.image_url, list: c.list_name, rank: c.pos, score });
  }

  return {
    anime: {
      ...byStatus(anime),
      episodes: anime.reduce((s, r) => s + (r.progress ?? 0), 0),
      minutes: anime.reduce((s, r) => s + (r.progress ?? 0) * epMinutes(r), 0),
    },
    manga: {
      ...byStatus(manga),
      chapters: manga.reduce((s, r) => s + (r.progress ?? 0), 0),
      volumes: manga.reduce((s, r) => s + (r.progress_volumes ?? 0), 0),
    },
    ratings: {
      count: rated.length,
      average: rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 100) / 100 : null,
      distribution: ratingDist,
    },
    reviews: rows.filter((r) => r.review).length,
    genres: topCounts(genres, 8),
    studios: topCounts(studios, 5),
    months: [...perMonth.entries()].map(([month, count]) => ({ month, count })),
    favouriteCharacters: [...best.values()].sort((a, b) => b.score - a.score).slice(0, 6),
    topRated: rated
      .sort((a, b) => b.rating - a.rating || String(b.ua_updated).localeCompare(String(a.ua_updated)))
      .slice(0, 6)
      .map((r) => ({ anime: toAnimeSummary(r), rating: r.rating })),
  };
}

function availableYears(userId) {
  const years = new Set([new Date().getUTCFullYear()]);
  for (const a of q.activities.all(userId)) years.add(yearOf(a.created_at));
  for (const r of q.catalogue.all(userId)) years.add(yearOf(r.ua_created));
  return [...years].sort((a, b) => b - a);
}

// What happened in one year.
function wrapped(userId, year) {
  const rows = q.catalogue.all(userId);
  const byId = new Map(rows.map((r) => [r.anime_id, r]));
  const acts = q.activities.all(userId).filter((a) => yearOf(a.created_at) === year);

  const finished = new Set();
  const started = new Set();
  for (const a of acts) {
    if (a.type !== 'anime_status') continue;
    const d = JSON.parse(a.data);
    if (d.status === 'watched') finished.add(a.anime_id);
    if (d.status === 'watching') started.add(a.anime_id);
  }
  // Older entries without activity history: use when they were last updated.
  for (const r of rows) {
    if (r.ua_status === 'watched' && yearOf(r.ua_updated) === year) finished.add(r.anime_id);
    if (r.ua_status === 'watching' && yearOf(r.ua_created) === year) started.add(r.anime_id);
  }

  const items = [...finished].map((id) => byId.get(id)).filter(Boolean);
  const anime = items.filter((r) => r.type !== 'MANGA');
  const manga = items.filter((r) => r.type === 'MANGA');
  const inProgress = rows.filter((r) => r.ua_status === 'watching' && yearOf(r.ua_updated) === year);

  const minutes =
    anime.reduce((s, r) => s + (r.episodes ?? r.progress ?? 0) * epMinutes(r), 0) +
    inProgress.filter((r) => r.type !== 'MANGA').reduce((s, r) => s + (r.progress ?? 0) * epMinutes(r), 0);
  const chapters =
    manga.reduce((s, r) => s + (r.chapters ?? r.progress ?? 0), 0) +
    inProgress.filter((r) => r.type === 'MANGA').reduce((s, r) => s + (r.progress ?? 0), 0);

  const genres = new Map();
  const studios = new Map();
  for (const r of items) {
    const w = r.rating ?? 3;
    for (const g of JSON.parse(r.genres)) add(genres, g, w);
    if (r.type !== 'MANGA' && r.studios) for (const s of r.studios.split(', ')) add(studios, s, w);
  }
  const months = new Map();
  for (const a of acts) add(months, monthOf(a.created_at));
  const busiest = topCounts(months, 1)[0] ?? null;

  const rated = items.filter((r) => r.rating != null).sort((a, b) => b.rating - a.rating);
  const firstAct = acts.find((a) => a.type === 'anime_status' && byId.has(a.anime_id));

  const categories = {};
  for (const [cat, data] of rankedByCategory(userId, userId)) {
    const top = [...data.chars.values()].sort((a, b) => b.weight - a.weight)[0];
    if (top && cat !== 'other') categories[cat] = { id: top.cid, name: top.name, image: top.image };
  }

  return {
    year,
    anime: { finished: anime.length, started: [...started].filter((id) => byId.get(id)?.type !== 'MANGA').length, minutes },
    manga: { finished: manga.length, chapters },
    topRated: rated.slice(0, 5).map((r) => ({ anime: toAnimeSummary(r), rating: r.rating })),
    topGenre: topCounts(genres, 3).map((g) => g.label),
    topStudio: topCounts(studios, 1)[0]?.label ?? null,
    busiestMonth: busiest ? { month: busiest.label, count: busiest.count } : null,
    firstOfYear: firstAct ? toAnimeSummary(byId.get(firstAct.anime_id)) : null,
    reviews: acts.filter((a) => a.type === 'anime_review').length,
    charactersAdded: acts.filter((a) => a.type === 'list_add' && JSON.parse(a.data).kind === 'character').length,
    listsCreated: acts.filter((a) => a.type === 'list_create').length,
    shipsCreated: acts.filter((a) => a.type === 'ship_create').length,
    otp: otpOfYear(userId, year),
    wonOver: require('./ships-extra').wonOver(userId, year),
    favourites: categories,
  };
}

function wrappedTogether(meId, otherId, year) {
  const mine = wrapped(meId, year);
  const theirs = wrapped(otherId, year);
  const myRows = new Map(q.catalogue.all(meId).map((r) => [r.anime_id, r]));
  const theirRows = new Map(q.catalogue.all(otherId).map((r) => [r.anime_id, r]));

  const both = [...myRows.values()]
    .filter((r) => r.ua_status === 'watched' && theirRows.get(r.anime_id)?.ua_status === 'watched')
    .filter((r) => yearOf(r.ua_updated) === year || yearOf(theirRows.get(r.anime_id).ua_updated) === year);
  const rated = both
    .filter((r) => r.rating != null && theirRows.get(r.anime_id).rating != null)
    .map((r) => ({ anime: toAnimeSummary(r), me: r.rating, them: theirRows.get(r.anime_id).rating }));
  const disagreement = [...rated].sort((a, b) => Math.abs(b.me - b.them) - Math.abs(a.me - a.them))[0] ?? null;
  const favouriteTogether = [...rated].sort((a, b) => b.me + b.them - (a.me + a.them))[0] ?? null;

  // Head-to-head in games this year.
  const games = new Map();
  for (const g of q.games.all(meId)) {
    if (yearOf(g.created_at) !== year) continue;
    if (!games.has(g.id)) games.set(g.id, {});
    games.get(g.id)[g.user_id] = g.score;
  }
  let myWins = 0;
  let theirWins = 0;
  for (const scores of games.values()) {
    if (scores[meId] == null || scores[otherId] == null) continue;
    if (scores[meId] > scores[otherId]) myWins += 1;
    else if (scores[otherId] > scores[meId]) theirWins += 1;
  }

  return {
    year,
    me: { user: getUser(meId), minutes: mine.anime.minutes, finished: mine.anime.finished + mine.manga.finished },
    other: { user: getUser(otherId), minutes: theirs.anime.minutes, finished: theirs.anime.finished + theirs.manga.finished },
    watchedBoth: both.length,
    bothList: both.slice(0, 12).map((r) => toAnimeSummary(r)),
    tasteMatch: compareCatalogues(meId, otherId).stats.score,
    disagreement,
    favouriteTogether,
    games: { myWins, theirWins, played: games.size },
    shipFight: shipFight(meId, otherId, year),
    pictureOfYear: pictureOfYear(year, meId),
  };
}

const router = express.Router();

router.get('/stats/:userId', (req, res) => {
  const userId = parseId(req.params.userId);
  const user = getUser(userId);
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user, years: availableYears(userId), overview: overview(userId) });
});

router.get('/wrapped/:userId', (req, res) => {
  const userId = parseId(req.params.userId);
  if (!getUser(userId)) throw new HttpError(404, 'User not found');
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  res.json({ user: getUser(userId), ...wrapped(userId, year) });
});

router.get('/wrapped-together', (req, res) => {
  const otherId = parseId(req.query.with);
  if (otherId === req.user.id || !getUser(otherId)) throw new HttpError(400, 'Pick someone else.');
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  res.json(wrappedTogether(req.user.id, otherId, year));
});

module.exports = { statsRouter: router };
