// Compares two users' tastes.
//
// Lists (character or anime): each position becomes a score that ignores list length:
//   score = 1 - (rank - 1) / listSize      (#1 is always 1.0, #5 of 10 = 0.6)
// A character/anime in several lists counts with its best (highest) score.
//
// Catalogue: watched overlap + how similarly both rate the anime they've seen.
const express = require('express');
const { db } = require('./db');
const { HttpError, parseId } = require('./http');
const { toAnimeSummary } = require('./anime');
const { getUser } = require('./users');

// Score difference below which two list placements count as "about the same".
// The browser uses the same value for its "≈ Same" label.
const CLOSE = 0.15;

const q = {
  personalEntries: db.prepare(`
    SELECT e.anilist_id, e.name, e.image_file, e.image_url, e.series_title, e.position,
           l.id AS list_id, l.name AS list_name,
           (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) AS list_size
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.owner_id = ? AND l.is_shared = 0 AND l.kind = ?`),
  catalogue: db.prepare(`
    SELECT ua.anime_id, ua.status AS ua_status, ua.rating, a.*
    FROM user_anime ua JOIN anime a ON a.id = ua.anime_id WHERE ua.user_id = ?`),
};

const byScore = (a, b) => b.placement.score - a.placement.score || a.name.localeCompare(b.name);
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

function collect(userId, kind) {
  const best = new Map();
  const series = new Map();
  const lists = new Set();

  for (const r of q.personalEntries.all(userId, kind)) {
    lists.add(r.list_id);
    const placement = {
      rank: r.position,
      listId: r.list_id,
      listName: r.list_name,
      listSize: r.list_size,
      score: 1 - (r.position - 1) / r.list_size,
    };
    const current = best.get(r.anilist_id);
    if (
      !current ||
      placement.score > current.placement.score ||
      (placement.score === current.placement.score && placement.listSize > current.placement.listSize)
    ) {
      best.set(r.anilist_id, {
        anilistId: r.anilist_id,
        name: r.name,
        image: r.image_file ? `/images/${r.image_file}` : r.image_url,
        seriesTitle: r.series_title,
        placement,
      });
    }
    if (kind === 'character' && r.series_title) {
      if (!series.has(r.series_title)) series.set(r.series_title, new Set());
      series.get(r.series_title).add(r.anilist_id);
    }
  }

  return { best, series, listCount: lists.size };
}

function topSeries(seriesMap, limit = 5) {
  return [...seriesMap.entries()]
    .map(([title, ids]) => ({ title, count: ids.size }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function compareLists(meId, otherId, kind) {
  const mine = collect(meId, kind);
  const theirs = collect(otherId, kind);

  const both = [];
  const onlyMine = [];
  for (const [id, m] of mine.best) {
    const t = theirs.best.get(id);
    if (!t) {
      onlyMine.push(m);
      continue;
    }
    both.push({
      anilistId: id,
      name: m.name,
      image: m.image || t.image,
      seriesTitle: m.seriesTitle || t.seriesTitle,
      me: m.placement,
      them: t.placement,
      diff: round(m.placement.score - t.placement.score, 3),
    });
  }
  const onlyTheirs = [...theirs.best.values()].filter((t) => !mine.best.has(t.anilistId));

  both.sort((a, b) => b.me.score + b.them.score - (a.me.score + a.them.score) || a.name.localeCompare(b.name));
  onlyMine.sort(byScore);
  onlyTheirs.sort(byScore);

  // Agreement: 40% how much you overlap, 60% how similarly you rank the overlap.
  const smaller = Math.min(mine.best.size, theirs.best.size);
  const overlap = smaller ? both.length / smaller : 0;
  const rankSimilarity = both.length ? 1 - both.reduce((sum, c) => sum + Math.abs(c.diff), 0) / both.length : 0;
  const score = both.length ? Math.round(100 * (0.4 * overlap + 0.6 * rankSimilarity)) : 0;

  // The two lists never contain the same entry.
  const agreements = both
    .filter((c) => Math.abs(c.diff) < CLOSE)
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || b.me.score + b.them.score - (a.me.score + a.them.score))
    .slice(0, 3);
  const disagreements = both
    .filter((c) => Math.abs(c.diff) >= CLOSE)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3);

  const sharedSeries = [...mine.series.entries()]
    .filter(([title]) => theirs.series.has(title))
    .map(([title, ids]) => ({ title, mine: ids.size, theirs: theirs.series.get(title).size }))
    .sort((a, b) => Math.min(b.mine, b.theirs) - Math.min(a.mine, a.theirs) || b.mine + b.theirs - (a.mine + a.theirs))
    .slice(0, 5);

  return {
    stats: {
      score,
      overlap: round(overlap),
      rankSimilarity: round(rankSimilarity),
      sharedCount: both.length,
      mine: { items: mine.best.size, lists: mine.listCount },
      theirs: { items: theirs.best.size, lists: theirs.listCount },
    },
    both,
    agreements,
    disagreements,
    onlyMine,
    onlyTheirs,
    favouriteSeries: { mine: topSeries(mine.series), theirs: topSeries(theirs.series), shared: sharedSeries },
  };
}

// ---- Anime catalogue -------------------------------------------------------------

function genreWeights(rows) {
  const weights = new Map();
  let total = 0;
  for (const r of rows) {
    if (r.ua_status === 'dropped') continue;
    const w = r.rating ?? 3; // unrated anime count as a neutral 3 stars
    for (const g of JSON.parse(r.genres)) {
      weights.set(g, (weights.get(g) ?? 0) + w);
      total += w;
    }
  }
  return { weights, total };
}

function topGenres({ weights, total }, limit = 6) {
  return [...weights.entries()]
    .map(([genre, w]) => ({ genre, share: total ? round(w / total, 3) : 0 }))
    .sort((a, b) => b.share - a.share || a.genre.localeCompare(b.genre))
    .slice(0, limit);
}

function compareCatalogues(meId, otherId) {
  const mineRows = q.catalogue.all(meId);
  const theirRows = q.catalogue.all(otherId);
  const mine = new Map(mineRows.map((r) => [r.anime_id, r]));
  const theirs = new Map(theirRows.map((r) => [r.anime_id, r]));
  const seen = (r) => r.ua_status !== 'dropped';

  const mineSeen = mineRows.filter(seen).length;
  const theirsSeen = theirRows.filter(seen).length;
  const bothSeen = mineRows.filter((r) => seen(r) && theirs.has(r.anime_id) && seen(theirs.get(r.anime_id)));

  const bothRated = mineRows
    .filter((r) => r.rating != null && theirs.get(r.anime_id)?.rating != null)
    .map((r) => {
      const t = theirs.get(r.anime_id);
      return { anime: toAnimeSummary(r), me: r.rating, them: t.rating, diff: r.rating - t.rating };
    })
    .sort((a, b) => b.me + b.them - (a.me + a.them) || a.anime.title.localeCompare(b.anime.title));

  const smaller = Math.min(mineSeen, theirsSeen);
  const overlap = smaller ? bothSeen.length / smaller : 0;
  const ratingSimilarity = bothRated.length
    ? 1 - bothRated.reduce((s, r) => s + Math.abs(r.diff), 0) / bothRated.length / 4.5
    : null;
  const score = bothSeen.length
    ? Math.round(100 * (ratingSimilarity == null ? overlap : 0.4 * overlap + 0.6 * ratingSimilarity))
    : 0;

  const agreements = bothRated.filter((r) => Math.abs(r.diff) <= 0.5).slice(0, 5);
  const disagreements = [...bothRated]
    .filter((r) => Math.abs(r.diff) >= 1.5)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 5);

  const myGenres = genreWeights(mineRows);
  const theirGenres = genreWeights(theirRows);
  const sharedGenres = [...myGenres.weights.keys()]
    .filter((g) => theirGenres.weights.has(g))
    .map((g) => ({
      genre: g,
      mine: round(myGenres.weights.get(g) / myGenres.total, 3),
      theirs: round(theirGenres.weights.get(g) / theirGenres.total, 3),
    }))
    .sort((a, b) => Math.min(b.mine, b.theirs) - Math.min(a.mine, a.theirs))
    .slice(0, 5);

  // Highly rated by them, not in my catalogue at all.
  const recommendations = theirRows
    .filter((r) => r.rating != null && r.rating >= 4 && !mine.has(r.anime_id))
    .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title))
    .slice(0, 12)
    .map((r) => ({ anime: toAnimeSummary(r), rating: r.rating }));

  return {
    stats: {
      score,
      overlap: round(overlap),
      ratingSimilarity: ratingSimilarity == null ? null : round(ratingSimilarity),
      bothSeen: bothSeen.length,
      bothRated: bothRated.length,
      mine: { seen: mineSeen, rated: mineRows.filter((r) => r.rating != null).length },
      theirs: { seen: theirsSeen, rated: theirRows.filter((r) => r.rating != null).length },
    },
    bothRated,
    agreements,
    disagreements,
    genres: { mine: topGenres(myGenres), theirs: topGenres(theirGenres), shared: sharedGenres },
    recommendations,
  };
}

// ---- Routes -------------------------------------------------------------------------

const router = express.Router();

function otherUser(req) {
  const otherId = parseId(req.query.with);
  if (otherId === req.user.id) throw new HttpError(400, 'Pick someone else to compare with.');
  const other = getUser(otherId);
  if (!other) throw new HttpError(404, 'User not found');
  return other;
}

// Character lists (default) or anime lists.
router.get('/compare', (req, res) => {
  const other = otherUser(req);
  const kind = req.query.kind === 'anime' ? 'anime' : 'character';
  res.json({ me: req.user, other, kind, ...compareLists(req.user.id, other.id, kind) });
});

router.get('/compare/anime', (req, res) => {
  const other = otherUser(req);
  res.json({
    me: req.user,
    other,
    catalogue: compareCatalogues(req.user.id, other.id),
    lists: compareLists(req.user.id, other.id, 'anime'),
  });
});

module.exports = { compareRouter: router };
