import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import World from '../components/World.jsx';
import { TimerCard } from '../components/Timer.jsx';
import { TreeIcon, TREE_INFO } from '../components/Tree.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// Days of this week (Mon-Sun) against your day target.
function WeekDots({ heatmap, dayMinutes, today }) {
  const idx = heatmap.findIndex((d) => d.day === today);
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const week = heatmap.slice(idx - dow, idx - dow + 7);
  const names = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <div className="row" style={{ gap: 8 }} aria-label="This week">
      {names.map((n, i) => {
        const d = week[i];
        const m = d?.minutes ?? 0;
        const hit = m >= dayMinutes;
        const future = i > dow;
        return (
          <div key={i} style={{ display: 'grid', justifyItems: 'center', gap: 2 }} title={d ? `${d.day}: ${m} min` : ''}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                border: `2px solid ${hit ? 'var(--sage)' : i === dow ? 'var(--accent)' : 'var(--line-2)'}`,
                background: hit ? 'var(--sage)' : m > 0 ? 'var(--sage-soft)' : 'transparent',
                color: hit ? '#fff' : 'var(--ink-2)',
                opacity: future ? 0.5 : 1,
              }}
            >
              {hit ? '✓' : n}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const { user, profile, areas, stages, version } = useApp();
  const [world, setWorld] = useState(null);
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState(null);
  const [review, setReview] = useState(null);

  useEffect(() => {
    api.world().then(setWorld).catch(() => {});
    api.stats().then(setStats).catch(() => {});
    api.today().then(setToday).catch(() => {});
    api.review().then(setReview).catch(() => {});
  }, [version]);

  const c = stats?.consistency;
  const stage = stages[world?.stage ?? 0];
  const nextPart = today?.parts.find((p) => p.kind !== 'warmup') ?? today?.parts[0];
  const fresh = today?.fresh;
  const pct = today ? Math.min(100, Math.round((today.minutesToday / today.dailyMinutes) * 100)) : 0;
  const weekTarget = c ? c.thisWeek.target : 5;

  return (
    <>
      <section style={{ marginTop: 10 }}>
        <div className="row" style={{ alignItems: 'baseline', marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>
            {greeting()}, {user.username}.
          </h1>
          <span className="muted">{world ? `${world.trees.filter((t) => t.tree !== 'withered').length} trees in your valley` : ''}</span>
        </div>
        <World world={world} stages={stages} areas={areas} />
        {world && (
          <div className="row small muted" style={{ marginTop: 8, gap: 14 }}>
            <span>🌳 {world.trees.length} focus blocks</span>
            <span>🪨 {world.stones} lessons</span>
            <span>🏠 {world.buildings.length} of 11 buildings</span>
            <span>🏮 {world.lanterns} weeks on target</span>
            {world.gallery.length > 0 && <span>🖼 {world.gallery.length} skill checks</span>}
            {stage && (
              <span className="row" style={{ gap: 4 }}>
                <TreeIcon type={stage.tree} size={20} /> now growing {TREE_INFO[stage.tree]?.name.toLowerCase()}s
              </span>
            )}
          </div>
        )}
      </section>

      {(fresh?.monday || fresh?.newMonth) && review && (
        <section className="section wash">
          <div className="kicker">{fresh.newMonth ? 'A new month' : 'A new week'}</div>
          <h2>A fresh page.</h2>
          <p>
            {review.lastWeek
              ? `Last week: ${review.lastWeek.minutes} minutes on ${review.lastWeek.daysHit} days${review.lastWeek.met ? ' – target met, a lantern for the river.' : '.'}`
              : 'Every week starts clean.'}{' '}
            {review.change != null && review.change !== 0 ? `${review.change > 0 ? '+' : ''}${review.change} minutes compared with the week before. ` : ''}
            {review.improved.length > 0 && `Improved: ${review.improved.map((x) => x.name).join(', ')}. `}
            {review.focus && `Worth some love this week: ${review.focus.name}.`}
          </p>
          <a className="btn small" href="#/progress">
            See your progress
          </a>
        </section>
      )}

      <section className="section">
        <TimerCard profile={profile} areas={areas} suggestion={stage} />
      </section>

      <section className="section grid-2">
        <div className="card">
          <div className="kicker">Today</div>
          {today ? (
            <>
              <h3>
                {today.minutesToday} of {today.dailyMinutes} minutes
              </h3>
              <div style={{ height: 10, borderRadius: 99, background: 'var(--paper-2)', overflow: 'hidden', margin: '6px 0 14px' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--sage)', borderRadius: 99, transition: 'width .4s' }} />
              </div>
              {nextPart && (
                <p className="small" style={{ marginBottom: 12 }}>
                  Next up: <strong>{nextPart.title}</strong> · {nextPart.minutes} min
                </p>
              )}
              <a className="btn primary small" href="#/today">
                Open today’s session
              </a>
            </>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>
        <div className="card">
          <div className="kicker">This week</div>
          {c ? (
            <>
              <h3>
                {c.thisWeek.daysHit} of {weekTarget} days
                <span className="muted small" style={{ fontFamily: 'var(--sans)', fontWeight: 600 }}>
                  {' '}
                  at {c.thisWeek.dayMinutes}+ min
                </span>
              </h3>
              <div style={{ margin: '8px 0 12px' }}>
                <WeekDots heatmap={c.heatmap} dayMinutes={c.thisWeek.dayMinutes} today={c.today} />
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {c.streakWeeks > 0 ? `🔥 ${c.streakWeeks}-week streak` : 'Start a streak this week'} · {c.graceLeft} grace {c.graceLeft === 1 ? 'day' : 'days'} left this month
                {c.thisWeek.daysHit < weekTarget ? ` · ${weekTarget - c.thisWeek.daysHit} more ${weekTarget - c.thisWeek.daysHit === 1 ? 'day' : 'days'} for a lantern` : ' · lantern earned 🏮'}
              </p>
            </>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>
      </section>

      {stage && stats?.pace && (
        <section className="section card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="kicker">
                Stage {stage.id} of 10
              </div>
              <h3 style={{ marginBottom: 2 }}>{stage.title}</h3>
              <p className="small muted" style={{ margin: 0 }}>
                {stats.pace.leftInStage} lessons to the {stage.building.name.toLowerCase()}
                {stats.pace.weeksToNextStage ? ` · about ${stats.pace.weeksToNextStage} ${stats.pace.weeksToNextStage === 1 ? 'week' : 'weeks'} at your pace` : ''}
              </p>
            </div>
            <a className="btn small" href="#/path">
              The path
            </a>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--paper-2)', overflow: 'hidden', marginTop: 12 }}>
            <div style={{ width: `${(stats.pace.lessonsDone / stats.pace.lessonsTotal) * 100}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            {stats.pace.lessonsDone} of {stats.pace.lessonsTotal} lessons on the whole path
          </p>
        </section>
      )}
    </>
  );
}
