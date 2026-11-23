// Caches on the NAS's disk that survive restarts:
//  - pictures fetched through the NAS (Danbooru and Pixiv thumbnails, previews
//    and originals): files in <data>/cache/img, at most STUDIO_CACHE_MB
//    (default 3000 MB), least recently used removed first;
//  - search results, artist pages and similar small JSON: the kv_cache table,
//    each with its own expiry.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

const IMG_DIR = path.join(DATA_DIR, 'cache', 'img');
fs.mkdirSync(IMG_DIR, { recursive: true });
const MAX_BYTES = (Number(process.env.STUDIO_CACHE_MB) || 3000) * 1024 * 1024;
const MAX_FILE = 30 * 1024 * 1024;

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const EXT = Object.fromEntries(Object.entries(TYPES).map(([e, t]) => [t, e]));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');

// { file, type } of a cached picture, or null. Touches it (for LRU).
function imageHit(url) {
  const base = path.join(IMG_DIR, hash(url));
  for (const [ext, type] of Object.entries(TYPES)) {
    const file = `${base}.${ext}`;
    if (fs.existsSync(file)) {
      const now = new Date();
      fs.utimes(file, now, now, () => {});
      return { file, type };
    }
  }
  return null;
}

// Saves a fetched picture (buffer) unless it's too big.
async function imageStore(url, type, buf) {
  const ext = EXT[type.split(';')[0].trim()];
  if (!ext || buf.length > MAX_FILE) return;
  const file = path.join(IMG_DIR, `${hash(url)}.${ext}`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, file);
  } catch {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

// Keeps the picture cache under its limit (oldest-used files go first).
async function pruneImages() {
  const names = await fs.promises.readdir(IMG_DIR).catch(() => []);
  const files = [];
  let total = 0;
  for (const name of names) {
    const st = await fs.promises.stat(path.join(IMG_DIR, name)).catch(() => null);
    if (!st) continue;
    if (name.endsWith('.tmp')) {
      if (Date.now() - st.mtimeMs > 3600_000) fs.promises.unlink(path.join(IMG_DIR, name)).catch(() => {});
      continue;
    }
    files.push({ name, size: st.size, at: st.mtimeMs });
    total += st.size;
  }
  if (total <= MAX_BYTES) return;
  files.sort((a, b) => a.at - b.at);
  for (const f of files) {
    if (total <= MAX_BYTES * 0.9) break;
    await fs.promises.unlink(path.join(IMG_DIR, f.name)).catch(() => {});
    total -= f.size;
  }
}

// ---- Small JSON values -------------------------------------------------------------------------

const q = {
  get: db.prepare('SELECT value, expires FROM kv_cache WHERE key = ?'),
  set: db.prepare('INSERT OR REPLACE INTO kv_cache (key, value, expires) VALUES (?, ?, ?)'),
  prune: db.prepare('DELETE FROM kv_cache WHERE expires < ?'),
};

function kvGet(key) {
  const row = q.get.get(key);
  if (!row || row.expires < Date.now()) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}
function kvSet(key, value, ttlMs) {
  try {
    q.set.run(key, JSON.stringify(value), Date.now() + ttlMs);
  } catch {
    // a full disk shouldn't break searches
  }
}
// Cached on disk for ttlMs; fn() runs on a miss.
async function kv(key, ttlMs, fn) {
  const hit = kvGet(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  kvSet(key, value, ttlMs);
  return value;
}

function startPruning() {
  const run = () => {
    q.prune.run(Date.now());
    pruneImages().catch(() => {});
  };
  setTimeout(run, 60_000);
  setInterval(run, 3600_000);
}

module.exports = { imageHit, imageStore, kv, kvGet, kvSet, startPruning };
