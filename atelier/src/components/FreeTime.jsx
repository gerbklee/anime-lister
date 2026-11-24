import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useTimer } from './Timer.jsx';

// "Free drawing & projects" in Today: pick (or create) a personal project,
// start an open-ended timer, upload versions (.clip, .png, .jpg).
export default function FreeTime({ onUploaded }) {
  const timer = useTimer();
  const [projects, setProjects] = useState(null);
  const [pid, setPid] = useState(() => {
    try {
      return localStorage.getItem('atelier.project') ?? '';
    } catch {
      return '';
    }
  });
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const file = useRef(null);
  useEffect(() => {
    api.projects().then((r) => setProjects(r.projects.filter((p) => !p.archived))).catch(() => setProjects([]));
  }, []);
  const choose = (v) => {
    setPid(v);
    try {
      localStorage.setItem('atelier.project', v);
    } catch {
      // ignore
    }
  };
  const project = projects?.find((p) => String(p.id) === String(pid)) ?? null;

  const create = async () => {
    if (!newTitle.trim()) return;
    const p = await api.createProject(newTitle.trim());
    setProjects([p, ...(projects ?? [])]);
    choose(String(p.id));
    setNewTitle('');
  };
  const start = () => timer.start({ open: true, minutes: 240, kind: 'free', label: project?.title ?? 'Free drawing', projectId: project?.id ?? null }).catch((e) => setMsg(e.message));
  const upload = async (f) => {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = (project?.versions ?? 0) + 1;
      const d = await api.upload(f, { kind: 'free', projectId: project?.id, title: project ? `${project.title} · v${n}` : f.name.replace(/\.[^.]+$/, '').slice(0, 80) });
      onUploaded?.(d);
      window.location.hash = `#/drawing/${d.id}?new=1`;
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="exercise">
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 220px' }}>
          Working on
          <select value={pid} onChange={(e) => choose(e.target.value)}>
            <option value="">Just drawing (no project)</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 220px' }}>
          New project
          <input type="text" placeholder="e.g. Genshin fan art" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
        </label>
        <button className="btn small" onClick={create} disabled={!newTitle.trim()}>
          Create
        </button>
      </div>
      {project && (
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          {Math.floor(project.minutes / 60)} h {project.minutes % 60} min so far · {project.versions} {project.versions === 1 ? 'version' : 'versions'} ·{' '}
          <a href={`#/project/${project.id}`}>open the project</a>
        </p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        {!timer.running && (
          <button className="btn primary small" onClick={start}>
            ∞ Open-ended timer
          </button>
        )}
        <button className="btn small" onClick={() => file.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : project ? 'Upload a new version (.clip, .png, .jpg)' : 'Upload (.clip, .png, .jpg)'}
        </button>
        <input ref={file} type="file" accept="image/*,.clip" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {msg && <p className="small error">{msg}</p>}
    </div>
  );
}
