import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

// Quarterly portfolio review: pick 3–5 pieces, rate them 1–10 on a
// professional rubric (optionally with a critique of the set), and follow
// your level across the years.

function LevelChart({ reviews, rubric }) {
  const pts = reviews.filter((r) => r.self || r.critique?.scores);
  if (pts.length < 1) return null;
  const W = 640;
  const H = 200;
  const pad = { l: 28, r: 12, t: 12, b: 26 };
  const x = (i) => pad.l + (pts.length > 1 ? (i / (pts.length - 1)) * (W - pad.l - pad.r) : (W - pad.l - pad.r) / 2);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - 1) / 9);
  const avg = (o) => {
    const v = rubric.map((c) => o?.[c.id]).filter((n) => n != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const series = [
    { name: 'Your rating', c: 'var(--series-1)', v: pts.map((r) => avg(r.self)) },
    { name: 'Critique', c: 'var(--series-2)', v: pts.map((r) => avg(r.critique?.scores)) },
  ].filter((s) => s.v.some((n) => n != null));
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average portfolio level per review">
        {[1, 3, 5, 7, 9].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={pad.l - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(8)} y2={y(8)} stroke="var(--ink-2)" strokeDasharray="5 4" />
        <text x={W - pad.r} y={y(8) - 5} fontSize="10" textAnchor="end" fill="var(--ink-2)">
          professional
        </text>
        {series.map((s) => (
          <g key={s.name}>
            <polyline points={s.v.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')} fill="none" style={{ stroke: s.c }} strokeWidth="2" />
            {s.v.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r="4.5" style={{ fill: s.c }} stroke="var(--card)" strokeWidth="2"><title>{`${s.name}: ${v.toFixed(1)}`}</title></circle>)}
          </g>
        ))}
        {pts.map((r, i) => (
          <text key={r.id} x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">
            {new Date(r.at).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
          </text>
        ))}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.name} style={{ '--c': s.c }}>
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { toast, refreshProfile } = useApp();
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState([]);
  const [self, setSelf] = useState({});
  const [withCritique, setWithCritique] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => api.portfolio().then(setData);
  useEffect(() => {
    load().catch(() => {});
  }, []);
  if (!data) return <p className="muted">Loading…</p>;
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < 5 ? [...picked, id] : picked);
  const complete = picked.length >= 3 && data.rubric.every((c) => self[c.id]);
  const save = async () => {
    setBusy(true);
    try {
      await api.savePortfolio({ drawingIds: picked, self, critique: withCritique });
      toast('Review saved');
      setPicked([]);
      setSelf({});
      await load();
      refreshProfile();
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  };
  const last = data.reviews[data.reviews.length - 1];

  return (
    <div style={{ maxWidth: 900, marginTop: 10 }}>
      <div className="kicker">Every three months</div>
      <h1>Portfolio review</h1>
      <p className="muted">
        Your best 3–5 pieces, judged against a professional scale ({data.levels}). Over the years this shows how close you are to working as an illustrator.
        {data.status.dueAt && ` Next review: ${new Date(data.status.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`}
      </p>

      {data.reviews.length > 0 && (
        <section className="section card">
          <h3>Your level over time</h3>
          <LevelChart reviews={data.reviews} rubric={data.rubric} />
        </section>
      )}

      {last?.critique && !last.critique.refused && (
        <section className="section card">
          <div className="kicker">Last review · {new Date(last.at).toLocaleDateString()}</div>
          <p style={{ fontFamily: 'var(--serif)', fontSize: '1.08rem' }}>{last.critique.summary}</p>
          <div className="grid-2">
            <div>
              <strong className="small">Strengths</strong>
              <ul className="points small" style={{ paddingLeft: 20 }}>
                {last.critique.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong className="small">Priorities for the next three months</strong>
              <ol className="small" style={{ paddingLeft: 20 }}>
                {last.critique.priorities.map((p) => (
                  <li key={p.title}>
                    <strong>{p.title}.</strong> {p.detail}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <table className="data" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Critique</th>
                <th>You</th>
              </tr>
            </thead>
            <tbody>
              {data.rubric.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{last.critique.scores?.[c.id] ?? '–'}</td>
                  <td>{last.self?.[c.id] ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="wash" style={{ padding: 14, marginTop: 12 }}>
            <div className="kicker">Next quarter</div>
            <p style={{ margin: 0 }}>{last.critique.nextQuarter}</p>
          </div>
        </section>
      )}

      <section className="section card">
        <h3>New review</h3>
        <p className="small muted">1. Pick 3–5 pieces ({picked.length} picked). Finished pieces and projects come first.</p>
        <div className="book">
          {data.candidates.map((d) => (
            <button key={d.id} className={`page-tile pick ${picked.includes(d.id) ? 'picked' : ''}`} onClick={() => toggle(d.id)} aria-pressed={picked.includes(d.id)}>
              <img src={d.file} alt={d.title ?? ''} loading="lazy" />
              <div className="meta">
                {picked.includes(d.id) ? `✓ ${picked.indexOf(d.id) + 1}. ` : ''}
                {d.title ?? d.exerciseTitle ?? 'Untitled'}
              </div>
            </button>
          ))}
        </div>
        <p className="small muted section">2. Rate the set honestly, 1–10.</p>
        <div className="rubric">
          {data.rubric.map((c) => (
            <div key={c.id} className="rubric-row">
              <strong className="small">{c.name}</strong>
              <span className="tiny muted">{c.hint}</span>
              <div className="dots">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} className={self[c.id] === n ? 'active' : ''} onClick={() => setSelf({ ...self, [c.id]: n })} aria-label={`${n} of 10`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {data.critiqueAvailable && (
          <label className="row small section" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={withCritique} onChange={(e) => setWithCritique(e.target.checked)} /> Also get a portfolio critique from Claude (about 20–30¢)
          </label>
        )}
        <button className="btn primary" style={{ marginTop: 12 }} disabled={!complete || busy} onClick={save}>
          {busy ? (withCritique ? 'Reviewing your portfolio… (up to two minutes)' : 'Saving…') : 'Save the review'}
        </button>
      </section>
    </div>
  );
}
