import { useState } from 'react';

// S/A/B/C/D tiers cut from a ranking: top 10% S, to 30% A, 60% B, 85% C, rest D.
const TIERS = [
  ['S', 0.1, '#ff7f7f'],
  ['A', 0.3, '#ffbf7f'],
  ['B', 0.6, '#ffdf7f'],
  ['C', 0.85, '#bfff7f'],
  ['D', 1, '#7fbfff'],
];

export function toTiers(entries) {
  const n = entries.length;
  const out = TIERS.map(([label, , color]) => ({ label, color, items: [] }));
  entries.forEach((e, i) => {
    const p = (i + 1) / n;
    const t = i === 0 ? 0 : TIERS.findIndex(([, cut]) => p <= cut + 1e-9);
    out[t].items.push(e);
  });
  return out;
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Skip pictures the browser won't let us export (no CORS).
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 1, 1);
        ctx.getImageData(0, 0, 1, 1);
        resolve(img);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function exportImage(title, tiers) {
  const W = 1080;
  const labelW = 110;
  const iw = 96;
  const ih = 128;
  const gap = 8;
  const perRow = Math.floor((W - labelW - gap * 2) / (iw + gap));
  const rowsOf = (t) => Math.max(1, Math.ceil(t.items.length / perRow));
  const top = 70;
  const H = top + tiers.reduce((s, t) => s + rowsOf(t) * (ih + gap) + gap, 0) + 30;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12131a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8e9f0';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(title, 20, 45);

  const images = await Promise.all(tiers.flatMap((t) => t.items).map((e) => loadImage(e.image)));
  let k = 0;
  let y = top;
  for (const t of tiers) {
    const h = rowsOf(t) * (ih + gap) + gap;
    ctx.fillStyle = t.color;
    ctx.fillRect(0, y, labelW, h - 2);
    ctx.fillStyle = '#1b1d27';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.label, labelW / 2, y + h / 2 + 15);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1b1d27';
    ctx.fillRect(labelW, y, W - labelW, h - 2);
    t.items.forEach((e, i) => {
      const x = labelW + gap + (i % perRow) * (iw + gap);
      const yy = y + gap + Math.floor(i / perRow) * (ih + gap);
      const img = images[k++];
      if (img) {
        // Cover-crop into the tile.
        const r = Math.max(iw / img.width, ih / img.height);
        const sw = iw / r;
        const sh = ih / r;
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, yy, iw, ih);
      } else {
        ctx.fillStyle = '#2f3344';
        ctx.fillRect(x, yy, iw, ih);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x, yy + ih - 20, iw, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(e.name.length > 14 ? `${e.name.slice(0, 13)}…` : e.name, x + 4, yy + ih - 6);
    });
    y += h;
  }
  ctx.fillStyle = '#9298ad';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Anime Lister', W - 110, H - 10);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = new File([blob], `${title.replace(/[^\w-]+/g, '_')}_tiers.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title }).catch(() => {});
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

export default function TierView({ entries, title }) {
  const [busy, setBusy] = useState(false);
  const tiers = toTiers(entries);
  return (
    <div className="tier-view">
      {tiers.map((t) => (
        <div className="tier-row" key={t.label}>
          <div className="tier-label" style={{ background: t.color }}>
            {t.label}
          </div>
          <div className="tier-items">
            {t.items.length === 0 && <span className="muted tiny tier-empty">–</span>}
            {t.items.map((e) => (
              <a key={e.id} className="tier-item" href={e.anime ? `#/anime/${e.anilistId}` : `#/character/${e.anilistId}`} title={e.name}>
                {e.image ? <img src={e.image} alt={e.name} loading="lazy" /> : <span className="img-placeholder">?</span>}
                <span className="tier-name">{e.name}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost"
        disabled={busy || !entries.length}
        onClick={async () => {
          setBusy(true);
          try {
            await exportImage(title, tiers);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Making image…' : '📸 Save as image'}
      </button>
    </div>
  );
}
