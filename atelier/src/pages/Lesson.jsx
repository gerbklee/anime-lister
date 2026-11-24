import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import Exercise from '../components/Exercise.jsx';
import Guide from '../components/Guide.jsx';
import Media from '../components/Media.jsx';

// Retrieval before new material: try to remember the last lesson first.
function Recall({ prevId }) {
  const [prev, setPrev] = useState(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    api.lesson(prevId).then(setPrev).catch(() => {});
  }, [prevId]);
  if (!prev?.done) return null;
  return (
    <div className="wash" style={{ marginBottom: 22 }}>
      <div className="kicker">Warm up your memory</div>
      <p style={{ margin: '4px 0 10px' }}>
        Before you read on: what were the key points of <strong>{prev.lesson.title}</strong>? Say or jot down two, then check.
      </p>
      {shown ? (
        <ul className="points small" style={{ margin: 0 }}>
          {prev.lesson.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <button className="btn small" onClick={() => setShown(true)}>
          Show them
        </button>
      )}
    </div>
  );
}

export default function Lesson({ id }) {
  const { toast, bump } = useApp();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = () =>
    api
      .lesson(id)
      .then(setData)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load().then(() => api.lessonAction(id, 'read').catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { lesson, stage, unit, area, drawings } = data;
  const adultLevel = !lesson.unit ? 0 : ['A1', 'A7'].includes(lesson.unit) ? 2 : 1;
  const doneEx = new Set(drawings.filter((d) => d.status === 'done').map((d) => d.exerciseId));

  const toggleDone = async () => {
    await api.lessonAction(id, data.done ? 'undo' : 'done');
    if (!data.done) toast('Lesson finished – its skills come back for review tomorrow 🪨');
    bump();
    load();
  };

  return (
    <article className="lesson-body" style={{ marginTop: 10 }}>
      <a className="small" href="#/path">
        ← The path
      </a>
      <div className="kicker" style={{ marginTop: 14 }}>
        {stage ? `Stage ${stage.id} · ${stage.title}` : unit ? `Adult track · ${unit.id} ${unit.title}` : ''}
        {area ? ` · ${area.name}` : ''}
      </div>
      <h1>{lesson.title}</h1>
      <p className="row small muted" style={{ gap: 8 }}>
        <span className="chip">{lesson.minutes} min</span>
        <span className="chip">
          {lesson.exercises.length} {lesson.exercises.length === 1 ? 'exercise' : 'exercises'}
        </span>
        {data.done && <span className="chip sage">✓ finished</span>}
      </p>

      {data.locked && (
        <div className="wash" style={{ marginBottom: 18 }}>
          <strong>A look ahead.</strong> You can read everything here; the exercises open when you reach this lesson. Opening it early doesn’t start it.
        </div>
      )}

      {data.prev && <Recall prevId={data.prev} />}

      <p style={{ fontSize: '1.12rem', fontFamily: 'var(--serif)' }}>{lesson.why}</p>

      <div className="theory">
        {[...lesson.theory, ...(lesson.more ?? [])].map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>

      {lesson.method?.length > 0 && (
        <div className="card section">
          <h3>Step by step</h3>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {lesson.method.map((m) => (
              <li key={m} style={{ marginBottom: 6 }}>
                {m}
              </li>
            ))}
          </ol>
        </div>
      )}

      <Media lessonId={lesson.id} />

      <div className="grid-2 section" style={{ marginTop: 22 }}>
        <div className="card">
          <h3>Key points</h3>
          <ul className="points" style={{ paddingLeft: 20, margin: 0 }}>
            {lesson.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        {lesson.mistakes?.length > 0 && (
          <div className="card">
            <h3>Common mistakes</h3>
            <ul className="mistakes" style={{ paddingLeft: 20, margin: 0 }}>
              {lesson.mistakes.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {lesson.csp && (
        <div className="csp-box section">
          <div className="kicker" style={{ color: 'var(--blue)' }}>
            In Clip Studio
          </div>
          <h3>{lesson.csp.title}</h3>
          <ol style={{ paddingLeft: 20, margin: '0 0 8px' }}>
            {lesson.csp.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a className="small" href={lesson.csp.url} target="_blank" rel="noreferrer">
            Clip Studio tutorials on this ↗
          </a>
        </div>
      )}

      {data.guides?.length > 0 && (
        <section className="section">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Clip Studio for this lesson</h3>
            <a className="small" href="#/clip-studio">
              The whole handbook
            </a>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.guides.map((g) => (
              <Guide key={g.id} g={g} />
            ))}
          </div>
        </section>
      )}

      {lesson.watch?.length > 0 && (
        <section className="section">
          <h3>Watch & read</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {lesson.watch.map((w) => (
              <a key={w.url} className="lesson-row" href={w.url} target="_blank" rel="noreferrer">
                <span style={{ fontSize: 18 }}>{w.url.includes('youtube') ? '▶' : '📖'}</span>
                <span style={{ flex: 1 }}>
                  <strong style={{ fontWeight: 600 }}>{w.by}</strong> · {w.title}
                  {w.note && <span className="tiny muted"> · {w.note}</span>}
                </span>
                <span className="muted">↗</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Exercises</h2>
        <p className="small muted">Start a focus block for each one. Upload what you draw (photo or export), even when it’s rough: your sketchbook is how you’ll see your progress.</p>
        {lesson.exercises.map((ex) => (
          <Exercise key={ex.id} lessonId={lesson.id} exercise={ex} area={lesson.area} adultLevel={adultLevel} done={doneEx.has(ex.id)} progress={data.progress?.exercises.find((x) => x.id === ex.id)} locked={data.locked} onDone={() => load()} />
        ))}
      </section>

      {drawings.some((d) => d.file) && (
        <section className="section">
          <h3>Your drawings for this lesson</h3>
          <div className="book">
            {drawings
              .filter((d) => d.file)
              .map((d) => (
                <a key={d.id} className="page-tile" href={`#/drawing/${d.id}`}>
                  <img src={d.file} alt={d.title ?? ''} loading="lazy" />
                  <div className="meta">{d.exerciseTitle ?? d.title}</div>
                </a>
              ))}
          </div>
        </section>
      )}

      <section className="section card">
        {(() => {
          const p = data.progress;
          const sp = data.stageProgress;
          return (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <strong>{data.done ? "Finished." : data.locked ? "A later lesson" : p?.ready ? "Ready to finish." : "Practice to finish this lesson"}</strong>
                  <p className="small muted" style={{ margin: '2px 0 10px' }}>
                    {data.done
                      ? 'Its skills come back as spaced reviews.'
                      : `Each exercise needs its sessions on different days: ${p?.sessionsDone ?? 0} of ${p?.sessionsNeeded ?? 0} done. Finishing adds a stepping stone and schedules reviews.`}
                  </p>
                  {p && !data.done && (
                    <div className="meter" style={{ maxWidth: 420 }} aria-label="Sessions done">
                      <span style={{ width: `${(p.sessionsDone / Math.max(1, p.sessionsNeeded)) * 100}%` }} />
                    </div>
                  )}
                  {sp && (
                    <p className="tiny muted" style={{ margin: '10px 0 0' }}>
                      Stage {sp.id}: {sp.lessonsDone} of {sp.lessons} lessons, {Math.round((sp.minutes / 60) * 10) / 10} of {sp.hours} practice hours. The next stage opens when both are complete.
                    </p>
                  )}
                </div>
                <div className="row">
                  {data.prev && (
                    <a className="btn small ghost" href={`#/lesson/${data.prev}`}>
                      ← Previous
                    </a>
                  )}
                  {(data.done || (p?.ready && !data.locked)) && (
                    <button className={`btn small ${data.done ? '' : 'primary'}`} onClick={toggleDone}>
                      {data.done ? 'Mark as not finished' : 'Finish lesson'}
                    </button>
                  )}
                  {data.next && (
                    <a className="btn small" href={`#/lesson/${data.next}`}>
                      Next →
                    </a>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </section>
    </article>
  );
}
