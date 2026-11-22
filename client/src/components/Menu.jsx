import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const isPhone = () => window.matchMedia('(max-width: 760px)').matches;

// A "⋯" (or any) button with a list of actions: a dropdown on desktop, an
// iOS-style action sheet on phones.
//
// items: [{ icon, label, onSelect, href, danger, disabled, right, keepOpen }]
//        falsy entries are skipped; 'divider' draws a line.
export default function Menu({
  items,
  title,
  label = 'More',
  icon = '⋯',
  text = null,
  className = 'icon-btn menu-trigger',
  align = 'right',
  children,
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const ref = useRef(null);
  const visible = (items ?? []).filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onDown = (e) => !sheet && !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    let previous;
    if (sheet) {
      previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      if (sheet) document.body.style.overflow = previous;
    };
  }, [open, sheet]);

  const toggle = (e) => {
    e.stopPropagation();
    setSheet(isPhone());
    setOpen((o) => !o);
  };

  const run = (item) => {
    if (item.disabled) return;
    if (!item.keepOpen) setOpen(false);
    item.onSelect?.();
  };

  const renderItems = (cls) =>
    visible.map((item, i) =>
      item === 'divider' ? (
        <div key={`d${i}`} className="menu-divider" role="separator" />
      ) : item.href ? (
        <a key={item.label} href={item.href} className={`${cls} ${item.danger ? 'danger' : ''}`} role="menuitem" onClick={() => setOpen(false)} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined}>
          {item.icon && <span className="menu-icon" aria-hidden="true">{item.icon}</span>}
          <span className="menu-item-name">{item.label}</span>
          {item.right && <span className="muted small">{item.right}</span>}
        </a>
      ) : (
        <button key={item.label} type="button" className={`${cls} ${item.danger ? 'danger' : ''}`} role="menuitem" onClick={() => run(item)} disabled={item.disabled}>
          {item.icon && <span className="menu-icon" aria-hidden="true">{item.icon}</span>}
          <span className="menu-item-name">{item.label}</span>
          {item.right && <span className="muted small">{item.right}</span>}
        </button>
      ),
    );

  if (!visible.length && !children) return null;

  return (
    <span className="menu-wrap" ref={ref}>
      <button type="button" className={className} onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}>
        {icon && <span aria-hidden="true">{icon}</span>}
        {text && <span>{text}</span>}
      </button>
      {open && !sheet && (
        <div className={`menu ${align === 'left' ? 'align-left' : ''}`} role="menu">
          {children}
          {renderItems('menu-item')}
        </div>
      )}
      {open &&
        sheet &&
        createPortal(
          <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="sheet" role="menu" aria-label={title ?? label}>
              <div className="sheet-group">
                {title && <div className="sheet-title">{title}</div>}
                {children && <div className="sheet-extra">{children}</div>}
                {renderItems('sheet-item')}
              </div>
              <button type="button" className="sheet-cancel" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
