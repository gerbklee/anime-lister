// Downloads character images into the data volume so lists work offline
// and don't depend on AniList's CDN URLs staying the same.
const fs = require('fs');
const path = require('path');
const { db, IMAGE_DIR } = require('./db');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function isAniListUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'anilist.co' || u.hostname.endsWith('.anilist.co'));
  } catch {
    return false;
  }
}

// Returns the cached file name (e.g. "12345.jpg"), or null if there is no image.
async function cacheImage(url, anilistId) {
  if (!url || !isAniListUrl(url)) return null;

  let ext = path.extname(new URL(url).pathname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) ext = '.jpg';
  const file = `${anilistId}${ext}`;
  const dest = path.join(IMAGE_DIR, file);

  if (fs.existsSync(dest)) return file;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());

  const tmp = `${dest}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, buf);
  await fs.promises.rename(tmp, dest);
  return file;
}

const isImageUsed = db.prepare('SELECT 1 FROM entries WHERE image_file = ? LIMIT 1');

// Deletes a cached image once no entry in any list references it anymore.
function removeImageIfUnused(file) {
  if (!file || isImageUsed.get(file)) return;
  fs.promises.rm(path.join(IMAGE_DIR, path.basename(file)), { force: true }).catch(() => {});
}

// On startup, retry caching for entries whose image download failed earlier.
async function retryMissingImages() {
  const rows = db
    .prepare('SELECT id, anilist_id, image_url FROM entries WHERE image_file IS NULL AND image_url IS NOT NULL')
    .all();
  const setFile = db.prepare('UPDATE entries SET image_file = ? WHERE id = ?');
  for (const row of rows) {
    try {
      const file = await cacheImage(row.image_url, row.anilist_id);
      if (file) setFile.run(file, row.id);
    } catch {
      // Still unavailable; the entry keeps using the remote URL.
    }
  }
}

module.exports = { cacheImage, removeImageIfUnused, retryMissingImages };
