import { useState } from 'react';

// One Clip Studio guide, folded until opened.
export default function Guide({ g, open: initial = false, showLessons = false }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="guide">
      <button className="guide-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="guide-icon" aria-hidden="true">
          CSP
        </span>
        <span style={{ flex: 1 }}>
          <strong>{g.title}</strong>
          {g.since && <span className="chip" style={{ marginLeft: 8 }}>Ver. {g.since}+</span>}
          <br />
          <span className="small muted">{g.why}</span>
        </span>
        <span className="muted" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="guide-body">
          <ol>
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {g.traps?.length > 0 && (
            <ul className="mistakes small" style={{ paddingLeft: 20 }}>
              {g.traps.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <div className="row small" style={{ gap: 14 }}>
            {g.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                {l.title} ↗
              </a>
            ))}
          </div>
          {showLessons && g.lessons?.length > 0 && (
            <p className="tiny muted" style={{ margin: '10px 0 0' }}>
              Used in:{' '}
              {g.lessons.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ' · '}
                  <a href={`#/lesson/${l.id}`}>{l.title}</a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
