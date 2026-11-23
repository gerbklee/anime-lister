// Pixiv (for the Studio): searches with the owner's own Pixiv account, through
// the same API the official mobile app uses.
//
// Connecting: Settings -> Studio -> Connect Pixiv opens Pixiv's login page; after
// logging in, the person pastes the code from the address it ends on, and it is
// exchanged for a refresh token kept in app_settings (or set PIXIV_REFRESH_TOKEN).
// The token never goes to the browser.
const crypto = require('crypto');
const { db } = require('./db');

const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';
const HASH_SECRET = '28c1fdd170a5204386cb1313c7077b34f83e4aaf4aa829ce78c231e05b0bae2c';
const LOGIN_URL = 'https://app-api.pixiv.net/web/v1/login';
const TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token';
const REDIRECT_URI = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback';
const API = 'https://app-api.pixiv.net';
const APP_UA = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)';
const REFERER = 'https://app-api.pixiv.net/';

const q = {
  get: db.prepare('SELECT value FROM app_settings WHERE key = ?'),
  set: db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)'),
  del: db.prepare('DELETE FROM app_settings WHERE key = ?'),
};

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function refreshToken() {
  return q.get.get('pixiv_refresh_token')?.value || process.env.PIXIV_REFRESH_TOKEN || null;
}
const isConnected = () => !!refreshToken();
const connectedAs = () => q.get.get('pixiv_user')?.value ?? (process.env.PIXIV_REFRESH_TOKEN ? '(from server config)' : null);

// Login flow: one pending verifier at a time is enough for a home server.
let pending = null;
function loginUrl() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  pending = { verifier, at: Date.now() };
  return `${LOGIN_URL}?code_challenge=${challenge}&code_challenge_method=S256&client=pixiv-android`;
}

let access = null; // { token, until }

async function tokenRequest(params) {
  const time = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PixivAndroidApp/5.0.234 (Android 11; Pixel 5)',
      'X-Client-Time': time,
      'X-Client-Hash': crypto.createHash('md5').update(time + HASH_SECRET).digest('hex'),
    },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, include_policy: 'true', ...params }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) throw new Error(data?.errors?.system?.message ?? data?.error ?? `Pixiv login failed (${res.status})`);
  access = { token: data.access_token, until: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60_000 };
  if (data.refresh_token) q.set.run('pixiv_refresh_token', data.refresh_token);
  if (data.user?.name) q.set.run('pixiv_user', data.user.name);
  return data;
}

// Accepts the code itself or the whole pixiv://... address it came in.
async function connect(codeOrUrl) {
  if (!pending || Date.now() - pending.at > 10 * 60 * 1000) throw new Error('Start the Pixiv login again (it expired).');
  const raw = String(codeOrUrl ?? '').trim();
  const code = raw.match(/[?&]code=([^&\s]+)/)?.[1] ?? raw;
  if (!/^[\w-]{10,}$/.test(code)) throw new Error("That doesn't look like a Pixiv code.");
  const data = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: REDIRECT_URI });
  pending = null;
  return data.user?.name ?? 'connected';
}

function disconnect() {
  q.del.run('pixiv_refresh_token');
  q.del.run('pixiv_user');
  access = null;
}

async function accessToken() {
  if (access && Date.now() < access.until) return access.token;
  const rt = refreshToken();
  if (!rt) throw new Error('Pixiv is not connected');
  await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt });
  return access.token;
}

// Pixiv allows a few requests per second; keep it gentle.
let tail = Promise.resolve();
function api(path) {
  const run = tail.then(async () => {
    try {
      const token = await accessToken();
      const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': APP_UA, 'App-OS': 'ios', 'App-OS-Version': '14.6', 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 400 && /invalid_grant|OAuth/i.test(JSON.stringify(data ?? ''))) access = null;
      if (!res.ok) throw new Error(data?.error?.message || data?.error?.user_message || `Pixiv: status ${res.status}`);
      return data;
    } finally {
      await new Promise((r) => setTimeout(r, 400));
    }
  });
  tail = run.catch(() => {});
  return run;
}

// One page (30 works) of a tag search. `sort`: 'best' tries Pixiv's popular
// order (Premium accounts) and falls back to newest.
async function searchIllusts(word, { sort = 'best', page = 1 } = {}) {
  const offset = (page - 1) * 30;
  const path = (s) => `/v1/search/illust?word=${encodeURIComponent(word)}&search_target=partial_match_for_tags&sort=${s}&filter=for_ios&offset=${offset}`;
  if (sort === 'best') {
    const r = await api(path('popular_desc')).catch(() => null);
    if (r?.illusts?.length) return { illusts: r.illusts, more: !!r.next_url, sortedBy: 'popular' };
  }
  const r = await api(path('date_desc'));
  return { illusts: r.illusts ?? [], more: !!r.next_url, sortedBy: 'newest' };
}

// One page (30) of an artist's own works, newest first.
async function userIllusts(userId, { page = 1 } = {}) {
  const r = await api(`/v1/user/illusts?user_id=${encodeURIComponent(userId)}&type=illust&filter=for_ios&offset=${(page - 1) * 30}`);
  return { illusts: r.illusts ?? [], more: !!r.next_url, user: r.user ?? null };
}

// One work, for saving it to a board.
async function illustDetail(id) {
  const r = await api(`/v1/illust/detail?illust_id=${encodeURIComponent(id)}`);
  return r.illust ?? null;
}

module.exports = { isConnected, connectedAs, loginUrl, connect, disconnect, searchIllusts, userIllusts, illustDetail, REFERER };
