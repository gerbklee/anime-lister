// Study files for Clip Studio Paint: a layered .psd with the reference already
// placed, so you open it and start drawing.
//
// Layers (bottom to top): Paper, Reference (locked), Sketch, Lines, Colour, and
// a hidden proportion Grid. Layouts: "side" puts the reference on the left
// half and leaves the right half for you; "under" puts it under the whole
// canvas at low opacity and hidden: draw freehand, then show it to check (copying
// freehand teaches more than tracing).
const sharp = require('sharp');
const { writePsdBuffer } = require('ag-psd');

const MAX_SIDE = 2400;

const empty = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

function fill(img, r, g, b, a = 255) {
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = a;
  }
  return img;
}

// Thin lines every 1/8 of each half (or the whole canvas), with a stronger
// centre line: for measuring proportions.
function grid(width, height, halves) {
  const img = empty(width, height);
  const put = (x, y, a) => {
    const i = (y * width + x) * 4;
    img.data[i] = 70;
    img.data[i + 1] = 110;
    img.data[i + 2] = 200;
    img.data[i + 3] = a;
  };
  const panels = halves ? [[0, width / 2], [width / 2, width]] : [[0, width]];
  for (const [x0, x1] of panels) {
    const pw = x1 - x0;
    for (let k = 0; k <= 8; k++) {
      const x = Math.min(width - 1, Math.round(x0 + (pw * k) / 8));
      const a = k === 4 ? 200 : 110;
      for (let y = 0; y < height; y++) put(x, y, a);
    }
    for (let k = 0; k <= 8; k++) {
      const y = Math.min(height - 1, Math.round((height * k) / 8));
      const a = k === 4 ? 200 : 110;
      for (let x = Math.round(x0); x < Math.round(x1); x++) put(x, y, a);
    }
  }
  return img;
}

// buffer: the reference image. Returns a .psd as a Buffer.
async function studyPsd(buffer, { layout = 'side', title = 'Study' } = {}) {
  const ref = sharp(buffer, { failOn: 'none' }).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).ensureAlpha();
  const { data, info } = await ref.raw().toBuffer({ resolveWithObject: true });
  const rw = info.width;
  const rh = info.height;
  const side = layout !== 'under';
  const width = side ? rw * 2 : rw;
  const height = rh;
  const refData = { width: rw, height: rh, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };

  // Composite preview: paper with the reference (what CSP shows before opening layers).
  const composite = fill(empty(width, height), 255, 255, 255);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const si = (y * rw + x) * 4;
      const di = (y * width + x) * 4;
      const a = (refData.data[si + 3] / 255) * (side ? 1 : 0.3);
      for (let c = 0; c < 3; c++) composite.data[di + c] = Math.round(refData.data[si + c] * a + 255 * (1 - a));
    }
  }

  const psd = {
    width,
    height,
    imageData: composite,
    children: [
      { name: 'Paper', imageData: fill(empty(width, height), 255, 255, 255), transparencyProtected: true },
      { name: `Reference – ${title}`.slice(0, 60), left: 0, top: 0, imageData: refData, opacity: side ? 1 : 0.35, hidden: !side, protected: { transparency: true, composite: true, position: true } },
      { name: 'Sketch (rough, keep it loose)', opacity: 0.6 },
      { name: 'Lines' },
      { name: 'Colour' },
      { name: 'Grid (proportions)', imageData: grid(width, height, side), hidden: true },
    ],
  };
  return writePsdBuffer(psd, { generateThumbnail: false });
}

module.exports = { studyPsd };
