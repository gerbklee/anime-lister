// Feed events, comment threads and reactions: storage and access rules.
//
// Visibility:
//   - activities about a shared list or watchlist: only its owner and members
//   - everything else (catalogue, ratings, reviews, personal lists): every user
// Thread keys:
//   review:<animeId>:<userId>   comments on a review
//   watch:<listId>:<animeId>    comments on an anime in a watchlist
//   activity:<id>               comments on any other feed event
// Reaction targets are thread keys or 'comment:<id>'.
const { db } = require('./db');
const { toAnimeSummary } = require('./anime');

const MERGE_MS = 10 * 60 * 1000;
const MERGEABLE = new Set(['anime_status', 'anime_rating', 'anime_review']);
const EMOJIS = ['❤️', '😂', '😮'];

const q = {
  lastSimilar: db.prepare(`
    SELECT id, created_at FROM activities
    WHERE user_id = ? AND type = ? AND anime_id IS ? ORDER BY id DESC LIMIT 1`),
  insert: db.prepare(`
    INSERT INTO activities (user_id, type, anime_id, list_id, item_id, data, created_at, updated_at)
    VALUES (@userId, @type, @animeId, @listId, @itemId, @data, @now, @now)`),
  update: db.prepare('UPDATE activities SET data = ?, updated_at = ? WHERE id = ?'),
  get: db.prepare('SELECT * FROM activities WHERE id = ?'),
  canSeeList: db.prepare(`
    SELECT 1 FROM lists l WHERE l.id = @list AND (
      l.is_shared = 0 OR l.owner_id = @me
      OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))`),
  canEditList: db.prepare(`
    SELECT 1 FROM lists l WHERE l.id = @list AND (
      l.owner_id = @me OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))`),
  feed: db.prepare(`
    SELECT a.* FROM activities a
    WHERE a.id < @before
      AND (@user IS NULL OR a.user_id = @user)
      AND (@exclude IS NULL OR a.user_id != @exclude)
      AND (a.list_id IS NULL OR EXISTS (
        SELECT 1 FROM lists l WHERE l.id = a.list_id AND (
          l.is_shared = 0 OR l.owner_id = @me
          OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))))
    ORDER BY a.id DESC LIMIT @limit`),
  anime: db.prepare('SELECT * FROM anime WHERE id = ?'),
  list: db.prepare('SELECT id, name, kind, is_shared FROM lists WHERE id = ?'),
  userAnime: db.prepare('SELECT * FROM user_anime WHERE user_id = ? AND anime_id = ?'),
  comment: db.prepare('SELECT * FROM comments WHERE id = ?'),
  comments: db.prepare('SELECT * FROM comments WHERE thread = ? ORDER BY created_at, id'),
  commentCount: db.prepare('SELECT COUNT(*) AS n FROM comments WHERE thread = ?'),
  insertComment: db.prepare('INSERT INTO comments (thread, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
  deleteComment: db.prepare('DELETE FROM comments WHERE id = ?'),
  reactions: db.prepare('SELECT emoji, user_id FROM reactions WHERE target = ?'),
  hasReaction: db.prepare('SELECT 1 FROM reactions WHERE target = ? AND user_id = ? AND emoji = ?'),
  addReaction: db.prepare('INSERT OR IGNORE INTO reactions (target, user_id, emoji) VALUES (?, ?, ?)'),
  removeReaction: db.prepare('DELETE FROM reactions WHERE target = ? AND user_id = ? AND emoji = ?'),
  deleteReactionsFor: db.prepare('DELETE FROM reactions WHERE target = ?'),
  deleteCommentActivity: db.prepare(`DELETE FROM activities WHERE type = 'watchlist_comment' AND item_id = ?`),
  deleteAnimeActivities: db.prepare(`
    DELETE FROM activities WHERE user_id = ? AND anime_id = ? AND type IN ('anime_status', 'anime_rating', 'anime_review')`),
  deleteTypeForAnime: db.prepare('DELETE FROM activities WHERE user_id = ? AND anime_id = ? AND type = ?'),
  deleteListActivities: db.prepare('DELETE FROM activities WHERE list_id = ?'),
  deleteListAdd: db.prepare(`DELETE FROM activities WHERE list_id = ? AND item_id = ? AND type IN ('list_add', 'watchlist_add')`),
};

// ---- Recording ------------------------------------------------------------------

// Adds a feed event. Rating/status/review changes to the same anime within
// 10 minutes update the previous event instead of adding a new one.
function record({ userId, type, animeId = null, listId = null, itemId = null, data = {} }) {
  const now = Date.now();
  if (MERGEABLE.has(type)) {
    const last = q.lastSimilar.get(userId, type, animeId);
    if (last && now - last.created_at < MERGE_MS) {
      q.update.run(JSON.stringify(data), now, last.id);
      return last.id;
    }
  }
  return Number(q.insert.run({ userId, type, animeId, listId, itemId, data: JSON.stringify(data), now }).lastInsertRowid);
}

const removeAnimeActivities = (userId, animeId) => q.deleteAnimeActivities.run(userId, animeId);
const removeActivityType = (userId, animeId, type) => q.deleteTypeForAnime.run(userId, animeId, type);
const removeListActivities = (listId) => q.deleteListActivities.run(listId);
const removeListAdd = (listId, itemId) => q.deleteListAdd.run(listId, itemId);

// ---- Access ---------------------------------------------------------------------

function canSeeActivity(a, me) {
  return !!a && (a.list_id == null || !!q.canSeeList.get({ list: a.list_id, me }));
}

function parseKey(key) {
  const [kind, ...rest] = String(key).split(':');
  const nums = rest.map(Number);
  if (!kind || nums.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return { kind, nums };
}

// Can `me` read and write the comment thread with this key?
function canUseThread(key, me) {
  const k = parseKey(key);
  if (!k) return false;
  if (k.kind === 'review' && k.nums.length === 2) return !!q.userAnime.get(k.nums[1], k.nums[0]);
  if (k.kind === 'watch' && k.nums.length === 2) {
    const list = q.list.get(k.nums[0]);
    return !!list && list.kind === 'watchlist' && !!q.canEditList.get({ list: list.id, me });
  }
  if (k.kind === 'activity' && k.nums.length === 1) return canSeeActivity(q.get.get(k.nums[0]), me);
  return false;
}

function canReact(target, me) {
  const k = parseKey(target);
  if (k?.kind === 'comment' && k.nums.length === 1) {
    const c = q.comment.get(k.nums[0]);
    return !!c && canUseThread(c.thread, me);
  }
  return canUseThread(target, me);
}

// ---- Comments & reactions ---------------------------------------------------------

function reactionSummary(target, me) {
  const out = {};
  for (const e of EMOJIS) out[e] = { count: 0, mine: false };
  for (const r of q.reactions.all(target)) {
    if (!out[r.emoji]) continue;
    out[r.emoji].count += 1;
    if (r.user_id === me) out[r.emoji].mine = true;
  }
  return out;
}

function toggleReaction(target, me, emoji) {
  if (q.hasReaction.get(target, me, emoji)) q.removeReaction.run(target, me, emoji);
  else q.addReaction.run(target, me, emoji);
  return reactionSummary(target, me);
}

const commentCount = (thread) => q.commentCount.get(thread).n;

function listComments(thread, me, users) {
  return q.comments.all(thread).map((c) => ({
    id: c.id,
    user: users.get(c.user_id) ?? null,
    body: c.body,
    createdAt: c.created_at,
    reactions: reactionSummary(`comment:${c.id}`, me),
  }));
}

function addComment(thread, userId, body) {
  const id = Number(q.insertComment.run(thread, userId, body, Date.now()).lastInsertRowid);
  const k = parseKey(thread);
  if (k.kind === 'watch') {
    record({ userId, type: 'watchlist_comment', animeId: k.nums[1], listId: k.nums[0], itemId: id });
    db.prepare('UPDATE lists SET version = version + 1 WHERE id = ?').run(k.nums[0]);
  }
  return id;
}

function deleteComment(comment) {
  db.transaction(() => {
    q.deleteComment.run(comment.id);
    q.deleteReactionsFor.run(`comment:${comment.id}`);
    q.deleteCommentActivity.run(comment.id);
    const k = parseKey(comment.thread);
    if (k?.kind === 'watch') db.prepare('UPDATE lists SET version = version + 1 WHERE id = ?').run(k.nums[0]);
  })();
}

// ---- Feed -----------------------------------------------------------------------

function threadAndTarget(a) {
  if (a.type === 'anime_review') {
    const key = `review:${a.anime_id}:${a.user_id}`;
    return { thread: key, target: key };
  }
  if (a.type.startsWith('watchlist_')) {
    const thread = `watch:${a.list_id}:${a.anime_id}`;
    return { thread, target: a.type === 'watchlist_comment' ? `comment:${a.item_id}` : `activity:${a.id}` };
  }
  const key = `activity:${a.id}`;
  return { thread: key, target: key };
}

// Turns an activity row into a feed item, or null if it no longer applies
// (e.g. the review was deleted).
function feedItem(a, me, users) {
  const data = JSON.parse(a.data);
  const item = {
    id: a.id,
    type: a.type,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    user: users.get(a.user_id) ?? null,
    data,
  };
  if (a.anime_id) item.anime = toAnimeSummary(q.anime.get(a.anime_id));
  if (a.list_id) {
    const list = q.list.get(a.list_id);
    if (!list) return null;
    item.list = { id: list.id, name: list.name, kind: list.kind };
  }

  if (a.type === 'anime_review' || a.type === 'anime_rating') {
    const ua = q.userAnime.get(a.user_id, a.anime_id);
    if (!ua) return null;
    if (a.type === 'anime_review') {
      if (!ua.review) return null;
      item.review = { text: ua.review, spoiler: !!ua.review_spoiler, rating: ua.rating };
    } else {
      if (ua.rating == null) return null;
      item.rating = ua.rating;
    }
  }
  if (a.type === 'watchlist_comment') {
    const c = q.comment.get(a.item_id);
    if (!c) return null;
    item.comment = { id: c.id, body: c.body };
  }
  if (a.type === 'watchlist_watched') {
    item.watchers = (data.userIds ?? []).map((id) => users.get(id)).filter(Boolean);
  }

  const { thread, target } = threadAndTarget(a);
  item.thread = thread;
  item.target = target;
  item.commentCount = commentCount(thread);
  item.reactions = reactionSummary(target, me);
  return item;
}

function feed({ me, filter, before, limit = 25 }, users) {
  const rows = q.feed.all({
    me,
    before: before ?? Number.MAX_SAFE_INTEGER,
    user: filter === 'me' ? me : null,
    exclude: filter === 'others' ? me : null,
    limit,
  });
  const items = rows.map((a) => feedItem(a, me, users)).filter(Boolean);
  return { items, nextBefore: rows.length === limit ? rows[rows.length - 1].id : null };
}

module.exports = {
  EMOJIS,
  record,
  removeAnimeActivities,
  removeActivityType,
  removeListActivities,
  removeListAdd,
  canUseThread,
  canReact,
  reactionSummary,
  toggleReaction,
  commentCount,
  listComments,
  addComment,
  deleteComment,
  getComment: (id) => q.comment.get(id),
  feed,
};
