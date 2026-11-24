// Reads Clip Studio Paint project files (.clip) for feedback: the canvas
// preview, the layer tree (names, kinds, opacity, blending, clipping,
// folders, visibility), the recorded work time, and each raster layer's
// pixels, so a critique can look at the sketch, the line art and the colour
// separately.
//
// Format (reverse-engineered, read-only): a "CSFCHUNK" container of chunks.
// "CHNKSQLi" holds an SQLite database with the project structure;
// "CHNKExta" chunks hold layer pixels as 256 × 256 tiles, each
// zlib-compressed: 256 × 256 alpha bytes followed by 256 × 256 BGRA pixels.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const sharp = require('sharp');

function chunksOf(buf) {
  if (buf.slice(0, 8).toString('latin1') !== 'CSFCHUNK') throw new Error('Not a Clip Studio file (.clip)');
  const chunks = [];
  let off = 24;
  while (off + 16 <= buf.length) {
    const tag = buf.slice(off, off + 8).toString('latin1');
    const len = Number(buf.readBigUInt64BE(off + 8));
    if (off + 16 + len > buf.length) break;
    chunks.push({ tag, off: off + 16, len });
    off += 16 + len;
    if (tag === 'CHNKFoot') break;
  }
  return chunks;
}

// Layer kinds as far as they can be read from the project.
function kindOf(l) {
  if (l.LayerFolder) return 'folder';
  if (l.LayerType === 1584) return 'paper';
  if (l.LayerType === 1) return 'raster';
  if (l.LayerType === 0 && !l.LayerRenderMipmap) return 'other';
  return l.LayerType === 0 ? 'image' : `type${l.LayerType}`;
}
const BLEND = { 0: 'Normal', 1: 'Darken', 2: 'Multiply', 3: 'Color burn', 4: 'Linear burn', 5: 'Subtract', 6: 'Darker color', 7: 'Lighten', 8: 'Screen', 9: 'Color dodge', 10: 'Glow dodge', 11: 'Add', 12: 'Add (Glow)', 13: 'Lighter color', 14: 'Overlay', 15: 'Soft light', 16: 'Hard light', 17: 'Difference', 18: 'Exclusion', 19: 'Vivid light', 20: 'Linear light', 21: 'Pin light', 22: 'Hard mix', 23: 'Hue', 24: 'Saturation', 25: 'Color', 26: 'Brightness', 30: 'Divide' };

// Decodes one layer's tiles into an RGBA buffer at full canvas size.
function decodeTiles(buf, extChunk, width, height) {
  const d = buf.slice(extChunk.off, extChunk.off + extChunk.len);
  const cols = Math.ceil(width / 256);
  const out = Buffer.alloc(width * height * 4);
  let p = 8 + Number(d.readBigUInt64BE(0)) + 8; // id length, id, data length
  let painted = 0;
  while (p + 16 < d.length) {
    const blockSize = d.readUInt32BE(p);
    const strLen = d.readUInt32BE(p + 4);
    if (!blockSize || strLen > 64) break;
    const q = p + 8 + strLen * 2;
    const idx = d.readUInt32BE(q);
    const has = d.readUInt32BE(q + 16);
    if (has) {
      const zlen = d.readUInt32BE(q + 20) - 4;
      const raw = zlib.inflateSync(d.slice(q + 28, q + 28 + zlen));
      const bx = (idx % cols) * 256;
      const by = Math.floor(idx / cols) * 256;
      for (let y = 0; y < 256; y++) {
        const yy = by + y;
        if (yy >= height) break;
        for (let x = 0; x < 256; x++) {
          const xx = bx + x;
          if (xx >= width) break;
          const a = raw[y * 256 + x];
          if (!a) continue;
          const s = 65536 + (y * 256 + x) * 4;
          const o = (yy * width + xx) * 4;
          out[o] = raw[s + 2];
          out[o + 1] = raw[s + 1];
          out[o + 2] = raw[s];
          out[o + 3] = a;
          painted++;
        }
      }
    }
    p += blockSize;
  }
  return { rgba: out, painted };
}

// Reads a .clip buffer. Returns the structure and, on request, layer images
// (PNG buffers scaled to fit `max`).
async function readClip(buf, { layerImages = false, max = 1600 } = {}) {
  const chunks = chunksOf(buf);
  const sq = chunks.find((c) => c.tag === 'CHNKSQLi');
  if (!sq) throw new Error('This .clip file has no project data');
  const tmp = path.join(os.tmpdir(), `clip-${crypto.randomBytes(6).toString('hex')}.sqlite`);
  fs.writeFileSync(tmp, buf.slice(sq.off, sq.off + sq.len));
  try {
    const db = new Database(tmp, { readonly: true, fileMustExist: true });
    try {
      const canvas = db.prepare('SELECT CanvasWidth AS w, CanvasHeight AS h, CanvasResolution AS dpi, CanvasRootFolder AS root, CanvasWorkTime AS work FROM Canvas').get();
      const prev = db.prepare('SELECT ImageData FROM CanvasPreview').get();
      const rows = db.prepare('SELECT * FROM Layer').all();
      const byId = new Map(rows.map((r) => [r.MainId, r]));
      // Walk the tree from the root folder (first child, next sibling); top of the stack last.
      const layers = [];
      const walk = (id, depth, parent) => {
        let cur = id;
        const seen = new Set();
        while (cur && byId.has(cur) && !seen.has(cur)) {
          seen.add(cur);
          const l = byId.get(cur);
          layers.push({ id: l.MainId, name: l.LayerName || '(unnamed)', kind: kindOf(l), opacity: Math.round((l.LayerOpacity / 256) * 100), blend: BLEND[l.LayerComposite] ?? `mode ${l.LayerComposite}`, clipped: !!l.LayerClip, visible: !!l.LayerVisibility, draft: !!l.DraftLayer, depth, parent, mip: l.LayerRenderMipmap });
          if (l.LayerFolder && l.LayerFirstChildIndex) walk(l.LayerFirstChildIndex, depth + 1, l.MainId);
          cur = l.LayerNextIndex;
        }
      };
      const root = byId.get(canvas.root);
      if (root?.LayerFirstChildIndex) walk(root.LayerFirstChildIndex, 0, null);
      const result = {
        width: canvas.w,
        height: canvas.h,
        dpi: canvas.dpi,
        workMinutes: canvas.work ? Math.round(canvas.work / 60000) : null,
        preview: prev?.ImageData ?? null,
        layers: layers.map(({ mip, ...l }) => l),
        images: {},
      };
      if (layerImages) {
        const extOff = new Map(db.prepare('SELECT ExternalID, Offset FROM ExternalChunk').all().map((r) => [String(Buffer.isBuffer(r.ExternalID) ? r.ExternalID.toString('latin1') : r.ExternalID), r.Offset]));
        const extByOff = new Map(chunks.filter((c) => c.tag === 'CHNKExta').map((c) => [c.off - 16, c]));
        const mipQ = db.prepare('SELECT BaseMipmapInfo FROM Mipmap WHERE MainId = ?');
        const infoQ = db.prepare('SELECT Offscreen FROM MipmapInfo WHERE MainId = ?');
        const offQ = db.prepare('SELECT BlockData FROM Offscreen WHERE MainId = ?');
        for (const l of layers) {
          if (l.kind !== 'raster' || !l.mip) continue;
          try {
            const base = mipQ.get(l.mip)?.BaseMipmapInfo;
            const offscreen = base && infoQ.get(base)?.Offscreen;
            const block = offscreen && offQ.get(offscreen)?.BlockData;
            const extId = block && (Buffer.isBuffer(block) ? block.toString('latin1') : String(block));
            const chunk = extId && extByOff.get(extOff.get(extId));
            if (!chunk) continue;
            const { rgba, painted } = decodeTiles(buf, chunk, canvas.w, canvas.h);
            if (!painted) continue;
            result.images[l.id] = await sharp(rgba, { raw: { width: canvas.w, height: canvas.h, channels: 4 } })
              .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
              .png()
              .toBuffer();
          } catch {
            // one unreadable layer shouldn't stop the rest
          }
        }
      }
      return result;
    } finally {
      db.close();
    }
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

module.exports = { readClip };
