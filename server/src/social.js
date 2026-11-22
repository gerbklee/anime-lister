// Feed, comment threads and reactions.
const express = require('express');
const { HttpError, parseId } = require('./http');
const { usersById } = require('./users');
const activity = require("./activity");
const { notify } = require("./notify");

const router = express.Router();

router.get('/feed', (req, res) => {
  const filter = ['everyone', 'others', 'me'].includes(req.query.filter) ? req.query.filter : 'everyone';
  const before = req.query.before ? parseId(req.query.before) : undefined;
  res.json(activity.feed({ me: req.user.id, filter, before }, usersById()));
});

function requireThread(req) {
  const key = String(req.params.thread);
  if (!activity.canUseThread(key, req.user.id)) throw new HttpError(404, 'Not found');
  return key;
}

router.get('/threads/:thread/comments', (req, res) => {
  const key = requireThread(req);
  res.json(activity.listComments(key, req.user.id, usersById()));
});

router.post('/threads/:thread/comments', (req, res) => {
  const key = requireThread(req);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) throw new HttpError(400, 'Comment is empty.');
  if (body.length > 2000) throw new HttpError(400, 'Comments can be at most 2000 characters.');
  activity.addComment(key, req.user.id, body);
  const audience = activity.threadAudience(key);
  notify(audience.userIds, "comments", {
    title: `💬 ${req.user.username} commented`,
    body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    url: audience.url,
    tag: `thread-${key}`,
  }, req.user.id);
  res.status(201).json(activity.listComments(key, req.user.id, usersById()));
});

router.delete('/comments/:id', (req, res) => {
  const comment = activity.getComment(parseId(req.params.id));
  if (!comment || !activity.canUseThread(comment.thread, req.user.id)) throw new HttpError(404, 'Comment not found');
  if (comment.user_id !== req.user.id) throw new HttpError(403, 'You can only delete your own comments.');
  activity.deleteComment(comment);
  res.status(204).end();
});

router.post('/reactions', (req, res) => {
  const target = String(req.body?.target ?? '');
  const emoji = req.body?.emoji;
  if (!activity.EMOJIS.includes(emoji)) throw new HttpError(400, 'Unknown reaction');
  if (!activity.canReact(target, req.user.id)) throw new HttpError(404, 'Not found');
  res.json(activity.toggleReaction(target, req.user.id, emoji));
});

module.exports = { socialRouter: router };
