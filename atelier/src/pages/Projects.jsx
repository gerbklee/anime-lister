import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { useTimer } from '../components/Timer.jsx';

const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

// All personal projects.
export function Projects() {
  const [list, setList] = useState(null);
  const [title, setTitle] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const load = () => api.projects().then((r) => setList(r.projects));
  useEffect(() => {
    load().catch(() => setList([]));
  }, []);
  const create = async () => {
    if (!title.trim()) return;
    const p = await api.createProject(title.trim());
    window.location.hash = `#/project/${p.id}`;
  };
  const shown = (list ?? []).filter((p) => showArchived || !p.archived);
  return (
    <div style={{ marginTop: 10 }}>
      <a className="small" href="#/sketchbook">
        ← Sketchbook
      </a>
      <div className="kicker" style={{ marginTop: 14 }}>
        Free drawing
      </div>
      <h1>Personal projects</h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        Your own pieces beside the path: fan art, original characters, anything. Time from open-ended focus blocks is tracked per project, and every upload (save the same .clip again) becomes a version, so you can watch a piece grow.
      </p>
      <div className="row" style={{ marginBottom: 18 }}>
        <input type="text" placeholder="New project, e.g. Genshin fan art" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} style={{ maxWidth: 360 }} />
        <button className="btn primary small" onClick={create} disabled={!title.trim()}>
          Create
        </button>
        <div className="spacer" />
        <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show finished
        </label>
      </div>
      {!list ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="muted">No projects yet. Create one, or start one from Today’s free drawing.</p>
      ) : (
        <div className="book">
          {shown.map((p) => (
            <a key={p.id} className="page-tile" href={`#/project/${p.id}`} style={{ opacity: p.archived ? 0.6 : 1 }}>
              {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <div style={{ aspectRatio: '4/5', background: 'var(--paper-2)', display: 'grid', placeItems: 'center', fontSize: 30 }}>✏️</div>}
              <div className="meta">
                <div style={{ fontWeight: 600 }}>{p.title}</div>
                <div className="tiny muted">
                  {hm(p.minutes)} · {p.versions} {p.versions === 1 ? 'version' : 'versions'}
                  {p.archived ? ' · finished' : ''}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// One project: time, sessions, and its versions from first sketch to final.
export function Project({ id }) {
  const { toast } = useApp();
  const timer = useTimer();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const file = useRef(null);
  const load = () =>
    api
      .project(id)
      .then((d) => {
        setData(d);
        setSel((s) => s ?? d.versions[d.versions.length - 1]?.id ?? null);
      })
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { project, versions, sessions } = data;
  const current = versions.find((v) => v.id === sel);

  const upload = async (f) => {
    if (!f) return;
    setBusy(true);
    try {
      const d = await api.upload(f, { kind: 'free', projectId: project.id, title: `${project.title} · v${versions.length + 1}` });
      toast('New version saved');
      setSel(d.id);
      await load();
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  };
  const toggleArchive = async () => {
    await api.updateProject(project.id, { archived: !project.archived });
    load();
  };

  return (
    <div style={{ marginTop: 10 }}>
      <a className="small" href="#/projects">
        ← Projects
      </a>
      <section className="row" style={{ marginTop: 10, justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="kicker">Personal project{project.archived ? ' · finished' : ''}</div>
          <h1 style={{ margin: 0 }}>{project.title}</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {hm(project.minutes)} of focus · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} · {versions.length} {versions.length === 1 ? 'version' : 'versions'} · started {new Date(project.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="row">
          {!timer.running && (
            <button className="btn primary small" onClick={() => timer.start({ open: true, minutes: 240, kind: 'free', label: project.title, projectId: project.id })}>
              ∞ Work on it
            </button>
          )}
          <button className="btn small" onClick={() => file.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : 'Upload a new version'}
          </button>
          <input ref={file} type="file" accept="image/*,.clip" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <button className="btn small ghost" onClick={toggleArchive}>
            {project.archived ? 'Reopen' : 'Mark as finished'}
          </button>
        </div>
      </section>

      {versions.length === 0 ? (
        <div className="wash section">
          <p style={{ margin: 0 }}>No versions yet. Upload your .clip (or a picture) whenever you reach a stage: sketch, lines, flats, final. Each upload becomes a version here.</p>
        </div>
      ) : (
        <>
          {current && (
            <section className="section">
              <a href={`#/drawing/${current.id}`}>
                <img src={current.file} alt={current.title ?? ''} style={{ width: '100%', maxWidth: 820, borderRadius: 14, display: 'block', background: 'var(--paper-2)' }} />
              </a>
              <p className="small muted" style={{ marginTop: 6 }}>
                {current.title} · {new Date(current.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {current.clip?.workMinutes ? ` · ${hm(current.clip.workMinutes)} in Clip Studio` : ''}
                {current.clip ? ` · ${current.clip.layers.length} layers` : ''} · <a href={`#/drawing/${current.id}`}>layers, critique, details</a>
              </p>
            </section>
          )}
          <section className="section">
            <h3>Versions</h3>
            <div className="versions">
              {versions.map((v, i) => (
                <button key={v.id} className={`version ${v.id === sel ? 'active' : ''}`} onClick={() => setSel(v.id)}>
                  <img src={v.file} alt="" loading="lazy" />
                  <span className="tiny">
                    v{i + 1} · {new Date(v.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
