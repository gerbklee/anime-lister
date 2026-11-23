import { useEffect, useRef, useState } from 'react';
import { api, findReferences, refSource } from '../api.js';
import { useTimer, fmt } from '../components/Timer.jsx';

// Skill check: the same four prompts every four weeks, timed, so rounds compare.
function Prompt({ p, round, done, onDone }) {
  const [refs, setRefs] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const file = useRef(null);
  useEffect(() => {
    if (!startedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt]);
  useEffect(() => {
    if (p.refs) findReferences(p.refs.tags, { limit: 6, maxLevel: 0 }).then(setRefs).catch(() => setRefs([]));
  }, [p]);
  const ref = refs?.[0];
  const left = startedAt ? startedAt + p.minutes * 60000 - now : p.minutes * 60000;
  const upload = async (f) => {
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      await api.upload(f, { kind: 'check', exerciseId: p.id, round, referenceUrl: ref ? refSource(ref) : undefined, referencePost: ref?.postUrl });
      onDone(p.id);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };
  return (
    <div className="exercise">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{p.title}</h3>
        {done ? <span className="chip sage">✓ uploaded</span> : <span className="chip">{p.minutes} min</span>}
      </div>
      <p>{p.prompt}</p>
      {p.refs && (ref ? <img src={ref.preview} alt="Reference" style={{ maxWidth: 360, width: '100%', borderRadius: 14, display: 'block', marginBottom: 10 }} /> : <p className="small muted">{refs ? 'No reference found; use any standing pose.' : 'Finding a reference…'}</p>)}
      {!done && (
        <div className="row">
          {!startedAt ? (
            <button className="btn small primary" onClick={() => setStartedAt(Date.now())}>
              Start {p.minutes}-minute timer
            </button>
          ) : (
            <strong style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', color: left <= 0 ? 'var(--accent)' : undefined }}>{left > 0 ? fmt(left) : 'Time’s up – pen down'}</strong>
          )}
          <button className="btn small" onClick={() => file.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      )}
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

export default function Check() {
  const timer = useTimer();
  const [data, setData] = useState(null);
  const [done, setDone] = useState(new Set());
  const blockStarted = useRef(false);
  useEffect(() => {
    api.checks().then(setData).catch(() => {});
  }, []);
  if (!data) return <p className="muted">Loading…</p>;
  const { status } = data;
  // Continue an unfinished round, else start the next.
  const lastRound = data.rounds[data.rounds.length - 1];
  const unfinished = lastRound && Object.keys(lastRound.drawings).length < status.prompts.length && Date.now() - lastRound.at < 3 * 24 * 3600 * 1000;
  const round = unfinished ? lastRound.round : status.nextRound;
  const already = new Set([...(unfinished ? Object.keys(lastRound.drawings) : []), ...done]);
  const all = status.prompts.every((p) => already.has(p.id));

  const startBlock = () => {
    if (blockStarted.current || timer.running) return;
    blockStarted.current = true;
    timer.start({ minutes: 30, kind: 'check', label: `Skill check #${round}` }).catch(() => {});
  };

  return (
    <div style={{ maxWidth: 760, marginTop: 10 }}>
      <a className="small" href="#/today">
        ← Today
      </a>
      <div className="kicker" style={{ marginTop: 14 }}>
        Every four weeks
      </div>
      <h1>Skill check #{round}</h1>
      <p className="muted">
        The same four prompts each time, with the same time limits, so you can see real progress in Then & Now. Don’t prepare and don’t redo: it’s a snapshot, not a test.
      </p>
      {!status.due && !unfinished && <p className="small">The next one is due {new Date(status.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}; you can still do one now.</p>}
      {!timer.running && !all && (
        <button className="btn small" onClick={startBlock} style={{ marginBottom: 14 }}>
          ⏱ Count it as a 30-minute focus block
        </button>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {status.prompts.map((p) => (
          <Prompt key={p.id} p={p} round={round} done={already.has(p.id)} onDone={(id) => setDone(new Set([...done, id]))} />
        ))}
      </div>
      {all && (
        <div className="wash section center">
          <h2>Snapshot taken.</h2>
          <p>An easel joins your valley. Compare it with your earlier rounds in Progress.</p>
          <a className="btn small primary" href="#/progress">
            Then & now
          </a>
        </div>
      )}
    </div>
  );
}
