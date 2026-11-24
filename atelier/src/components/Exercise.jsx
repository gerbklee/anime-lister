import { useEffect, useRef, useState } from 'react';
import { api, cached, findReferences, psdUrl, refSource } from '../api.js';
import { useTimer } from './Timer.jsx';
import { DIAGRAMS, diagramFor, stepSearch } from './Diagrams.jsx';

const KIND = {
  drill: 'Drill',
  study: 'Study',
  memory: 'From memory',
  project: 'Project',
  check: 'Skill check',
  warmup: 'Warm-up',
  review: 'Review',
  free: 'Free drawing',
  piece: 'Finished piece',
  portfolio: 'Portfolio review',
};
export const kindLabel = (k) => KIND[k] ?? k;

// Fills "$character" with one of your characters (a different one each time).
async function resolveTags(tags) {
  if (!tags?.includes('$character')) return tags ?? [];
  const { characters } = await cached('characters', () => api.characters()).catch(() => ({ characters: [] }));
  const pick = characters.length ? characters[Math.floor(Math.random() * characters.length)] : null;
  return tags.map((t) => (t === '$character' ? pick?.tag : t)).filter(Boolean);
}

// Full-screen timed practice: one reference after another.
export function Practice({ refs, seconds, count, area, onClose }) {
  const list = refs.slice(0, count ?? refs.length);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [paused, setPaused] = useState(false);
  const started = useRef(Date.now());
  const logged = useRef(false);
  const close = () => {
    const minutes = Math.round((Date.now() - started.current) / 60000);
    if (!logged.current && minutes >= 1) {
      logged.current = true;
      api.logBlock({ minutes, kind: 'practice', area: area ?? 'gesture', poses: i + 1 }).catch(() => {});
    }
    onClose(minutes);
  };
  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [paused]);
  useEffect(() => {
    if (left > 0) return;
    if (i + 1 >= list.length) close();
    else {
      setI(i + 1);
      setLeft(seconds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === ' ') setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const cur = list[i];
  return (
    <div className="practice">
      <div style={{ display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 12 }}>{cur && <img src={cur.preview} alt="" />}</div>
      <div className="practice-bar">
        <strong style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', fontVariantNumeric: 'tabular-nums' }}>{left}s</strong>
        <span>
          {i + 1} / {list.length}
        </span>
        <div className="spacer" />
        <button className="btn small" onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          className="btn small"
          onClick={() => {
            if (i + 1 < list.length) {
              setI(i + 1);
              setLeft(seconds);
            } else close();
          }}
        >
          Next
        </button>
        <button className="btn small" onClick={close}>
          End
        </button>
      </div>
    </div>
  );
}

// One exercise: prompt, focus timer, references (+ .psd and practice), upload.
export default function Exercise({ lessonId, exercise, area, kind, adultLevel = 0, done, progress, extraInfo, onDone, compact, compactDetails, locked }) {
  const [howOpen, setHowOpen] = useState(!compact && !compactDetails);
  const timer = useTimer();
  const [refs, setRefs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const [practice, setPractice] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const k = kind ?? exercise.kind;

  const loadRefs = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const tags = await resolveTags(exercise.refs?.tags);
      const items = await findReferences(tags, { limit: exercise.practice ? Math.max(12, exercise.practice.count ?? 12) : 12, maxLevel: adultLevel });
      setRefs(items);
      setSel(0);
      if (!items.length) setMsg('No references found right now. Try again, or use your own.');
    } catch {
      setMsg('Couldn’t load references.');
    }
    setLoading(false);
  };

  const chosen = refs?.[sel] ?? null;

  const upload = async (f) => {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await api.upload(f, {
        lessonId,
        exerciseId: exercise.id,
        kind: k,
        area,
        referenceUrl: chosen ? refSource(chosen) : undefined,
        referencePost: chosen?.postUrl,
        ...extraInfo,
      });
      onDone?.(d);
      window.location.hash = `#/drawing/${d.id}?new=1`;
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };

  const paper = async () => {
    setBusy(true);
    try {
      if (lessonId) await api.exerciseDone(lessonId, exercise.id);
      onDone?.(null);
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="exercise">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="row" style={{ gap: 6, marginBottom: 4 }}>
            <span className={`chip ${k === 'memory' ? 'accent' : k === 'study' ? 'sage' : ''}`}>{kindLabel(k)}</span>
            <span className="chip">{exercise.minutes} min</span>
            {progress ? (
              <span className={`chip ${progress.done >= progress.need ? "sage" : ""}`} title="Sessions on different days">
                {progress.done >= progress.need ? "✓ " : ""}
                {progress.done}/{progress.need} sessions
              </span>
            ) : (
              done && <span className="chip sage">✓ done</span>
            )}
          </div>
          <h3 style={{ marginTop: 6 }}>{exercise.title}</h3>
          <p style={{ marginBottom: 6 }}>{exercise.prompt}</p>
          {exercise.refs?.note && <p className="small muted">{exercise.refs.note}</p>}
          {k === 'memory' && <p className="small muted">No looking. Drawing from memory is what makes it stick; compare with the reference only afterwards.</p>}
          {(k === 'study' || k === 'review') && (
            <ol className="steps" aria-label="How to do a study">
              <li>Observe 2 min: big shapes, angles</li>
              <li>Draw freehand, no tracing</li>
              <li>Check: flip, zoom out, overlay</li>
              <li>Fix the biggest error</li>
              <li>Upload & rate yourself</li>
            </ol>
          )}
          {exercise.steps?.length > 0 && (
            <div className="how">
              <button className="link-btn small" onClick={() => setHowOpen(!howOpen)} aria-expanded={howOpen}>
                {howOpen ? "Hide the details" : "How to do it, with an example"}
              </button>
              {howOpen && (
                <div className="how-body">
                  <strong className="small">Step by step</strong>
                  <ol className="step-list">
                    {(() => {
                      // Each step gets a diagram (once per exercise) or a picture search.
                      const used = new Set();
                      return exercise.steps.map((s) => {
                        let id = diagramFor(s);
                        if (id && used.has(id)) id = null;
                        if (id) used.add(id);
                        return (
                          <li key={s}>
                            <span>{s}</span>
                            {id ? (
                              <span className="step-visual">{DIAGRAMS[id]}</span>
                            ) : (
                              <a className="step-search" href={stepSearch(s, exercise)} target="_blank" rel="noreferrer" title="Example pictures for this step">
                                🔍 examples
                              </a>
                            )}
                          </li>
                        );
                      });
                    })()}
                  </ol>
                  <strong className="small">You’ve got it when</strong>
                  <ul className="points">
                    {exercise.success.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <div className="example">
                    <div className="kicker">Example</div>
                    <p style={{ margin: "2px 0 0" }}>{exercise.example}</p>
                    {exercise.exampleUrl && (
                      <a className="small" href={exercise.exampleUrl} target="_blank" rel="noreferrer">
                        See example pictures ↗
                      </a>
                    )}
                  </div>
                  {exercise.sessions > 1 && (
                    <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                      Do this on {exercise.sessions} different days. Spreading the repetitions out is what makes the skill stick; Today brings it back.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {locked ? (
        <p className="tiny muted" style={{ margin: "10px 0 0" }}>
          🔒 Practice opens when you reach this lesson. Lessons go in order, so each one builds on the last.
        </p>
      ) : (
      <div className="row" style={{ marginTop: 8 }}>
        {!timer.running && (
          <button className="btn primary small" onClick={() => timer.start({ minutes: Math.max(5, exercise.minutes), kind: k, lessonId, area, label: exercise.title }).catch((e) => setMsg(e.message))}>
            ⏱ Focus {Math.max(5, exercise.minutes)} min
          </button>
        )}
        {exercise.refs && (
          <button className="btn small" onClick={loadRefs} disabled={loading}>
            {loading ? 'Finding references…' : refs ? 'Other references' : 'Find references'}
          </button>
        )}
        <button className="btn small" onClick={() => file.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Upload (.clip, .png, .jpg)'}
        </button>
        {!compact && lessonId && (progress ? progress.done < progress.need : !done) && (
          <button className="btn small ghost" onClick={paper} disabled={busy}>
            Done on paper
          </button>
        )}
        <input ref={file} type="file" accept="image/*,.clip" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      )}
      {msg && <p className="small error">{msg}</p>}
      {refs?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="refs">
            {refs.map((r, i) => (
              <button key={r.key} className={i === sel ? 'active' : ''} onClick={() => setSel(i)} aria-label={`Reference ${i + 1}`}>
                <img src={r.thumb} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          {chosen && (
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <img src={chosen.preview} alt="Chosen reference" style={{ width: '100%', borderRadius: 14, background: 'var(--paper-2)' }} />
              <div>
                <p className="small">
                  {chosen.artist ? (
                    <>
                      By <strong>{chosen.artist.replace(/_/g, ' ')}</strong> ·{' '}
                    </>
                  ) : null}
                  {chosen.postUrl && (
                    <a href={chosen.postUrl} target="_blank" rel="noreferrer">
                      original post
                    </a>
                  )}
                </p>
                <p className="small muted">Uploading now attaches this reference, so you can compare and overlay afterwards.</p>
                {exercise.psd !== false && (
                  <div className="row" style={{ gap: 6 }}>
                    <a className="btn small" href={psdUrl({ ref: refSource(chosen), layout: 'side', title: exercise.title })}>
                      .psd: side by side
                    </a>
                    <a className="btn small" href={psdUrl({ ref: refSource(chosen), layout: 'under', title: exercise.title })}>
                      .psd: hidden underlay (to check)
                    </a>
                  </div>
                )}
                {exercise.practice && (
                  <button className="btn small accent" style={{ marginTop: 8 }} onClick={() => setPractice(true)}>
                    ▶ Practice: {exercise.practice.count ?? refs.length} × {exercise.practice.seconds}s
                  </button>
                )}
                <p className="tiny muted" style={{ marginTop: 8 }}>
                  In Clip Studio: open the .psd, draw freehand on “Sketch”, then “Lines”. In the underlay file the reference is hidden: show it only to check.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {practice && refs && <Practice refs={refs} seconds={exercise.practice.seconds} count={exercise.practice.count} area={area} onClose={() => setPractice(false)} />}
    </div>
  );
}
