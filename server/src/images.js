// Downloads images into the data volume so pages work offline and don't
// depend on remote URLs staying the same.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, IMAGE_DIR } = require('./db');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_BYTES = 10 * 1024 * 1024;

// Only images from these sites are downloaded (AniList, MyAnimeList, Safebooru).
const ALLOWED_HOSTS = ['anilist.co', 'myanimelist.net', 'safebooru.org'];

function isAllowedImageUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      ALLOWED_HOSTS.some((host) => u.hostname === host || u.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

// Downloads `url` as "<baseName>.<ext>" (or a hash-based name if baseName is
// omitted) and returns the file name, or null if there is no URL.
async function cacheImage(url, baseName) {
  if (!url) return null;
  if (!isAllowedImageUrl(url)) throw new Error('Images can only come from AniList, MyAnimeList or Safebooru.');

  let ext = path.extname(new URL(url).pathname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) ext = '.jpg';
  const base = baseName ?? `alt-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)}`;
  const file = `${base}${ext}`;
  const dest = path.join(IMAGE_DIR, file);

  if (fs.existsSync(dest)) return file;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'AnimeLister/1.0 (self-hosted)' },
  });
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);
  const type = res.headers.get('content-type') || '';
  if (type && !type.startsWith('image/')) throw new Error('That link is not an image.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('Image is too large.');

  const tmp = `${dest}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, buf);
  await fs.promises.rename(tmp, dest);
  return file;
}

const isImageUsed = db.prepare(`
  SELECT 1 WHERE EXISTS (SELECT 1 FROM entries WHERE image_file = @f)
              OR EXISTS (SELECT 1 FROM users WHERE avatar_file = @f)
              OR EXISTS (SELECT 1 FROM anime WHERE cover_file = @f)
              OR EXISTS (SELECT 1 FROM ships WHERE cover_file = @f)`);

// Deletes a cached image once nothing references it anymore.
function removeImageIfUnused(file) {
  if (!file || isImageUsed.get({ f: file })) return;
  fs.promises.rm(path.join(IMAGE_DIR, path.basename(file)), { force: true }).catch(() => {});
}

// On startup, retry caching for entries whose image download failed earlier.
async function retryMissingImages() {
  const rows = db
    .prepare(`
      SELECT e.id, e.anilist_id, e.image_url, e.original_image_url, l.kind
      FROM entries e JOIN lists l ON l.id = e.list_id
      WHERE e.image_file IS NULL AND e.image_url IS NOT NULL`)
    .all();
  const setFile = db.prepare('UPDATE entries SET image_file = ? WHERE id = ?');
  for (const row of rows) {
    try {
      // Original images use shared names ("<characterId>.ext", "anime-<id>.ext");
      // picked alternatives get a hash name.
      let base;
      if (row.kind !== 'character') base = `anime-${row.anilist_id}`;
      else if (row.image_url === row.original_image_url) base = String(row.anilist_id);
      const file = await cacheImage(row.image_url, base);
      if (file) setFile.run(file, row.id);
    } catch {
      // Still unavailable; the entry keeps using the remote URL.
    }
  }
}

module.exports = { cacheImage, isAllowedImageUrl, removeImageIfUnused, retryMissingImages };
