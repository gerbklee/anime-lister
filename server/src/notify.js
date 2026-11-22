// Web push notifications (work once the site is installed as an app over HTTPS).
// VAPID keys are generated on first start and kept in the data folder.
const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');
const { db, DATA_DIR } = require('./db');
const { HttpError, wrap } = require('./http');

const KEY_FILE = path.join(DATA_DIR, 'vapid.json');

function loadKeys() {
  try {
    return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  } catch {
    const keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(KEY_FILE, JSON.stringify(keys));
    return keys;
  }
}

const keys = loadKeys();
webpush.setVapidDetails('mailto:anime-lister@localhost', keys.publicKey, keys.privateKey);

// Notification types users can switch off in Settings.
const TYPES = {
  episodes: 'New episodes of anime you watch',
  comments: 'Comments and replies',
  lists: 'Additions to shared lists and watchlists',
  games: 'Game challenges and results',
  ships: 'New ships, votes and headcanons',
};

const q = {
  subs: db.prepare('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = ?'),
  save: db.prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, user_id, keys, created_at) VALUES (?, ?, ?, ?)'),
  remove: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?'),
  removeMine: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'),
  prefs: db.prepare('SELECT notify_prefs FROM users WHERE id = ?'),
  setPrefs: db.prepare('UPDATE users SET notify_prefs = ? WHERE id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?'),
};

function prefsOf(userId) {
  let stored = {};
  try {
    stored = JSON.parse(q.prefs.get(userId)?.notify_prefs ?? '{}');
  } catch {
    // keep defaults
  }
  return Object.fromEntries(Object.keys(TYPES).map((t) => [t, stored[t] !== false]));
}

async function sendTo(userId, type, payload) {
  if (!prefsOf(userId)[type]) return;
  for (const s of q.subs.all(userId)) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, JSON.stringify(payload), { TTL: 6 * 3600 });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) q.remove.run(s.endpoint); // subscription expired
      else console.warn(`Push to user ${userId} failed: ${err.statusCode ?? ''} ${err.message}`);
    }
  }
}

// Fire-and-forget: notify several users (except the one who caused it).
// payload: { title, body, url, tag }
function notify(userIds, type, payload, exceptUserId = null) {
  const targets = [...new Set(userIds)].filter((id) => id && id !== exceptUserId);
  Promise.all(targets.map((id) => sendTo(id, type, payload))).catch(() => {});
}

const router = express.Router();

router.get('/push/key', (req, res) => res.json({ publicKey: keys.publicKey }));

router.get('/push/status', (req, res) => {
  res.json({ devices: q.count.get(req.user.id).n, prefs: prefsOf(req.user.id), types: TYPES });
});

router.post('/push/subscribe', (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new HttpError(400, 'Invalid subscription');
  if (!/^https:\/\//.test(sub.endpoint)) throw new HttpError(400, 'Invalid subscription');
  q.save.run(sub.endpoint, req.user.id, JSON.stringify(sub.keys), Date.now());
  res.status(201).json({ ok: true });
});

router.post('/push/unsubscribe', (req, res) => {
  if (typeof req.body?.endpoint === 'string') q.removeMine.run(req.body.endpoint, req.user.id);
  res.json({ ok: true });
});

router.put('/push/prefs', (req, res) => {
  const current = prefsOf(req.user.id);
  for (const t of Object.keys(TYPES)) if (typeof req.body?.[t] === 'boolean') current[t] = req.body[t];
  q.setPrefs.run(JSON.stringify(current), req.user.id);
  res.json({ prefs: current });
});

router.post('/push/test', wrap(async (req, res) => {
  const subs = q.subs.all(req.user.id);
  if (!subs.length) throw new HttpError(400, 'This account has no device with notifications switched on.');
  await sendTo(req.user.id, 'comments', { title: 'Anime Hub', body: 'Notifications work! 🎉', url: '#/', tag: 'test' });
  res.json({ ok: true });
}));

module.exports = { pushRouter: router, notify };
