import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// A swipeable "Wrapped" slideshow. Slides are plain data
// ({ emoji, kicker, big, sub, image, colors }) so they can be drawn both on
// screen and onto a canvas for "Save image".

const PALETTES = [
  ['#6d4aff', '#ff5ea8'],
  ['#0ea5e9', '#6d4aff'],
  ['#f97316', '#ef4444'],
  ['#10b981', '#0ea5e9'],
  ['#ec4899', '#8b5cf6'],
  ['#f59e0b', '#ec4899'],
];

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function saveSlide(slide, index) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [c1, c2] = slide.colors ?? PALETTES[index % PALETTES.length];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';

  let y = 220;
  if (slide.emoji) {
    ctx.font = '140px system-ui, sans-serif';
    ctx.fillText(slide.emoji, W / 2, y);
    y += 120;
  }
  const img = await loadImage(slide.image);
  if (img) {
    try {
      const h = 460;
      const w = (img.width / img.height) * h;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 30;
      ctx.drawImage(img, (W - w) / 2, y, w, h);
      ctx.restore();
      ctx.getImageData(0, 0, 1, 1); // throws if the picture can't be exported
      y += h + 90;
    } catch {
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 10, W, 480);
      ctx.fillStyle = '#fff';
    }
  }
  if (slide.kicker) {
    ctx.font = '600 44px system-ui, sans-serif';
    ctx.globalAlpha = 0.85;
    ctx.fillText(slide.kicker, W / 2, y);
    ctx.globalAlpha = 1;
    y += 100;
  }
  ctx.font = '800 92px system-ui, sans-serif';
  for (const line of wrapText(ctx, slide.big, W - 140).slice(0, 3)) {
    ctx.fillText(line, W / 2, y);
    y += 104;
  }
  if (slide.sub) {
    ctx.font = '40px system-ui, sans-serif';
    y += 20;
    for (const line of wrapText(ctx, slide.sub, W - 160).slice(0, 4)) {
      ctx.fillText(line, W / 2, y);
      y += 54;
    }
  }
  ctx.font = '30px system-ui, sans-serif';
  ctx.globalAlpha = 0.7;
  ctx.fillText('✦ Anime Hub', W / 2, H - 60);

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], `wrapped-${index + 1}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => {});
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

export default function Wrapped({ slides, onClose }) {
  const [i, setI] = useState(0);
  const [saving, setSaving] = useState(false);
  const slide = slides[i];
  const [c1, c2] = slide.colors ?? PALETTES[i % PALETTES.length];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, slides.length - 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [slides.length, onClose]);

  let touchX = null;

  return createPortal(
    <div
      className="wrapped"
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      onTouchStart={(e) => {
        touchX = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (dx < -40) setI((x) => Math.min(x + 1, slides.length - 1));
        if (dx > 40) setI((x) => Math.max(x - 1, 0));
        touchX = null;
      }}
    >
      <div className="wrapped-dots">
        {slides.map((_, k) => (
          <span key={k} className={k <= i ? 'on' : ''} />
        ))}
      </div>
      <button className="wrapped-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div className="wrapped-slide" key={i}>
        {slide.emoji && <div className="wrapped-emoji">{slide.emoji}</div>}
        {slide.image && <img className="wrapped-image" src={slide.image} alt="" />}
        {slide.kicker && <div className="wrapped-kicker">{slide.kicker}</div>}
        <div className="wrapped-big">{slide.big}</div>
        {slide.sub && <div className="wrapped-sub">{slide.sub}</div>}
      </div>
      <button className="wrapped-nav prev" onClick={() => setI((x) => Math.max(x - 1, 0))} aria-label="Previous" disabled={i === 0} />
      <button className="wrapped-nav next" onClick={() => setI((x) => Math.min(x + 1, slides.length - 1))} aria-label="Next" disabled={i === slides.length - 1} />
      <div className="wrapped-bottom">
        <button
          className="btn wrapped-save"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await saveSlide(slide, i);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : '📸 Save this slide'}
        </button>
        <span className="wrapped-count">
          {i + 1} / {slides.length}
        </span>
      </div>
    </div>,
    document.body,
  );
}
