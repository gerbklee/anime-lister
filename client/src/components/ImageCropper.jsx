import { useCallback, useEffect, useRef, useState } from 'react';

// Pictures from Danbooru's CDN need the NAS proxy to show in the browser.
export function displayUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url, window.location.href);
    if (u.hostname === 'cdn.donmai.us') return `/api/fanart/img?u=${encodeURIComponent(u.href)}`;
  } catch {
    // relative or odd URL: use as is
  }
  return url;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Choose which part of a picture becomes the portrait: drag to move,
// pinch / scroll / slider to zoom. The frame has the portrait's shape.
// crop (in and out): { x, y, w, h } as fractions of the picture.
export default function ImageCropper({ src, aspect = 5 / 7, initialCrop = null, onChange, overlay = null, maxWidth = 280 }) {
  const frameRef = useRef(null);
  const [frame, setFrame] = useState({ w: 250, h: 350 });
  const [img, setImg] = useState(null); // natural size
  const [view, setView] = useState(null); // { scale, x, y } in frame pixels
  const [error, setError] = useState(false);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  // Frame size: as wide as fits (max 280px), portrait-shaped.
  useEffect(() => {
    const measure = () => {
      // Fit the width of the dialog and leave room for buttons on short screens.
      const byWidth = (frameRef.current?.parentElement?.clientWidth ?? 280) - 8;
      const byHeight = window.innerHeight * 0.45 * aspect;
      const w = Math.round(Math.max(140, Math.min(maxWidth, byWidth, byHeight)));
      setFrame({ w, h: Math.round(w / aspect) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [aspect]);

  const minScale = img ? Math.max(frame.w / img.w, frame.h / img.h) : 1;

  const fit = useCallback(
    (v) => {
      if (!img) return v;
      const scale = clamp(v.scale, minScale, minScale * 6);
      const x = clamp(v.x, frame.w - img.w * scale, 0);
      const y = clamp(v.y, frame.h - img.h * scale, 0);
      return { scale, x, y };
    },
    [img, minScale, frame],
  );

  // Initial view: the saved crop, or centred horizontally and at the top
  // (faces are usually in the upper part).
  useEffect(() => {
    if (!img) return;
    if (initialCrop) {
      const scale = frame.w / (initialCrop.w * img.w);
      setView(fit({ scale, x: -initialCrop.x * img.w * scale, y: -initialCrop.y * img.h * scale }));
    } else {
      const scale = minScale;
      setView(fit({ scale, x: (frame.w - img.w * scale) / 2, y: 0 }));
    }
    // only when the picture or frame changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, frame.w, frame.h]);

  // Report the crop whenever the view changes.
  useEffect(() => {
    if (!img || !view) return;
    onChange?.({
      x: -view.x / (img.w * view.scale),
      y: -view.y / (img.h * view.scale),
      w: frame.w / (img.w * view.scale),
      h: frame.h / (img.h * view.scale),
    });
  }, [view, img, frame, onChange]);

  // Zoom keeping the point (cx, cy) in the frame where it is.
  const zoomTo = (scale, cx = frame.w / 2, cy = frame.h / 2) => {
    setView((v) => {
      if (!v) return v;
      const s = clamp(scale, minScale, minScale * 6);
      const k = s / v.scale;
      return fit({ scale: s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    });
  };

  const local = (e) => {
    const r = frameRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    gesture.current = null;
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId) || !view) return;
    const prev = pointers.current.get(e.pointerId);
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      setView((v) => fit({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y }));
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (gesture.current) {
        const g = gesture.current;
        setView((v) => {
          const s = clamp(v.scale * (dist / g.dist), minScale, minScale * 6);
          const k = s / v.scale;
          return fit({ scale: s, x: mid.x - (g.mid.x - v.x) * k, y: mid.y - (g.mid.y - v.y) * k });
        });
      }
      gesture.current = { dist, mid };
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };
  const onWheel = (e) => {
    if (!view) return;
    const p = local(e);
    zoomTo(view.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
  };

  // Non-passive wheel listener so the page doesn't scroll while zooming.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const stop = (e) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  const zoom = view && img ? view.scale / minScale : 1;

  return (
    <div className="cropper">
      <div
        ref={frameRef}
        className="cropper-frame"
        style={{ width: frame.w, height: frame.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {error ? (
          <p className="muted small cropper-error">This picture can't be shown here.</p>
        ) : (
          <img
            src={displayUrl(src)}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(e) => setImg({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setError(true)}
            style={
              view && img
                ? { width: img.w * view.scale, height: img.h * view.scale, transform: `translate(${view.x}px, ${view.y}px)` }
                : { opacity: 0 }
            }
          />
        )}
        <div className="cropper-guides" aria-hidden="true" />
        {overlay}
      </div>
      <label className="cropper-zoom">
        <span aria-hidden="true">−</span>
        <input
          type="range"
          min="1"
          max="6"
          step="0.01"
          value={zoom}
          onChange={(e) => zoomTo(minScale * Number(e.target.value))}
          aria-label="Zoom"
          disabled={!view}
        />
        <span aria-hidden="true">+</span>
      </label>
      <p className="muted tiny cropper-hint">Drag to move · pinch or use the slider to zoom</p>
    </div>
  );
}
