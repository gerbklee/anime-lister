// Accounts and login sessions.
// Passwords are hashed with scrypt; sessions are random tokens stored (hashed)
// in the database and sent to the browser as an HttpOnly cookie.
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap } = require('./http');
const { publicUser } = require('./users');

const scrypt = promisify(crypto.scrypt);

const COOKIE = 'al_session';
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser: db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)'),
  userHash: db.prepare('SELECT password_hash FROM users WHERE id = ?'),
  setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
  claimLists: db.prepare('UPDATE lists SET owner_id = ? WHERE owner_id IS NULL'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  sessionUser: db.prepare(`
    SELECT u.id, u.username, u.avatar_file, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`),
  extendSession: db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
  purgeExpired: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
};

// ---- Passwords ----------------------------------------------------------------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Used when the username doesn't exist, so failed logins take the same time.
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

function validateCredentials(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.');
  }
  if (password.length < 6 || password.length > 200) {
    throw new HttpError(400, 'Password must be at least 6 characters.');
  }
  return { username, password };
}

// ---- Sessions -----------------------------------------------------------------

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function setSessionCookie(res, token, maxAgeMs) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  );
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  q.insertSession.run(sha256(token), userId, Date.now() + SESSION_MS);
  setSessionCookie(res, token, SESSION_MS);
}

// Attaches req.user if the request carries a valid session cookie.
// Sessions slide: each day of use pushes the expiry a year into the future.
function loadUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const tokenHash = sha256(token);
    const row = q.sessionUser.get(tokenHash);
    const now = Date.now();
    if (row && row.expires_at > now) {
      req.user = publicUser(row);
      req.sessionHash = tokenHash;
      if (row.expires_at - now < SESSION_MS - SESSION_REFRESH_MS) {
        q.extendSession.run(now + SESSION_MS, tokenHash);
        setSessionCookie(res, token, SESSION_MS);
      }
    }
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in.'));
  next();
}

// ---- Login throttling -----------------------------------------------------------

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const failures = new Map();

function checkThrottle(ip) {
  const f = failures.get(ip);
  if (f && Date.now() - f.first < FAIL_WINDOW_MS && f.count >= MAX_FAILS) {
    throw new HttpError(429, 'Too many failed logins. Please wait 15 minutes.');
  }
}

function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first >= FAIL_WINDOW_MS) failures.set(ip, { first: Date.now(), count: 1 });
  else f.count += 1;
}

// ---- Routes -----------------------------------------------------------------

const router = express.Router();

const register = db.transaction((username, passwordHash) => {
  const isFirst = q.countUsers.get().n === 0;
  const id = Number(q.insertUser.run(username, passwordHash).lastInsertRowid);
  // The very first account takes ownership of the lists from before accounts existed.
  if (isFirst) q.claimLists.run(id);
  return id;
});

router.post('/register', wrap(async (req, res) => {
  const { username, password } = validateCredentials(req.body);
  if (q.userByName.get(username)) throw new HttpError(409, 'That username is taken.');
  const passwordHash = await hashPassword(password);
  let id;
  try {
    id = register(username, passwordHash);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'That username is taken.');
    throw err;
  }
  startSession(res, id);
  res.status(201).json({ id, username, avatar: null });
}));

router.post('/login', wrap(async (req, res) => {
  checkThrottle(req.ip);
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = username ? q.userByName.get(username) : undefined;
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    recordFailure(req.ip);
    throw new HttpError(401, 'Wrong username or password.');
  }
  failures.delete(req.ip);
  q.purgeExpired.run(Date.now());
  startSession(res, user.id);
  res.json(publicUser(user));
}));

router.post('/logout', (req, res) => {
  if (req.sessionHash) q.deleteSession.run(req.sessionHash);
  setSessionCookie(res, '', 0);
  res.status(204).end();
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  const { isSpicy } = require('./adult');
  res.json({ ...req.user, spicyArt: isSpicy(req.user.id) });
});

// Changing the password logs out all other devices.
router.post('/password', requireUser, wrap(async (req, res) => {
  const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const row = q.userHash.get(req.user.id);
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw new HttpError(400, 'Current password is wrong.');
  }
  if (next.length < 6 || next.length > 200) throw new HttpError(400, 'New password must be at least 6 characters.');
  q.setPassword.run(await hashPassword(next), req.user.id);
  q.deleteOtherSessions.run(req.user.id, req.sessionHash);
  res.json({ ok: true });
}));

module.exports = { authRouter: router, loadUser, requireUser };
