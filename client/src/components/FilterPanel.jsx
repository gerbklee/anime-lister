import { useState } from 'react';

// "Filters (2)" button that folds the filter controls away until needed.
// `active`: how many filters differ from their defaults; `onReset` clears them.
export default function FilterPanel({ active = 0, onReset, children, summary }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="filter-panel">
      <div className="filter-bar">
        <button type="button" className={`btn ghost small-btn ${open || active ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span aria-hidden="true">⚙︎</span> Filters{active > 0 && <span className="filter-count">{active}</span>}
        </button>
        {summary && <span className="muted small filter-summary">{summary}</span>}
        {active > 0 && onReset && (
          <button type="button" className="link-btn small" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
      {open && <div className="filters filter-body card">{children}</div>}
    </div>
  );
}
