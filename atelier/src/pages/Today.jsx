import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import Exercise, { kindLabel } from '../components/Exercise.jsx';
import FreeTime from '../components/FreeTime.jsx';

const doneKey = (day) => `atelier.done.${day}`;
const loadDone = (day) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey(day))) ?? []);
  } catch {
    return new Set();
  }
};

function Review({ part, onRated }) {
  const [sent, setSent] = useState(null);
  const rate = async (r) => {
    const out = await api.rateReview(part.skill, r);
    setSent(Math.round(out.interval));
    onRated();
  };
  return (
    <div className="card" style={{ marginTop: 10, padding: 16 }}>
      {sent == null ? (
        <>
          <strong className="small">After drawing: how did it go?</strong>
          <p className="tiny muted" style={{ margin: '2px 0 8px' }}>
            Honest answers schedule it best: hard ones come back tomorrow, easy ones much later.
          </p>
          <div className="row" style={{ gap: 6 }}>
            {[
              [1, 'Couldn’t do it'],
              [2, 'Hard'],
              [3, 'OK'],
              [4, 'Good'],
              [5, 'Easy'],
            ].map(([r, l]) => (
              <button key={r} className="btn small" onClick={() => rate(r)}>
                {l}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="small" style={{ margin: 0 }}>
          ✓ Back in {sent} {sent === 1 ? 'day' : 'days'}.
        </p>
      )}
    </div>
  );
}

export default function Today() {
  const { profile, version, toast } = useApp();
  const [data, setData] = useState(null);
  const [done, setDone] = useState(new Set());
  const [open, setOpen] = useState(null);

  const load = () =>
    api.today().then((d) => {
      setData(d);
      setDone(loadDone(d.day));
    });
  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const mark = (id, on = true) => {
    const next = new Set(done);
    if (on) next.add(id);
    else next.delete(id);
    setDone(next);
    try {
      localStorage.setItem(doneKey(data.day), JSON.stringify([...next]));
    } catch {
      // ignore
    }
  };

  if (!data) return <p className="muted">Loading today’s session…</p>;
  const parts = data.parts;
  const total = parts.reduce((s, p) => s + p.minutes, 0);
  const planned = parts.filter((p) => !p.open);
  const doneCount = planned.filter((p) => done.has(p.id)).length;
  const firstOpen = parts.find((p) => !done.has(p.id))?.id;
  const current = open ?? firstOpen;

  const finishLesson = async (p) => {
    await api.lessonAction(p.lessonId, 'done');
    mark(p.id);
    toast('Lesson finished – a stepping stone for your river 🪨');
    load();
  };

  return (
    <>
      <section style={{ marginTop: 10 }}>
        <div className="kicker">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>Today’s session</h1>
        <p className="muted">
          About {total} minutes + free time · {doneCount} of {planned.length} done · {data.minutesToday} minutes drawn today
        </p>
        {profile?.planWhen ? (
          <p className="small">
            Your plan: <em>“{profile.planWhen}{profile.planWhere ? `, ${profile.planWhere}` : ''}, I draw.”</em>
          </p>
        ) : (
          <p className="small muted">
            Tip: people who decide <em>when and where</em> they’ll practise follow through far more often. <a href="#/settings">Set your plan</a>.
          </p>
        )}
      </section>

      {data.focus && (
        <section className="focus-card section" style={{ marginTop: 18 }}>
          <span style={{ fontSize: 26 }} aria-hidden="true">
            🎯
          </span>
          <div>
            <div className="kicker">Today’s one thing</div>
            <p style={{ margin: '2px 0 4px', fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>{data.focus.text}</p>
            <p className="tiny muted" style={{ margin: 0 }}>
              {data.focus.from === 'critique' ? 'From your last critique. ' : data.focus.from === 'self' ? 'Your lowest self-rating lately. ' : 'A key point of your current lesson. '}
              Keep it in mind in every exercise today: practice works best aimed at one thing.
              {data.weakSpot && ` Weak spot lately: ${data.weakSpot.name} (average ${data.weakSpot.avg} over ${data.weakSpot.drawings} drawings), so today leans that way.`}
              {data.focus.drawingId && (
                <>
                  {' '}
                  <a href={`#/drawing/${data.focus.drawingId}`}>See the drawing</a>
                </>
              )}
            </p>
          </div>
        </section>
      )}

      {data.stageInfo && (
        <section className="card section" style={{ padding: "14px 20px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong className="small">
              Stage {data.stageInfo.id}: {data.stageInfo.lessonsDone} of {data.stageInfo.lessons} lessons · {Math.round((data.stageInfo.minutes / 60) * 10) / 10} of {data.stageInfo.hours} practice hours
            </strong>
            <a className="small" href="#/path">
              The path
            </a>
          </div>
          <div className="meter" style={{ marginTop: 8 }}>
            <span style={{ width: `${Math.min(100, (data.stageInfo.minutes / 60 / data.stageInfo.hours) * 100)}%` }} />
          </div>
          {!data.lessonId && (
            <p className="tiny muted" style={{ margin: "8px 0 0" }}>
              All lessons of this stage are finished. Now the hours build the skill: today mixes exercises from the whole stage. The next stage opens at {data.stageInfo.hours} hours.
            </p>
          )}
        </section>
      )}

      <section className="section" style={{ display: 'grid', gap: 10 }}>
        {parts.map((p, i) => {
          const isDone = done.has(p.id);
          const isOpen = current === p.id;
          return (
            <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden', opacity: isDone && !isOpen ? 0.7 : 1 }}>
              <button
                onClick={() => setOpen(isOpen ? '__none' : p.id)}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center', padding: '16px 20px', width: '100%', boxSizing: 'border-box' }}
                aria-expanded={isOpen}
              >
                <span
                  style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', fontWeight: 700, fontSize: 13, background: isDone ? 'var(--sage)' : 'var(--paper-2)', color: isDone ? '#fff' : 'var(--ink-2)' }}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span style={{ flex: 1 }}>
                  <span className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {p.kind === 'lesson' ? 'Read' : p.kind === 'finish' ? 'Wrap up' : kindLabel(p.kind)}
                  </span>
                  <br />
                  <strong>{p.title}</strong>
                  {(p.practiceOf || p.sessions > 1) && (
                    <span className="tiny muted">
                      {" "}
                      · {p.practiceOf ? `practice from “${p.practiceOf}”` : ""}
                      {p.practiceOf && p.sessions > 1 ? " · " : ""}
                      {p.sessions > 1 ? `session ${p.session} of ${p.sessions}` : ""}
                    </span>
                  )}
                </span>
                <span className={`chip ${p.open ? 'sage' : ''}`}>{p.open ? 'no limit' : `${p.minutes} min`}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 20px 20px' }}>
                  {p.lessonLink && p.kind !== 'lesson' && (
                    <a className="lesson-link small" href={`#/lesson/${p.lessonLink}`}>
                      📖 Lesson: {p.lessonTitle} →
                    </a>
                  )}
                  {p.kind === 'check' && (
                    <>
                      <p>
                        {p.prompt} {p.round === 1 ? 'This first one is your “before” picture: every later check is compared with it.' : 'It’s been four weeks: time to see how far you’ve come.'}
                      </p>
                      <a className="btn primary small" href="#/check">
                        Start skill check #{p.round}
                      </a>
                    </>
                  )}
                  {p.kind === 'lesson' && (
                    <>
                      <p>{p.prompt}</p>
                      <a className="btn primary small" href={`#/lesson/${p.lessonId}`} onClick={() => mark(p.id)}>
                        Read the lesson
                      </a>
                    </>
                  )}
                  {p.kind === 'finish' && (
                    <>
                      <p>{p.prompt}</p>
                      <button className="btn primary small" onClick={() => finishLesson(p)}>
                        Mark the lesson finished
                      </button>
                    </>
                  )}
                  {p.kind === 'portfolio' && (
                    <>
                      <p>{p.prompt}</p>
                      <a className="btn primary small" href="#/portfolio">
                        Start the review
                      </a>
                    </>
                  )}
                  {p.open && (
                    <>
                      <p>{p.prompt}</p>
                      <FreeTime />
                    </>
                  )}
                  {!p.open && !['check', 'lesson', 'finish', 'portfolio'].includes(p.kind) && (
                    <>
                      <Exercise
                        compact={p.kind === 'warmup' || p.kind === 'free'}
                        lessonId={p.kind === 'warmup' || p.kind === 'free' ? undefined : p.lessonId}
                        area={p.area}
                        kind={p.kind}
                        adultLevel={0}
                        exercise={{ id: p.exerciseId ?? p.id, title: p.title, prompt: p.prompt, minutes: p.minutes, refs: p.refs, practice: p.practice, psd: p.psd, steps: p.steps, success: p.success, example: p.example, exampleUrl: p.exampleUrl, sessions: p.sessions }}
                        compactDetails
                        onDone={() => {
                          mark(p.id);
                          if (p.kind !== 'review') load();
                        }}
                      />
                      {p.kind === 'review' && <Review part={p} onRated={() => mark(p.id)} />}
                      <div className="row" style={{ marginTop: 10 }}>
                        <div className="spacer" />
                        <button
                          className="link-btn small"
                          onClick={async () => {
                            // Marking a lesson exercise as done counts as a session (on paper).
                            if (!isDone && p.lessonId && p.exerciseId && p.kind !== 'review') await api.exerciseDone(p.lessonId, p.exerciseId).catch(() => {});
                            mark(p.id, !isDone);
                          }}
                        >
                          {isDone ? 'Not done yet' : 'Mark as done'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {doneCount === planned.length && planned.length > 0 && (
        <section className="section wash center">
          <h2>Session complete.</h2>
          <p>That’s today’s practice done. Small, steady sessions are exactly what builds skill. Free drawing and your projects are open as long as you like.</p>
          <a className="btn small" href="#/progress">
            Look at your progress
          </a>
        </section>
      )}
    </>
  );
}
