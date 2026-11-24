import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { kindLabel } from '../components/Exercise.jsx';

const monthOf = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

function Tile({ d, showUser }) {
  return (
    <a className="page-tile" href={`#/drawing/${d.id}`}>
      {d.file ? <img src={d.file} alt={d.title ?? ''} loading="lazy" /> : <img src={d.reference} alt="" loading="lazy" style={{ opacity: 0.55, filter: 'grayscale(.4)' }} />}
      <div className="meta">
        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.exerciseTitle ?? d.title ?? kindLabel(d.kind)}</div>
        <div className="tiny muted">
          {showUser && d.user ? `${d.user.username} · ` : ''}
          {d.status === 'todo' ? 'to draw' : kindLabel(d.kind)}
          {d.critique && !d.critique.refused ? ' · critiqued' : ''}
          {d.shared && !showUser ? ' · shared' : ''}
        </div>
      </div>
    </a>
  );
}

export default function Sketchbook({ tab = 'mine' }) {
  const [mine, setMine] = useState(null);
  const [shared, setShared] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const file = useRef(null);

  useEffect(() => {
    api.drawings().then((r) => setMine(r.drawings)).catch(() => setMine([]));
  }, []);
  useEffect(() => {
    if (tab === 'shared' && !shared) api.sharedDrawings().then((r) => setShared(r.drawings)).catch(() => setShared([]));
  }, [tab, shared]);

  const upload = async (f) => {
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await api.upload(f, { kind: 'free', title: f.name.replace(/\.[^.]+$/, '').slice(0, 80) });
      window.location.hash = `#/drawing/${d.id}?new=1`;
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const todo = (mine ?? []).filter((d) => d.status === 'todo');
  const done = (mine ?? []).filter((d) => d.file);
  const groups = new Map();
  for (const d of done) {
    const m = monthOf(d.createdAt);
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(d);
  }

  return (
    <>
      <section className="row" style={{ marginTop: 10, justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="kicker">Private unless you share a page</div>
          <h1 style={{ margin: 0 }}>Sketchbook</h1>
        </div>
        <div className="row">
          <button className="btn primary small" onClick={() => file.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : '+ Add a drawing'}
          </button>
          <input ref={file} type="file" accept="image/*,.clip" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </section>
      {err && <p className="error small">{err}</p>}

      <div className="seg" style={{ marginTop: 18 }} role="tablist">
        {[
          ['mine', `Mine${done.length ? ` (${done.length})` : ''}`],
          ['projects', 'Projects'],
          ['todo', `To draw${todo.length ? ` (${todo.length})` : ''}`],
          ['shared', 'Shared with me'],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => (window.location.hash = k === "projects" ? "#/projects" : `#/sketchbook/${k}`)} role="tab" aria-selected={tab === k}>
            {l}
          </button>
        ))}
      </div>

      <section className="section">
        {tab === 'mine' &&
          (mine == null ? (
            <p className="muted">Loading…</p>
          ) : done.length === 0 ? (
            <div className="wash">
              <h3>An empty sketchbook – the best kind of start.</h3>
              <p className="muted" style={{ margin: 0 }}>
                Every drawing you upload from an exercise lands here, with its reference, your self-rating and critiques. In a few months, flipping back to page one will be the best motivation there is.
              </p>
            </div>
          ) : (
            [...groups].map(([m, list]) => (
              <div key={m} style={{ marginBottom: 26 }}>
                <h3>{m}</h3>
                <div className="book">
                  {list.map((d) => (
                    <Tile key={d.id} d={d} />
                  ))}
                </div>
              </div>
            ))
          ))}
        {tab === 'todo' &&
          (todo.length === 0 ? (
            <p className="muted">
              Nothing waiting. In Anime Hub’s Art viewer, “✏️ Study this” on any picture puts it here with its reference ready.
            </p>
          ) : (
            <div className="book">
              {todo.map((d) => (
                <Tile key={d.id} d={d} />
              ))}
            </div>
          ))}
        {tab === 'shared' &&
          (shared == null ? (
            <p className="muted">Loading…</p>
          ) : shared.length === 0 ? (
            <p className="muted">Nobody has shared a drawing yet.</p>
          ) : (
            <div className="book">
              {shared.map((d) => (
                <Tile key={d.id} d={d} showUser />
              ))}
            </div>
          ))}
      </section>
    </>
  );
}
