import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Heatmap, HourBars, Radar, Rings, Trends, WeekBars } from '../components/Charts.jsx';

const hours = (m) => (m >= 60 ? `${Math.round(m / 6) / 10} h` : `${m} min`);

// Then & now: the same skill-check prompt, first round vs latest, with a slider.
function ThenNow({ checks }) {
  const prompts = checks.status.prompts;
  const [pid, setPid] = useState(prompts[1]?.id ?? prompts[0]?.id);
  const [pos, setPos] = useState(50);
  const rounds = checks.rounds.filter((r) => r.drawings[pid]);
  if (checks.rounds.length < 2 || rounds.length < 2)
    return (
      <p className="muted small">
        After your second skill check (every four weeks), your first and latest drawings of the same prompt appear here side by side.{' '}
        {checks.status.due ? <a href="#/check">Do a skill check now.</a> : `Next one: ${new Date(checks.status.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.`}
      </p>
    );
  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  const fmt = (r) => `#${r.round} · ${new Date(r.at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  return (
    <div>
      <div className="seg" style={{ marginBottom: 10 }}>
        {prompts.map((p) => (
          <button key={p.id} className={pid === p.id ? 'active' : ''} onClick={() => setPid(p.id)}>
            {p.id === 'box' ? 'Box' : p.id === 'head' ? 'Head' : p.id === 'figure' ? 'Figure' : 'Hand'}
          </button>
        ))}
      </div>
      <div className="thennow" style={{ maxWidth: 520 }}>
        <img src={last.drawings[pid].file} alt={`Latest: ${fmt(last)}`} />
        <img src={first.drawings[pid].file} alt={`First: ${fmt(first)}`} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, background: 'var(--accent)' }} />
      </div>
      <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} style={{ width: '100%', maxWidth: 520 }} aria-label="Slide between then and now" />
      <div className="row small muted" style={{ justifyContent: 'space-between', maxWidth: 520 }}>
        <span>← Then: {fmt(first)}</span>
        <span>Now: {fmt(last)} →</span>
      </div>
    </div>
  );
}

export default function Progress() {
  const { version } = useApp();
  const [s, setS] = useState(null);
  const [checks, setChecks] = useState(null);
  useEffect(() => {
    api.stats().then(setS).catch(() => {});
    api.checks().then(setChecks).catch(() => {});
  }, [version]);
  if (!s) return <p className="muted">Loading your numbers…</p>;
  const c = s.consistency;
  const sk = s.skills;
  // "Then" for the radar: the month closest to three months ago that has scores.
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - 3, 15).toISOString().slice(0, 7);
  const thenEntry = [...sk.history].reverse().find((h) => h.month <= target && Object.values(h.scores).some((v) => v != null));
  const daysDrawn = c.heatmap.filter((d) => d.minutes > 0).length;
  const focusRate = c.blocksDone + c.blocksGivenUp > 0 ? Math.round((c.blocksDone / (c.blocksDone + c.blocksGivenUp)) * 100) : null;
  const byArea = c.minutesByArea.filter((a) => a.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const maxArea = Math.max(1, ...byArea.map((a) => a.minutes));
  const areaName = Object.fromEntries(s.areas.map((a) => [a.id, a.name]));

  return (
    <>
      <section style={{ marginTop: 10 }}>
        <div className="kicker">How you’re doing</div>
        <h1>Progress</h1>
      </section>

      <section className="tiles section" style={{ marginTop: 14 }}>
        <div className="tile">
          <div className="value">{c.streakWeeks}</div>
          <div className="label">week streak · best {c.bestStreakWeeks}</div>
        </div>
        <div className="tile">
          <div className="value">{hours(c.totalMinutes)}</div>
          <div className="label">drawn in total</div>
        </div>
        <div className="tile">
          <div className="value">{daysDrawn}</div>
          <div className="label">days drawn this year</div>
        </div>
        <div className="tile">
          <div className="value">
            {s.pace.lessonsDone}
            <span className="muted" style={{ fontSize: '1rem' }}>
              /{s.pace.lessonsTotal}
            </span>
          </div>
          <div className="label">lessons finished</div>
        </div>
        <div className="tile">
          <div className="value">{focusRate != null ? `${focusRate}%` : '–'}</div>
          <div className="label">blocks completed</div>
        </div>
        <div className="tile">
          <div className="value">{sk.drawings}</div>
          <div className="label">drawings</div>
        </div>
      </section>

      <section className="section card">
        <div className="section-head">
          <h3>The year</h3>
          <span className="small muted">minutes per day</span>
        </div>
        <Heatmap days={c.heatmap} dayMinutes={c.thisWeek.dayMinutes} />
      </section>

      <section className="section grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="section-head">
            <h3>Weeks</h3>
            <span className="small muted">
              target: {c.thisWeek.target} days × {c.thisWeek.dayMinutes} min · {c.graceLeft} grace {c.graceLeft === 1 ? 'day' : 'days'} left
            </span>
          </div>
          <WeekBars weeks={c.weeks} target={c.thisWeek.target * c.thisWeek.dayMinutes} />
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Growth rings</h3>
          </div>
          <Rings days={c.heatmap} />
        </div>
      </section>

      <section className="section grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="section-head">
            <h3>Skills</h3>
            <span className="small muted">1–5, from critiques and your ratings</span>
          </div>
          {Object.values(sk.recent).some((v) => v != null) ? (
            <Radar areas={s.areas} now={sk.recent} then={thenEntry?.scores} thenLabel={thenEntry ? new Date(`${thenEntry.month}-15`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''} />
          ) : (
            <p className="muted small">Rate your drawings (or get critiques) and your skill shape appears here.</p>
          )}
          {sk.calibration != null && (
            <p className="small" style={{ marginBottom: 0 }}>
              Self-rating accuracy: you’re on average <strong>{sk.calibration}</strong> points away from critiques.{' '}
              {sk.calibration <= 0.6 ? 'Very well calibrated.' : sk.calibration <= 1.2 ? 'Getting there.' : 'Compare your ratings with critiques to sharpen your eye.'}
            </p>
          )}
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Then & now</h3>
            <a className="small" href="#/compare">Compare any two drawings →</a>
          </div>
          {checks ? <ThenNow checks={checks} /> : <p className="muted">Loading…</p>}
        </div>
      </section>

      <section className="section card">
        <div className="section-head">
          <h3>Each area over time</h3>
          <span className="small muted">monthly average; dashed line = 3 (“working”)</span>
        </div>
        <Trends areas={s.areas} history={sk.history} />
      </section>

      <section className="section grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="section-head">
            <h3>When you draw</h3>
            {c.bestHour != null && <span className="small muted">most focus around {c.bestHour}:00</span>}
          </div>
          <HourBars hours={c.hours} />
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Where your time goes</h3>
          </div>
          {byArea.length ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {byArea.map((a) => (
                <div key={a.area} className="row small" style={{ gap: 10 }} title={`${areaName[a.area]}: ${a.minutes} min`}>
                  <span style={{ width: 92 }}>{areaName[a.area]}</span>
                  <span style={{ flex: 1, height: 10, borderRadius: 4, background: 'var(--paper-2)' }}>
                    <span style={{ display: 'block', width: `${(a.minutes / maxArea) * 100}%`, height: '100%', borderRadius: 4, background: 'var(--heat-3)' }} />
                  </span>
                  <span className="muted" style={{ width: 56, textAlign: 'right' }}>
                    {hours(a.minutes)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">Pick an area when you start a focus block to see this.</p>
          )}
        </div>
      </section>

      {s.milestones && (
        <section className="section card">
          <div className="section-head">
            <h3>Milestones</h3>
            <span className="small muted">every tier you reach places a landmark in your valley</span>
          </div>
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {s.milestones.map((m) => (
              <div key={m.id} className="tile">
                <div className="label">{m.name}</div>
                <div className="value">{m.value.toLocaleString()}</div>
                {m.next ? (
                  <>
                    <div className="meter" style={{ margin: '8px 0 4px' }}>
                      <span style={{ width: `${Math.min(100, ((m.value - m.last) / (m.next - m.last)) * 100)}%` }} />
                    </div>
                    <div className="tiny muted">
                      next: {m.next.toLocaleString()} {m.unit} · {m.reached} {m.landmarkName.toLowerCase()}
                      {m.reached === 1 ? '' : 's'} so far
                    </div>
                  </>
                ) : (
                  <div className="tiny muted">all {m.tiers.length} tiers reached</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0 }}>Portfolio review</h3>
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            {s.portfolio?.due
              ? 'Due now: pick your best pieces and rate them on the professional scale.'
              : s.portfolio?.dueAt
                ? `Next one on ${new Date(s.portfolio.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.`
                : `Opens once you have 3 finished pieces or projects (${s.portfolio?.pieces ?? 0} so far).`}
            {s.piece?.active && ` Finished pieces: one every ${s.piece.every === 'month' ? 'month' : 'two weeks'}${s.piece.doneThisPeriod ? ' (this one’s done ✓)' : ''}.`}
          </p>
        </div>
        <a className="btn small" href="#/portfolio">
          Open
        </a>
      </section>

      <section className="section card">
        <h3>Pace</h3>
        <p style={{ margin: 0 }}>
          {s.pace.hoursPerWeek > 0 ? (
            <>
              You’re practising about <strong>{s.pace.hoursPerWeek} hours</strong> a week (last 4 weeks).{' '}
              {s.pace.weeksToNextStage != null && `At this pace, the next stage is about ${s.pace.weeksToNextStage} ${s.pace.weeksToNextStage === 1 ? 'week' : 'weeks'} away`}
              {s.pace.weeksToEnd != null && `, and the end of the path about ${Math.round((s.pace.weeksToEnd / 52) * 10) / 10} years (${Math.round(s.pace.hoursTotal - s.pace.hoursDone)} hours left).`}
            </>
          ) : (
            'Practise for a week and a forecast appears here.'
          )}{' '}
          <span className="muted small">Slow and steady is fine: depth beats speed.</span>
        </p>
      </section>
    </>
  );
}
