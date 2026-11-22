import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { subjectHref } from '../api.js';
import Avatar from './Avatar.jsx';
import Menu from './Menu.jsx';
import Reactions from './Reactions.jsx';

const SOURCE_NAMES = { danbooru: 'Danbooru', safebooru: 'Safebooru', zerochan: 'Zerochan', wallhaven: 'Wallhaven' };

// Full-screen picture viewer: swipe left/right, double-tap to save.
// items: fan art items (saved ones have `savedId`).
// actions: [{ icon, label, onSelect(item) }] for the ⋯ menu.
export default function FanartViewer({ items, index, onIndex, onClose, onSave, onUnsave, onHide, actions = [], showSubject = false, primary = null }) {
  const item = items[index];
  const [burst, setBurst] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const touch = useRef(null);
  const lastTap = useRef(0);

  const go = (delta) => {
    const next = index + delta;
    if (next >= 0 && next < items.length) onIndex(next);
  };

  useEffect(() => setLoaded(false), [item?.full]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  });

  // Preload the neighbours so swiping feels instant.
  useEffect(() => {
    for (const n of [items[index + 1], items[index - 1]]) {
      if (n?.full) {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.src = n.full;
      }
    }
  }, [items, index]);

  if (!item) return null;

  const save = async () => {
    if (busy || item.savedId || !onSave) return;
    setBusy(true);
    try {
      await onSave(item);
    } finally {
      setBusy(false);
    }
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, at: Date.now() };
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose();
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setBurst((b) => b + 1);
        save();
      }
      lastTap.current = now;
    }
  };

  const copies = item.sources?.length ? item.sources : [{ source: item.source, id: item.id, postUrl: item.postUrl }];

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Picture viewer">
      <div className="viewer-top">
        <span className="viewer-count">
          {index + 1} / {items.length}
        </span>
        {showSubject && item.subject && (
          <a className="viewer-subject" href={subjectHref(item.subject)} onClick={onClose}>
            {item.subjectName}
          </a>
        )}
        <button type="button" className="viewer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div
        className="viewer-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onDoubleClick={() => {
          setBurst((b) => b + 1);
          save();
        }}
      >
        {!loaded && <img className="viewer-img placeholder" src={item.thumb} alt="" referrerPolicy="no-referrer" />}
        <img
          key={item.full}
          className={`viewer-img ${loaded ? '' : 'loading'}`}
          src={item.full}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            // Fall back to the thumbnail if the large version isn't there.
            if (e.currentTarget.src !== new URL(item.thumb, window.location.href).href) e.currentTarget.src = item.thumb;
          }}
        />
        {burst > 0 && (
          <span key={burst} className="heart-burst" aria-hidden="true">
            ❤️
          </span>
        )}
        {index > 0 && (
          <button type="button" className="viewer-nav prev" onClick={() => go(-1)} aria-label="Previous">
            ‹
          </button>
        )}
        {index < items.length - 1 && (
          <button type="button" className="viewer-nav next" onClick={() => go(1)} aria-label="Next">
            ›
          </button>
        )}
      </div>

      <div className="viewer-bottom">
        {(item.popularity || item.spicy > 0) && (
          <div className="viewer-popularity">
            {item.spicy > 0 && <span className="spicy-tag">{item.spicy > 1 ? '🔞 Explicit' : '🌶️ Spicy'}</span>} {item.popularity && <>🔥 {item.popularity}</>}
          </div>
        )}
        <div className="viewer-credit">
          {item.artist && <span>🎨 {item.artist}</span>}
          {copies.map((c) =>
            c.postUrl ? (
              <a key={`${c.source}:${c.id}`} href={c.postUrl} target="_blank" rel="noreferrer">
                {SOURCE_NAMES[c.source] ?? c.source} ↗
              </a>
            ) : (
              <span key={`${c.source}:${c.id}`}>{SOURCE_NAMES[c.source] ?? c.source}</span>
            ),
          )}
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              Original ↗
            </a>
          )}
          {item.savedBy && (
            <span className="viewer-saved-by">
              <Avatar user={item.savedBy} size={18} /> saved
            </span>
          )}
        </div>
        <div className="viewer-actions">
          {item.savedId ? (
            <button type="button" className="btn ghost small-btn saved" onClick={() => onUnsave?.(item)} title="Remove from your gallery">
              💖 Saved
            </button>
          ) : (
            (onSave && (
              <button type="button" className="btn primary small-btn" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : '♡ Save'}
              </button>
            )) ||
            (primary && (
              <button type="button" className="btn primary small-btn" onClick={() => primary.onSelect(item)}>
                {primary.label}
              </button>
            ))
          )}
          {item.savedId && <Reactions target={`fanart:${item.savedId}`} initial={item.reactions} emojis={['❤️', '😂', '😳', '🔥']} />}
          <div className="spacer" />
          {onHide && (
            <button type="button" className="icon-btn viewer-hide" onClick={() => onHide(item)} title="Hide this picture for both of you" aria-label="Hide picture">
              🙈
            </button>
          )}
          <Menu
            title="Picture"
            className="icon-btn menu-trigger viewer-more"
            items={actions.filter((a) => !a.show || a.show(item)).map((a) => ({ icon: a.icon, label: typeof a.label === 'function' ? a.label(item) : a.label, onSelect: () => a.onSelect(item) }))}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
