import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '../util.js';

const EMOJIS = ['👨', '👩', '💖', '💙', '⭐', '🔥', '😈', '👑', '🗡️', '🌸', '🦊', '🧸', '🍑', '💀', '🥵', '😳'];

// Category + emoji of a character list (owner only).
export default function CategoryPicker({ category, emoji, onChange, inline = false, onClose }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = CATEGORIES[category] ?? CATEGORIES.other;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const panel = (cls) => (
    <div className={cls} role="menu">
      <span className="muted tiny menu-heading">Category (used for “My type”)</span>
      {Object.entries(CATEGORIES).map(([key, c]) => (
        <button key={key} type="button" role="menuitemradio" aria-checked={key === category} className={`menu-item ${key === category ? 'checked' : ''}`} onClick={() => onChange({ category: key })}>
          <span>
            {c.emoji} {c.label}
          </span>
          {key === category && <span>✓</span>}
        </button>
      ))}
      <span className="muted tiny menu-heading">Emoji</span>
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={`emoji-btn ${e === emoji ? 'checked' : ''}`} onClick={() => onChange({ emoji: e })}>
            {e}
          </button>
        ))}
        <button type="button" className="emoji-btn reset" onClick={() => onChange({ emoji: null })} title="Use the category's emoji">
          ↺
        </button>
      </div>
      {onClose && (
        <button type="button" className="btn ghost small-btn category-done" onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );

  if (inline) return panel('card category-inline');

  return (
    <span className="menu-wrap" ref={ref}>
      <button type="button" className="btn ghost small-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Category and emoji">
        {emoji || current.emoji} {current.label} ▾
      </button>
      {open && (
        <div className="menu category-menu" role="menu">
          <span className="muted tiny menu-heading">Category (used for “My type”)</span>
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={key === category}
              className={`menu-item ${key === category ? 'checked' : ''}`}
              onClick={() => onChange({ category: key })}
            >
              <span>
                {c.emoji} {c.label}
              </span>
              {key === category && <span>✓</span>}
            </button>
          ))}
          <span className="muted tiny menu-heading">Emoji</span>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button key={e} type="button" className={`emoji-btn ${e === emoji ? 'checked' : ''}`} onClick={() => onChange({ emoji: e })}>
                {e}
              </button>
            ))}
            <button type="button" className="emoji-btn reset" onClick={() => onChange({ emoji: null })} title="Use the category's emoji">
              ↺
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
