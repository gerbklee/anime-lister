import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TreeIcon, TREE_INFO } from '../components/Tree.jsx';

function LessonRow({ l, current, areaName }) {
  return (
    <a href={`#/lesson/${l.id}`} className={`lesson-row ${l.done ? 'done' : ''} ${current ? 'current' : ''}`}>
      <span className="lesson-dot" />
      <span style={{ flex: 1 }}>
        <strong style={{ fontWeight: 600 }}>{l.title}</strong>
        <span className="tiny muted">
          {' '}
          {areaName[l.area] ? ` · ${areaName[l.area]}` : ''} · {l.exercises} {l.exercises === 1 ? "exercise" : "exercises"}{l.sessions?.need ? ` · ${l.sessions.done}/${l.sessions.need} sessions` : ""}
        </span>
      </span>
      {current && <span className="chip accent">Up next</span>}
      {!current && l.read && !l.done && <span className="chip">started</span>}
    </a>
  );
}

export default function PathPage() {
  const [data, setData] = useState(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    api.path().then(setData).catch(() => {});
  }, []);
  if (!data) return <p className="muted">Loading the path…</p>;
  const areaName = Object.fromEntries(data.areas.map((a) => [a.id, a.name]));

  return (
    <>
      <section style={{ marginTop: 10, marginBottom: 26 }}>
        <div className="kicker">From first line to professional</div>
        <h1>The path</h1>
        <p className="muted" style={{ maxWidth: 680 }}>
          Eleven stages, about 1,200 hours of practice: two to four years at an hour or two a day. Each stage has its own tree for your valley and a building when you finish it. A stage opens when the one before is complete: every lesson practised on enough days, and the stage’s practice hours put in. Finished lessons come back as short reviews, spaced out so they stick.
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <a className="btn small" href="#/method">
            How Atelier teaches
          </a>
          <a className="btn small" href="#/clip-studio">
            Clip Studio handbook
          </a>
        </div>
      </section>

      {data.stages.map((s) => {
        const done = s.lessons.length > 0 && s.lessons.every((l) => l.done);
        const current = s.id === data.currentStage;
        const future = s.id > data.currentStage;
        const count = s.lessons.filter((l) => l.done).length;
        return (
          <section key={s.id} className={`stage ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
            <div className="stage-badge">{done ? '✓' : s.id}</div>
            <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <h2 style={{ marginBottom: 2 }}>{s.title}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {s.subtitle}
                </p>
                <p className="small" style={{ margin: '6px 0 0' }}>
                  {s.goal}
                </p>
                {s.progress && (
                  <div style={{ marginTop: 10, maxWidth: 460 }}>
                    <div className="meter">
                      <span style={{ width: `${Math.min(100, (s.progress.minutes / 60 / s.hours) * 100)}%` }} />
                    </div>
                    <span className="tiny muted">
                      {Math.round((s.progress.minutes / 60) * 10) / 10} of {s.hours} practice hours · {s.progress.lessonsDone} of {s.progress.lessons} lessons · about {s.months[0]}–{s.months[1]} months in
                    </span>
                  </div>
                )}
              </div>
              <div className="row small muted" style={{ gap: 6 }}>
                <TreeIcon type={s.tree} size={40} />
                <span>
                  {TREE_INFO[s.tree]?.name}s · {s.building.name}
                  <br />
                  {count}/{s.lessons.length} lessons
                </span>
              </div>
            </div>
            {(!future || showAll) && (
              <div className="lesson-list">
                {s.lessons.map((l) => (
                  <LessonRow key={l.id} l={l} current={l.id === data.currentLesson} areaName={areaName} />
                ))}
              </div>
            )}
            {future && !showAll && s.id === data.currentStage + 1 && (
              <button className="link-btn small" style={{ marginTop: 10 }} onClick={() => setShowAll(true)}>
                Peek at the lessons ahead
              </button>
            )}
          </section>
        );
      })}

      {data.adult && (
        <section className="section">
          <div className="card" style={{ borderColor: 'var(--accent)' }}>
            <div className="kicker">Adult track · 18+</div>
            <h2>Figure, pin-up and nude illustration</h2>
            <p className="muted small">
              Life drawing, sensual poses and nude illustration of adult characters. Each unit opens when you reach the main stage it builds on. References come from your adults-only Art settings.
            </p>
            {data.adult.map((u) => (
              <div key={u.id} style={{ marginTop: 16, opacity: u.open ? 1 : 0.55 }}>
                <h3 style={{ marginBottom: 2 }}>
                  {u.id}: {u.title}
                </h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {u.subtitle} {!u.open && `· opens with Stage ${u.opensWith}`}
                </p>
                {u.open && (
                  <div className="lesson-list">
                    {u.lessons.map((l) => (
                      <LessonRow key={l.id} l={l} areaName={areaName} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {!data.adult && data.adultAllowed && (
        <p className="small muted section">
          There’s an optional adult track (figure, pin-up, nude illustration) you can turn on in <a href="#/settings">Settings</a>.
        </p>
      )}
    </>
  );
}
