// Compares two users' tastes across all of their personal lists.
//
// Each list position becomes a score that ignores list length:
//   score = 1 - (rank - 1) / listSize      (#1 is always 1.0, #5 of 10 = 0.6)
// A character in several lists counts with its best (highest) score.
const express = require('express');
const { db } = require('./db');
const { HttpError, parseId } = require('./http');

const q = {
  user: db.prepare('SELECT id, username FROM users WHERE id = ?'),
  personalEntries: db.prepare(`
    SELECT e.anilist_id, e.name, e.image_file, e.image_url, e.series_title, e.position,
           l.id AS list_id, l.name AS list_name,
           (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) AS list_size
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.owner_id = ? AND l.is_shared = 0`),
};

function collect(userId) {
  const best = new Map();
  const series = new Map();
  const lists = new Set();

  for (const r of q.personalEntries.all(userId)) {
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
    if (r.series_title) {
      if (!series.has(r.series_title)) series.set(r.series_title, new Set());
      series.get(r.series_title).add(r.anilist_id);
    }
  }

  return { best, series, listCount: lists.size };
}

// Score difference below which two placements count as "about the same".
// The browser uses the same value for its "≈ Same" label.
const CLOSE = 0.15;

const byScore = (a, b) => b.placement.score - a.placement.score || a.name.localeCompare(b.name);
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

function topSeries(seriesMap, limit = 5) {
  return [...seriesMap.entries()]
    .map(([title, ids]) => ({ title, count: ids.size }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function compareUsers(meId, otherId) {
  const mine = collect(meId);
  const theirs = collect(otherId);

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

  // A character counts as "agreed on" when the scores are within CLOSE of each
  // other; the two lists never contain the same character.
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
      mine: { characters: mine.best.size, lists: mine.listCount },
      theirs: { characters: theirs.best.size, lists: theirs.listCount },
    },
    both,
    agreements,
    disagreements,
    onlyMine,
    onlyTheirs,
    favouriteSeries: { mine: topSeries(mine.series), theirs: topSeries(theirs.series), shared: sharedSeries },
  };
}

const router = express.Router();

router.get('/compare', (req, res) => {
  const otherId = parseId(req.query.with);
  if (otherId === req.user.id) throw new HttpError(400, 'Pick someone else to compare with.');
  const other = q.user.get(otherId);
  if (!other) throw new HttpError(404, 'User not found');
  res.json({ me: req.user, other, ...compareUsers(req.user.id, otherId) });
});

module.exports = { compareRouter: router };
