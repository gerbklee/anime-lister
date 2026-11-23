// Downloads images into the data volume so pages work offline and don't
// depend on remote URLs staying the same.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, IMAGE_DIR } = require('./db');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_BYTES = 20 * 1024 * 1024;

// Only images from these sites are downloaded (AniList, MyAnimeList, Safebooru).
const ALLOWED_HOSTS = ['anilist.co', 'myanimelist.net', 'safebooru.org', 'donmai.us', 'zerochan.net', 'wallhaven.cc'];
// Extra sites the Art search uses. Only for pictures the server has checked itself
// (boards, wallpapers, "What is this?"), never for portraits or profile photos.
const TRUSTED_HOSTS = ['yande.re', 'konachan.com', 'gelbooru.com', 'pximg.net'];
const REFERERS = { 'pximg.net': 'https://app-api.pixiv.net/' };
const hostIn = (url, hosts) => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return hosts.find((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ?? null;
  } catch {
    return null;
  }
};

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
async function cacheImage(url, baseName, { trusted = false } = {}) {
  if (!url) return null;
  const extra = trusted ? hostIn(url, TRUSTED_HOSTS) : null;
  if (!isAllowedImageUrl(url) && !extra) throw new Error('Images can only come from AniList, MyAnimeList or the supported fan art sites.');

  let ext = path.extname(new URL(url).pathname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) ext = '.jpg';
  const base = baseName ?? `alt-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)}`;
  const file = `${base}${ext}`;
  const dest = path.join(IMAGE_DIR, file);

  if (fs.existsSync(dest)) return file;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'AnimeLister/1.0 (self-hosted)', ...(REFERERS[extra] ? { Referer: REFERERS[extra] } : {}) },
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
              OR EXISTS (SELECT 1 FROM ships WHERE cover_file = @f)
              OR EXISTS (SELECT 1 FROM fanart_saved WHERE image_file = @f OR thumb_file = @f)
              OR EXISTS (SELECT 1 FROM art_board_items WHERE image_file = @f OR thumb_file = @f)`);

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

// Cuts the area `crop` ({x, y, w, h} as fractions of the picture) out of a
// cached image and stores it as a new portrait file. Returns the file name.
function cleanCrop(crop) {
  if (!crop || typeof crop !== 'object') return null;
  const n = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : NaN);
  const c = { x: n(crop.x), y: n(crop.y), w: n(crop.w), h: n(crop.h) };
  if (Object.values(c).some(Number.isNaN) || c.w < 0.02 || c.h < 0.02) return null;
  c.w = Math.min(c.w, 1 - c.x);
  c.h = Math.min(c.h, 1 - c.y);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v * 10000) / 10000]));
}

async function cropImage(file, crop, { width = 500, height = 700, prefix = 'crop', quality = 86 } = {}) {
  const sharp = require('sharp');
  const src = path.join(IMAGE_DIR, file);
  const name = `${prefix}-${crypto.createHash('sha1').update(`${file}|${JSON.stringify(crop)}|${width}x${height}`).digest('hex').slice(0, 16)}.jpg`;
  const dest = path.join(IMAGE_DIR, name);
  if (fs.existsSync(dest)) return name;
  const img = sharp(src, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  const W = meta.width;
  const H = meta.height;
  const left = Math.max(0, Math.min(W - 1, Math.round(crop.x * W)));
  const top = Math.max(0, Math.min(H - 1, Math.round(crop.y * H)));
  const areaW = Math.max(1, Math.min(W - left, Math.round(crop.w * W)));
  const areaH = Math.max(1, Math.min(H - top, Math.round(crop.h * H)));
  const tmp = `${dest}.${process.pid}.tmp`;
  await img
    .extract({ left, top, width: areaW, height: areaH })
    .resize({ width, height, fit: 'cover', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality, mozjpeg: true })
    .toFile(tmp);
  await fs.promises.rename(tmp, dest);
  return name;
}

module.exports = { cacheImage, isAllowedImageUrl, removeImageIfUnused, retryMissingImages, cropImage, cleanCrop };
