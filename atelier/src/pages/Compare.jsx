import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

// Then & now for anything you draw again and again: pick two drawings
// (filtered by area, lesson or project) and slide between them.
export default function Compare() {
  const { areas, query } = useApp();
  const [all, setAll] = useState(null);
  const [filter, setFilter] = useState('');
  const [a, setA] = useState(Number(query.get('a')) || null);
  const [b, setB] = useState(Number(query.get('b')) || null);
  const [pos, setPos] = useState(50);
  useEffect(() => {
    api.drawings().then((r) => setAll(r.drawings.filter((d) => d.file))).catch(() => setAll([]));
  }, []);
  if (!all) return <p className="muted">Loading…</p>;

  const first = all.find((d) => d.id === a);
  // Default filter: the first drawing's lesson, else its area.
  const options = (() => {
    const lessons = [...new Map(all.filter((d) => d.lessonId).map((d) => [d.lessonId, d.lessonTitle])).entries()];
    const projects = [...new Map(all.filter((d) => d.projectId).map((d) => [d.projectId, (d.title ?? '').split(' · ')[0]])).entries()];
    return { lessons, projects };
  })();
  const matches = (d) => {
    if (!filter) return true;
    const [kind, value] = filter.split(':');
    if (kind === 'area') return d.area === value;
    if (kind === 'lesson') return d.lessonId === value;
    if (kind === 'project') return String(d.projectId) === value;
    return true;
  };
  const list = all.filter(matches);
  const older = all.find((d) => d.id === Math.min(a ?? Infinity, b ?? Infinity));
  const newer = all.find((d) => d.id === Math.max(a ?? -Infinity, b ?? -Infinity));
  const pick = (id) => {
    if (a === id) return setA(null);
    if (b === id) return setB(null);
    if (!a) return setA(id);
    if (!b) return setB(id);
    setB(id);
  };
  const date = (d) => new Date(d.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ marginTop: 10 }}>
      <a className="small" href="#/progress">
        ← Progress
      </a>
      <div className="kicker" style={{ marginTop: 14 }}>
        Then & now
      </div>
      <h1>Compare two drawings</h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        Pick two drawings of the same thing, months apart: hands, a face, your main character. Slide between them to see what changed.
      </p>

      {older && newer && older.id !== newer.id && (
        <section className="section">
          <div className="thennow" style={{ maxWidth: 620 }}>
            <img src={newer.file} alt={`Now: ${newer.title ?? ''}`} />
            <img src={older.file} alt={`Then: ${older.title ?? ''}`} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, background: 'var(--accent)' }} />
          </div>
          <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} style={{ width: '100%', maxWidth: 620 }} aria-label="Slide between then and now" />
          <div className="row small muted" style={{ justifyContent: 'space-between', maxWidth: 620 }}>
            <span>
              ← Then: {older.title ?? older.exerciseTitle ?? 'Untitled'} · {date(older)}
            </span>
            <span>
              Now: {date(newer)} →
            </span>
          </div>
          <p className="tiny muted">{Math.round((newer.createdAt - older.createdAt) / 86400000)} days apart.</p>
        </section>
      )}

      <section className="section">
        <div className="row" style={{ marginBottom: 10 }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 340 }} aria-label="Filter">
            <option value="">All drawings ({all.length})</option>
            <optgroup label="Area">
              {areas.map((x) => (
                <option key={x.id} value={`area:${x.id}`}>
                  {x.name}
                </option>
              ))}
            </optgroup>
            {options.lessons.length > 0 && (
              <optgroup label="Lesson">
                {options.lessons.map(([id, title]) => (
                  <option key={id} value={`lesson:${id}`}>
                    {title}
                  </option>
                ))}
              </optgroup>
            )}
            {options.projects.length > 0 && (
              <optgroup label="Project">
                {options.projects.map(([id, title]) => (
                  <option key={id} value={`project:${id}`}>
                    {title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="small muted">
            {a && b ? 'Click a picked drawing to swap it out.' : `Pick ${a || b ? 'one more' : 'two'} drawing${a || b ? '' : 's'}.`}
            {first && !filter && first.area && (
              <>
                {' '}
                <button className="link-btn" onClick={() => setFilter(first.lessonId ? `lesson:${first.lessonId}` : `area:${first.area}`)}>
                  Show similar ones
                </button>
              </>
            )}
          </span>
        </div>
        <div className="book">
          {list.map((d) => (
            <button key={d.id} className={`page-tile pick ${d.id === a || d.id === b ? 'picked' : ''}`} onClick={() => pick(d.id)} aria-pressed={d.id === a || d.id === b}>
              <img src={d.file} alt={d.title ?? ''} loading="lazy" />
              <div className="meta">
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.exerciseTitle ?? d.title ?? 'Untitled'}</div>
                <div className="tiny muted">{date(d)}</div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
