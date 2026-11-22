// Anime search, anime pages and each user's catalogue (status, rating, review).
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { searchAnime } = require('./anilist');
const { ensureAnime, toAnime, toAnimeSummary } = require('./anime');
const { usersById } = require('./users');
const activity = require('./activity');

const STATUSES = ['watched', 'watching', 'dropped'];

const q = {
  mine: db.prepare('SELECT * FROM user_anime WHERE user_id = ? AND anime_id = ?'),
  summary: db.prepare('SELECT anime_id, status, rating FROM user_anime WHERE user_id = ?'),
  forAnime: db.prepare('SELECT * FROM user_anime WHERE anime_id = ? ORDER BY updated_at DESC'),
  catalogue: db.prepare(`
    SELECT ua.*, a.* , ua.status AS ua_status, ua.created_at AS ua_created, ua.updated_at AS ua_updated
    FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
    WHERE ua.user_id = ? ORDER BY ua.updated_at DESC`),
  upsert: db.prepare(`
    INSERT INTO user_anime (user_id, anime_id, status, progress, rating, review, review_spoiler, review_updated_at)
    VALUES (@userId, @animeId, @status, @progress, @rating, @review, @spoiler, @reviewUpdatedAt)
    ON CONFLICT (user_id, anime_id) DO UPDATE SET
      status = excluded.status, progress = excluded.progress, rating = excluded.rating,
      review = excluded.review, review_spoiler = excluded.review_spoiler,
      review_updated_at = excluded.review_updated_at, updated_at = datetime('now')`),
  remove: db.prepare('DELETE FROM user_anime WHERE user_id = ? AND anime_id = ?'),
  deleteThread: db.prepare('DELETE FROM comments WHERE thread = ?'),
  deleteReactions: db.prepare('DELETE FROM reactions WHERE target = ?'),
  listCharacters: db.prepare(`
    SELECT e.id AS entry_id, e.anilist_id, e.name, e.image_file, e.image_url, e.position,
           l.id AS list_id, l.name AS list_name, l.owner_id, l.is_shared,
           (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) AS list_size
    FROM entries e
    JOIN lists l ON l.id = e.list_id
    JOIN character_media cm ON cm.character_id = e.anilist_id AND cm.anime_id = @anime
    WHERE l.kind = 'character' AND (
      l.is_shared = 0 OR l.owner_id = @me
      OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))
    ORDER BY l.id, e.position`),
  animeRanks: db.prepare(`
    SELECT e.position, l.id AS list_id, l.name AS list_name, l.owner_id, l.is_shared,
           (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) AS list_size
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE e.anilist_id = @anime AND l.kind = 'anime' AND (
      l.is_shared = 0 OR l.owner_id = @me
      OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))
    ORDER BY l.id`),
  watchThreads: db.prepare(`
    SELECT thread, COUNT(*) AS n FROM comments WHERE thread LIKE 'watch:%:' || @anime GROUP BY thread`),
  onWatchlist: db.prepare('SELECT 1 FROM entries WHERE list_id = ? AND anilist_id = ?'),
  listName: db.prepare('SELECT id, name FROM lists WHERE id = ?'),
};

function toCatalogueEntry(row, users, me) {
  const thread = `review:${row.anime_id}:${row.user_id}`;
  return {
    user: users ? users.get(row.user_id) ?? null : undefined,
    animeId: row.anime_id,
    status: row.status,
    progress: row.progress,
    rating: row.rating,
    review: row.review,
    spoiler: !!row.review_spoiler,
    reviewUpdatedAt: row.review_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    thread,
    commentCount: row.review ? activity.commentCount(thread) : 0,
    reactions: row.review && me ? activity.reactionSummary(thread, me) : undefined,
  };
}

function parseRating(value) {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.5 || n > 5 || Math.round(n * 2) !== n * 2) {
    throw new HttpError(400, 'Rating must be between 0.5 and 5 stars, in half steps.');
  }
  return n;
}

const router = express.Router();

// ---- Search & anime pages -------------------------------------------------------

router.get('/anime/search', wrap(async (req, res) => {
  const term = String(req.query.q ?? '').trim();
  if (term.length < 2) return res.json({ results: [] });
  if (term.length > 100) throw new HttpError(400, 'Search term is too long');
  const mine = new Map(q.summary.all(req.user.id).map((r) => [r.anime_id, r]));
  const results = (await searchAnime(term)).map((r) => ({ ...r, myStatus: mine.get(r.id)?.status ?? null }));
  res.json({ results });
}));

router.get('/anime/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const me = req.user.id;
  const row = await ensureAnime(id);
  const users = usersById();

  const entries = q.forAnime.all(id).map((r) => toCatalogueEntry(r, users, me));
  const mine = entries.find((e) => e.user?.id === me) ?? null;

  const characters = q.listCharacters.all({ anime: id, me }).map((r) => ({
    entryId: r.entry_id,
    characterId: r.anilist_id,
    name: r.name,
    image: r.image_file ? `/images/${r.image_file}` : r.image_url,
    rank: r.position,
    list: { id: r.list_id, name: r.list_name, size: r.list_size, isShared: !!r.is_shared },
    owner: users.get(r.owner_id) ?? null,
  }));

  const animeLists = q.animeRanks.all({ anime: id, me }).map((r) => ({
    rank: r.position,
    list: { id: r.list_id, name: r.list_name, size: r.list_size, isShared: !!r.is_shared },
    owner: users.get(r.owner_id) ?? null,
  }));

  // Comments from watchlists you're in (kept after the anime was watched).
  const watchThreads = q.watchThreads
    .all({ anime: `${id}` })
    .filter((t) => t.thread.endsWith(`:${id}`) && activity.canUseThread(t.thread, me))
    .map((t) => {
      const listId = Number(t.thread.split(':')[1]);
      return {
        thread: t.thread,
        count: t.n,
        list: q.listName.get(listId),
        onList: !!q.onWatchlist.get(listId, id),
      };
    });

  res.json({ anime: toAnime(row), mine, others: entries.filter((e) => e !== mine), characters, animeLists, watchThreads });
}));

// ---- Catalogue --------------------------------------------------------------------

// Compact map of your own catalogue, used for badges all over the app.
router.get('/catalogue/summary', (req, res) => {
  const out = {};
  for (const r of q.summary.all(req.user.id)) out[r.anime_id] = { status: r.status, rating: r.rating };
  res.json(out);
});

router.get('/users/:id/catalogue', (req, res) => {
  const userId = parseId(req.params.id);
  const rows = q.catalogue.all(userId);
  res.json(
    rows.map((r) => ({
      anime: toAnimeSummary(r),
      status: r.ua_status,
      progress: r.progress,
      rating: r.rating,
      review: r.review,
      spoiler: !!r.review_spoiler,
      createdAt: r.ua_created,
      updatedAt: r.ua_updated,
    })),
  );
});

// Add or update an anime in your catalogue. Only the fields you send change.
router.put('/catalogue/:animeId', wrap(async (req, res) => {
  const animeId = parseId(req.params.animeId);
  const me = req.user.id;
  const body = req.body ?? {};
  const existing = q.mine.get(me, animeId);

  const status = body.status ?? existing?.status ?? 'watched';
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');

  const anime = await ensureAnime(animeId, { cover: true });

  let progress = existing?.progress ?? 0;
  if (body.progress !== undefined) {
    progress = Math.max(0, Math.floor(Number(body.progress) || 0));
    if (anime.episodes) progress = Math.min(progress, anime.episodes);
  }
  if (status === 'watched' && anime.episodes && (!existing || existing.status !== 'watched')) progress = anime.episodes;

  const rating = body.rating !== undefined ? parseRating(body.rating) : existing?.rating ?? null;

  let review = existing?.review ?? '';
  if (body.review !== undefined) {
    if (typeof body.review !== 'string') throw new HttpError(400, 'Review must be text');
    review = body.review.trim();
    if (review.length > 5000) throw new HttpError(400, 'Reviews can be at most 5000 characters.');
  }
  const spoiler = body.spoiler !== undefined ? (body.spoiler ? 1 : 0) : existing?.review_spoiler ?? 0;
  const reviewChanged = review !== (existing?.review ?? '');

  db.transaction(() => {
    q.upsert.run({
      userId: me,
      animeId,
      status,
      progress,
      rating,
      review,
      spoiler,
      reviewUpdatedAt: reviewChanged ? new Date().toISOString() : existing?.review_updated_at ?? null,
    });

    if (!existing || existing.status !== status) {
      activity.record({ userId: me, type: 'anime_status', animeId, data: { status, previous: existing?.status ?? null } });
    }
    if (rating !== null && rating !== (existing?.rating ?? null)) {
      activity.record({ userId: me, type: 'anime_rating', animeId, data: { rating } });
    } else if (rating === null && existing?.rating != null) {
      activity.removeActivityType(me, animeId, 'anime_rating');
    }
    if (reviewChanged && review) activity.record({ userId: me, type: 'anime_review', animeId, data: {} });
    if (reviewChanged && !review) activity.removeActivityType(me, animeId, 'anime_review');
  })();

  res.json(toCatalogueEntry(q.mine.get(me, animeId), null, me));
}));

router.delete('/catalogue/:animeId', (req, res) => {
  const animeId = parseId(req.params.animeId);
  const me = req.user.id;
  const thread = `review:${animeId}:${me}`;
  db.transaction(() => {
    q.remove.run(me, animeId);
    activity.removeAnimeActivities(me, animeId);
    q.deleteThread.run(thread);
    q.deleteReactions.run(thread);
  })();
  res.status(204).end();
});

module.exports = { catalogueRouter: router };
