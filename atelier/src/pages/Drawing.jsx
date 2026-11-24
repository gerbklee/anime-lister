import { useEffect, useRef, useState } from 'react';
import { api, psdUrl } from '../api.js';
import { useApp } from '../App.jsx';
import { useTimer } from '../components/Timer.jsx';
import { kindLabel } from '../components/Exercise.jsx';

const EMOJIS = ['❤️', '😂', '😮', '😳', '🔥'];

function Rubric({ criteria, value, onSave, locked }) {
  const [scores, setScores] = useState(value ?? {});
  const [saved, setSaved] = useState(!!value);
  useEffect(() => {
    setScores(value ?? {});
    setSaved(!!value);
  }, [value]);
  const complete = criteria.every((c) => scores[c.id]);
  return (
    <div className="rubric">
      {criteria.map((c) => (
        <div key={c.id} className="rubric-row">
          <strong className="small">{c.name}</strong>
          <span className="tiny muted">{c.hint}</span>
          <div className="dots" role="radiogroup" aria-label={c.name}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={scores[c.id] === n ? 'active' : ''}
                disabled={locked}
                onClick={() => {
                  setScores({ ...scores, [c.id]: n });
                  setSaved(false);
                }}
                aria-label={`${n} of 5`}
                aria-checked={scores[c.id] === n}
                role="radio"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="tiny muted" style={{ margin: 0 }}>
        1 not yet · 2 emerging · 3 working · 4 solid · 5 confident
      </p>
      {!locked && (
        <button className="btn small primary" disabled={!complete || saved} onClick={() => onSave(scores).then(() => setSaved(true))} style={{ justifySelf: 'start' }}>
          {saved ? '✓ Saved' : 'Save my rating'}
        </button>
      )}
    </div>
  );
}

function CritiqueView({ c, criteria, self }) {
  if (c.refused) return <p className="muted">{c.message}</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ fontFamily: 'var(--serif)', fontSize: '1.08rem', margin: 0 }}>{c.summary}</p>
      {c.works?.length > 0 && (
        <div>
          <strong className="small">What works</strong>
          <ul className="points small" style={{ paddingLeft: 20, margin: '4px 0 0' }}>
            {c.works.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {c.fixes?.length > 0 && (
        <div>
          <strong className="small">To improve (numbers match the pins on your drawing)</strong>
          <ol style={{ paddingLeft: 20, margin: '4px 0 0' }}>
            {c.fixes.map((f, i) => (
              <li key={i} className="small" style={{ marginBottom: 6 }}>
                <strong>{f.title}.</strong> {f.detail}
              </li>
            ))}
          </ol>
        </div>
      )}
      {c.process && (
        <div className="card" style={{ padding: 14, background: 'var(--paper)' }}>
          <strong className="small">Your process</strong>
          <ul className="small" style={{ paddingLeft: 20, margin: '4px 0 0' }}>
            <li>
              <strong>Construction:</strong> {c.process.construction}
            </li>
            <li>
              <strong>Layers:</strong> {c.process.organisation}
            </li>
            <li>
              <strong>Time:</strong> {c.process.time}
            </li>
            <li>
              <strong>Clip Studio tip:</strong> {c.process.workflowTip}
            </li>
          </ul>
        </div>
      )}
      <table className="data">
        <thead>
          <tr>
            <th>Criterion</th>
            <th>Critique</th>
            {self && <th>You</th>}
          </tr>
        </thead>
        <tbody>
          {criteria.map((cr) => (
            <tr key={cr.id}>
              <td>{cr.name}</td>
              <td>{c.scores?.[cr.id] ?? '–'}</td>
              {self && <td>{self[cr.id] ?? '–'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="wash" style={{ padding: 14 }}>
        <div className="kicker">Next step</div>
        <p style={{ margin: 0 }}>{c.nextStep}</p>
        {c.revisitLesson && (
          <a className="small" href={`#/lesson/${c.revisitLesson}`}>
            Revisit the lesson →
          </a>
        )}
      </div>
    </div>
  );
}

// Critique levels: cheap for practice, everything for finished pieces.
const LEVELS = [
  { id: 'quick', name: 'Quick', price: '≈2¢', text: 'The finished picture only. Short: what works, 1–2 fixes, a next step. For warm-ups and practice.' },
  { id: 'standard', name: 'Standard', price: '≈8¢', text: 'Plus the reference, up to 3 key layers (sketch, lines, colour) and correction lines drawn on your picture.' },
  { id: 'full', name: 'Full', price: '≈15–25¢', text: 'Plus up to 8 layers, a review of your process (construction, layers, time) and detailed corrections. For finished pieces.' },
];
function LevelPicker({ level, setLevel, hasClip }) {
  return (
    <div className="levels" role="radiogroup" aria-label="Critique level">
      {LEVELS.map((l) => (
        <button key={l.id} role="radio" aria-checked={level === l.id} className={`level ${level === l.id ? 'active' : ''}`} onClick={() => setLevel(l.id)}>
          <span className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{l.name}</strong>
            <span className="tiny">{l.price}</span>
          </span>
          <span className="tiny muted">{l.text}</span>
          {!hasClip && l.id !== 'quick' && <span className="tiny muted"> Upload the .clip file to include layers.</span>}
        </button>
      ))}
    </div>
  );
}

export default function Drawing({ id }) {
  const { areas, critiqueInfo, refreshProfile, toast, query } = useApp();
  const timer = useTimer();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState('side');
  const [opacity, setOpacity] = useState(0.5);
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(null);
  const [title, setTitle] = useState('');
  const [view, setView] = useState(null); // a layer shown on its own, or null for the final picture
  const [showMarks, setShowMarks] = useState(true);
  const [level, setLevel] = useState(null);
  const file = useRef(null);
  const isNew = query.get('new') === '1';

  useEffect(() => {
    api
      .drawing(id)
      .then((x) => {
        setD(x);
        setTitle(x.title ?? '');
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <p className="error">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;

  const area = areas.find((a) => a.id === (d.critique?.area ?? d.area));
  const criteria = area?.criteria ?? [];
  const pins = d.critique && !d.critique.refused ? d.critique.fixes ?? [] : [];

  const save = async (patch) => {
    const x = await api.updateDrawing(d.id, patch);
    setD(x);
    return x;
  };
  const uploadFor = async (f) => {
    if (!f) return;
    setBusy('upload');
    try {
      setD(await api.uploadFor(d.id, f));
      toast('Saved to your sketchbook');
    } catch (e) {
      toast(e.message);
    }
    setBusy(null);
  };
  const chosenLevel = level ?? (['warmup', 'drill', 'memory', 'free'].includes(d.kind) ? 'quick' : ['project', 'piece'].includes(d.kind) ? 'full' : 'standard');
  const layerShown = view && d.clip?.layers.find((l) => l.id === view);
  const marks = !layerShown && showMarks && d.critique && !d.critique.refused ? d.critique.marks ?? [] : [];
  const askCritique = async () => {
    setBusy('critique');
    try {
      setD(await api.critique(d.id, chosenLevel));
      refreshProfile();
    } catch (e) {
      toast(e.message);
    }
    setBusy(null);
  };
  const remove = async () => {
    if (!window.confirm('Delete this page from your sketchbook?')) return;
    await api.deleteDrawing(d.id);
    window.location.hash = '#/sketchbook';
  };
  const react = async (emoji) => {
    const r = await api.react(`drawing:${d.id}`, emoji);
    setD({ ...d, reactions: r });
  };

  const left = critiqueInfo ? Math.max(0, critiqueInfo.cap - critiqueInfo.spent) : 0;

  return (
    <>
      <a className="small" href={d.mine ? '#/sketchbook' : '#/sketchbook/shared'} style={{ display: 'inline-block', marginTop: 10 }}>
        ← Sketchbook
      </a>
      <section className="row" style={{ marginTop: 10, justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="kicker">
            {kindLabel(d.kind)}
            {d.lessonTitle ? ` · ${d.lessonTitle}` : ''}
            {area ? ` · ${area.name}` : ''}
          </div>
          {d.mine ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== (d.title ?? '') && save({ title })}
              placeholder="Untitled"
              style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', fontWeight: 600, border: 'none', background: 'transparent', padding: 0 }}
              aria-label="Title"
            />
          ) : (
            <h1 style={{ margin: 0 }}>{d.title ?? 'Untitled'}</h1>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            {d.user && !d.mine ? `by ${d.user.username} · ` : ''}
            {new Date(d.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            {d.lessonId && (
              <>
                {' '}
                · <a href={`#/lesson/${d.lessonId}`}>open the lesson</a>
              </>
            )}
            {d.referencePost && (
              <>
                {' '}
                · <a href={d.referencePost} target="_blank" rel="noreferrer">reference post ↗</a>
              </>
            )}
          </p>
        </div>
        {d.mine && (
          <div className="row">
            {d.file && (
              <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={d.shared} onChange={(e) => save({ shared: e.target.checked })} /> Share with friends
              </label>
            )}
            {d.file && (
              <a className="btn small ghost" href={`#/compare?a=${d.id}`}>
                Compare
              </a>
            )}
            <button className="btn small ghost" onClick={remove}>
              Delete
            </button>
          </div>
        )}
      </section>

      {d.status === 'todo' && (
        <section className="section wash">
          <h3>A study, waiting for you</h3>
          <p className="small">Download the study file, draw it in Clip Studio, then upload the result here.</p>
          <div className="row">
            {!timer.running && (
              <button className="btn primary small" onClick={() => timer.start({ minutes: 45, kind: 'study', area: d.area ?? undefined, label: d.title ?? 'Study' })}>
                ⏱ Focus 45 min
              </button>
            )}
            <a className="btn small" href={psdUrl({ drawing: d.id, layout: 'side' })}>
              .psd: side by side
            </a>
            <a className="btn small" href={psdUrl({ drawing: d.id, layout: 'under' })}>
              .psd: hidden underlay (to check)
            </a>
            <button className="btn small" onClick={() => file.current?.click()} disabled={busy === 'upload'}>
              {busy === 'upload' ? 'Uploading…' : 'Upload my drawing'}
            </button>
            <input ref={file} type="file" accept="image/*,.clip" hidden onChange={(e) => uploadFor(e.target.files?.[0])} />
          </div>
        </section>
      )}

      <section className="section">
        {d.reference && d.file && (
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="seg">
              <button className={mode === 'side' ? 'active' : ''} onClick={() => setMode('side')}>
                Side by side
              </button>
              <button className={mode === 'overlay' ? 'active' : ''} onClick={() => setMode('overlay')}>
                Overlay
              </button>
            </div>
            {mode === 'overlay' && (
              <label className="row small" style={{ gap: 8 }}>
                Reference
                <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ width: 140 }} />
              </label>
            )}
            <label className="row small" style={{ gap: 6, cursor: 'pointer' }} title="Flipping shows mistakes your eyes got used to">
              <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> Mirror check
            </label>
          </div>
        )}
        {mode === 'overlay' && d.reference && d.file ? (
          <div className="overlay-stage" style={{ maxWidth: 760, transform: flip ? 'scaleX(-1)' : undefined }}>
            <img src={d.file} alt="Your drawing" />
            <img className="over" src={d.reference} alt="Reference" style={{ opacity }} />
          </div>
        ) : (
          <div className={d.reference && d.file ? 'compare' : ''} style={!d.reference || !d.file ? { maxWidth: 760 } : undefined}>
            {d.file && (
              <figure>
                <div style={{ position: 'relative', transform: flip ? 'scaleX(-1)' : undefined, background: layerShown ? '#fff' : undefined, borderRadius: 14 }}>
                  <img src={layerShown ? layerShown.image : d.file} alt={layerShown ? `Layer: ${layerShown.name}` : 'Your drawing'} />
                  {marks.length > 0 && (
                    <svg className="marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Correction overlay">
                      <defs>
                        <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                          <path d="M0 0 L10 5 L0 10 z" fill="#e8463a" />
                        </marker>
                      </defs>
                      {marks.map((m, i) => {
                        const [a, b] = m.points;
                        if (m.kind === 'circle') {
                          const r = Math.hypot((b.x - a.x) * 100, (b.y - a.y) * 100);
                          return <ellipse key={i} cx={a.x * 100} cy={a.y * 100} rx={r} ry={r} fill="none" stroke="#e8463a" strokeWidth="0.6" vectorEffect="non-scaling-stroke" strokeDasharray="2 1"><title>{m.note}</title></ellipse>;
                        }
                        return (
                          <line key={i} x1={a.x * 100} y1={a.y * 100} x2={b.x * 100} y2={b.y * 100} stroke="#e8463a" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" markerEnd={m.kind === 'arrow' ? 'url(#arrowhead)' : undefined}>
                            <title>{m.note}</title>
                          </line>
                        );
                      })}
                    </svg>
                  )}
                  {!layerShown && pins.map((f, i) => (
                    <span key={i} className="pin" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, transform: `translate(-50%, -50%)${flip ? ' scaleX(-1)' : ''}` }} title={f.title}>
                      {i + 1}
                    </span>
                  ))}
                </div>
                <figcaption className="tiny muted row" style={{ marginTop: 4, gap: 10 }}>
                  {layerShown ? `Layer: ${layerShown.name}` : 'Your drawing'}
                  {d.critique?.marks?.length > 0 && !layerShown && (
                    <label className="row" style={{ gap: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} /> Correction lines
                    </label>
                  )}
                </figcaption>
              </figure>
            )}
            {d.reference && (
              <figure>
                <img src={d.reference} alt="Reference" style={{ transform: flip ? 'scaleX(-1)' : undefined }} />
                <figcaption className="tiny muted" style={{ marginTop: 4 }}>
                  Reference
                </figcaption>
              </figure>
            )}
          </div>
        )}
      </section>

      {d.clip && (
        <section className="section card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="kicker">Clip Studio file</div>
              <h3 style={{ margin: 0 }}>Layers</h3>
              <p className="small muted" style={{ margin: '2px 0 0' }}>
                {d.clip.layers.length} layers
                {d.clip.workMinutes ? ` · ${Math.floor(d.clip.workMinutes / 60) ? `${Math.floor(d.clip.workMinutes / 60)} h ` : ''}${d.clip.workMinutes % 60} min of work recorded by Clip Studio` : ''} · {d.clip.width} × {d.clip.height} px
              </p>
            </div>
            <div className="row">
              {view && (
                <button className="btn small" onClick={() => setView(null)}>
                  Show the final picture
                </button>
              )}
              {d.clip.hasFile && (
                <a className="btn small ghost" href={`/api/atelier/drawings/${d.id}/clip`}>
                  Download .clip
                </a>
              )}
            </div>
          </div>
          <div className="layer-list">
            {[...d.clip.layers].reverse().map((l) => (
              <button
                key={l.id}
                className={`layer-row ${view === l.id ? 'active' : ''}`}
                style={{ paddingLeft: 10 + l.depth * 18 }}
                disabled={!l.image}
                onClick={() => setView(view === l.id ? null : l.id)}
                title={l.image ? 'Show this layer on its own' : 'No image for this layer'}
              >
                <span className="layer-thumb">{l.image ? <img src={l.image} alt="" loading="lazy" /> : <span aria-hidden="true">{l.kind === 'folder' ? '📁' : '·'}</span>}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <strong style={{ fontWeight: 600 }}>{l.name}</strong>
                  <span className="tiny muted">
                    {' '}
                    · {l.kind}
                    {l.blend !== 'Normal' ? ` · ${l.blend}` : ''}
                    {l.clipped ? ' · clipped' : ''}
                    {l.opacity < 100 ? ` · ${l.opacity}%` : ''}
                    {!l.visible ? ' · hidden' : ''}
                    {l.draft ? ' · draft' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: '8px 0 0' }}>
            Top of the stack first. Click a layer to see it alone: a quick way to check your construction under the line art. Vector layers show in the list without an image for now.
          </p>
        </section>
      )}

      {d.file && d.mine && (
        <section className="section grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="kicker">Step 1</div>
            <h3>Rate yourself first</h3>
            {isNew && !d.selfScores && <p className="small">Saved! Before any feedback, look at it with fresh eyes and rate it. Judging your own work is a skill too, and it improves with practice.</p>}
            {!area && (
              <label className="field" style={{ marginBottom: 12 }}>
                What did you practise?
                <select value="" onChange={(e) => save({ area: e.target.value })}>
                  <option value="" disabled>
                    Choose an area…
                  </option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {criteria.length > 0 && <Rubric criteria={criteria} value={d.selfScores} onSave={(selfScores) => save({ selfScores })} />}
          </div>
          <div className="card">
            <div className="kicker">Step 2</div>
            <h3>Critique</h3>
            {d.critique ? (
              <CritiqueView c={d.critique} criteria={criteria} self={d.selfScores} />
            ) : !critiqueInfo?.available ? (
              <p className="small muted">Critiques need an Anthropic API key on the server. Until then: use the overlay and the mirror check, and compare with the lesson’s key points.</p>
            ) : (
              <>
                <p className="small">Claude looks at your drawing{d.reference ? ' and the reference' : ''}{d.clip ? ' and your layers' : ''} with this lesson’s goals: what works, the fixes that matter most, and one next step.</p>
                <LevelPicker level={chosenLevel} setLevel={setLevel} hasClip={!!d.clip} />
                <p className="tiny muted">${left.toFixed(2)} left this month</p>
                <button className="btn primary small" onClick={askCritique} disabled={busy === 'critique' || left <= 0}>
                  {busy === 'critique' ? (chosenLevel === 'full' ? 'Looking at everything… (up to two minutes)' : 'Looking closely… (up to a minute)') : `Get a ${chosenLevel} critique`}
                </button>
              </>
            )}
            {d.critique && critiqueInfo?.available && left > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className="tiny muted" style={{ margin: '0 0 6px' }}>
                  This was a {d.critique.level ?? 'standard'} critique{d.critique.layersSeen?.length ? ` (layers seen: ${d.critique.layersSeen.join(', ')})` : ''}. Ask again after changes:
                </p>
                <LevelPicker level={chosenLevel} setLevel={setLevel} hasClip={!!d.clip} />
                <button className="btn small" onClick={askCritique} disabled={busy === 'critique'}>
                  {busy === 'critique' ? 'Looking again…' : `New ${chosenLevel} critique`}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {d.shared && d.reactions && (
        <section className="section row" style={{ gap: 6 }}>
          {EMOJIS.map((e) => (
            <button key={e} className={`btn small ${d.reactions[e]?.mine ? 'primary' : ''}`} onClick={() => react(e)} disabled={d.mine}>
              {e} {d.reactions[e]?.count || ''}
            </button>
          ))}
        </section>
      )}
    </>
  );
}
