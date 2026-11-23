import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import Exercise from '../components/Exercise.jsx';

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
  const allDone = lesson.exercises.every((e) => doneEx.has(e.id));

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

      {data.prev && <Recall prevId={data.prev} />}

      <p style={{ fontSize: '1.12rem', fontFamily: 'var(--serif)' }}>{lesson.why}</p>

      <div className="theory">
        {lesson.theory.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>

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
          <Exercise key={ex.id} lessonId={lesson.id} exercise={ex} area={lesson.area} adultLevel={adultLevel} done={doneEx.has(ex.id)} onDone={() => load()} />
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

      <section className="section card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{data.done ? 'Finished.' : allDone ? 'All exercises done.' : 'Done with this lesson?'}</strong>
          <p className="small muted" style={{ margin: 0 }}>
            Finishing adds a stepping stone and schedules spaced reviews of its skills.
          </p>
        </div>
        <div className="row">
          {data.prev && (
            <a className="btn small ghost" href={`#/lesson/${data.prev}`}>
              ← Previous
            </a>
          )}
          <button className={`btn small ${data.done ? '' : 'primary'}`} onClick={toggleDone}>
            {data.done ? 'Mark as not finished' : 'Finish lesson'}
          </button>
          {data.next && (
            <a className="btn small" href={`#/lesson/${data.next}`}>
              Next →
            </a>
          )}
        </div>
      </section>
    </article>
  );
}
