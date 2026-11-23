// Your numbers: consistency (minutes per day, weekly target, streak of weeks
// with grace days), skill scores over time (radar), pace forecast, the weekly
// review, and the data your valley is drawn from.
//
// Motivation research built in:
//  - Weekly targets + grace days (habit research: one missed day doesn't break a habit).
//  - Goal-gradient: progress to the next milestone is always shown.
//  - Fresh start: Mondays and the 1st of the month get a review and a clean slate.
//  - Progress principle: small wins of the day/week are listed.
const { db } = require('../db');
const C = require('./curriculum');
const core = require('./core');

const q = {
  blocks: db.prepare('SELECT id, started_at, ended_at, planned, minutes, status, kind, lesson_id, area, tree, stage FROM atelier_blocks WHERE user_id = ? AND status != ? ORDER BY started_at'),
  drawings: db.prepare('SELECT id, lesson_id, exercise_id, kind, area, skill, self_scores, critique, check_round, created_at, file FROM atelier_drawings WHERE user_id = ? AND status = ? ORDER BY created_at'),
  lessonsDone: db.prepare('SELECT lesson_id, done_at FROM atelier_lessons WHERE user_id = ? AND done_at IS NOT NULL ORDER BY done_at'),
};

const scoresOf = (d) => {
  // Critique scores win over self-ratings (they're calibrated); both are 1-5.
  try {
    const c = d.critique ? JSON.parse(d.critique) : null;
    if (c?.scores && !c.refused) return { scores: c.scores, by: 'critique' };
  } catch {
    // ignore
  }
  try {
    const s = d.self_scores ? JSON.parse(d.self_scores) : null;
    if (s && Object.keys(s).length) return { scores: s, by: 'self' };
  } catch {
    // ignore
  }
  return null;
};
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Consistency: minutes per day, weeks against your target, streak of weeks.
function consistency(userId, prof = core.profile(userId)) {
  const tz = prof.tz;
  const blocks = q.blocks.all(userId, 'running');
  const byDay = new Map();
  for (const b of blocks) {
    const day = core.dayKey(b.started_at, tz);
    byDay.set(day, (byDay.get(day) ?? 0) + (b.minutes || 0));
  }
  const today = core.dayKey(Date.now(), tz);
  const first = blocks.length ? core.dayKey(blocks[0].started_at, tz) : today;
  // Weeks from the first block until this week.
  const weeks = [];
  const graceUsed = new Map(); // "YYYY-MM" -> grace days used
  for (let wk = core.weekKey(first); wk <= core.weekKey(today); wk = core.addDays(wk, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => core.addDays(wk, i));
    const minutes = days.reduce((s, d) => s + (byDay.get(d) ?? 0), 0);
    const hit = days.filter((d) => (byDay.get(d) ?? 0) >= prof.dayMinutes).length;
    const current = wk === core.weekKey(today);
    let grace = 0;
    let met = hit >= prof.weekDays;
    // Grace days (2 per calendar month) fill a short week, but not the current one.
    if (!met && !current) {
      const month = wk.slice(0, 7);
      const left = 2 - (graceUsed.get(month) ?? 0);
      const need = prof.weekDays - hit;
      if (need <= left) {
        grace = need;
        graceUsed.set(month, (graceUsed.get(month) ?? 0) + need);
        met = true;
      }
    }
    weeks.push({ week: wk, minutes: Math.round(minutes), daysHit: hit, grace, met, current });
  }
  // Streak: consecutive met weeks ending last week, plus this week if it's met already.
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    if (w.current && !w.met) continue;
    if (!w.met) break;
    streak++;
  }
  let best = 0;
  let run = 0;
  for (const w of weeks) {
    if (w.met) best = Math.max(best, ++run);
    else if (!w.current) run = 0;
  }
  const thisMonth = today.slice(0, 7);
  const thisWeek = weeks[weeks.length - 1] ?? { minutes: 0, daysHit: 0 };
  // Heatmap: the last 371 days (53 weeks).
  const start = core.addDays(core.weekKey(today), -52 * 7);
  const heatmap = [];
  for (let d = start; d <= today; d = core.addDays(d, 1)) heatmap.push({ day: d, minutes: Math.round(byDay.get(d) ?? 0) });
  const done = blocks.filter((b) => b.status === 'done');
  const gaveUp = blocks.filter((b) => b.status === 'gave_up');
  // When you draw best: completed blocks by hour of day.
  const hours = Array(24).fill(0);
  for (const b of done) hours[core.localTime(b.started_at, tz).hour] += b.minutes || 0;
  const bestHour = hours.some((h) => h > 0) ? hours.indexOf(Math.max(...hours)) : null;
  return {
    today,
    minutesToday: Math.round(byDay.get(today) ?? 0),
    heatmap,
    weeks: weeks.slice(-26),
    metWeeks: weeks.filter((w) => w.met).length,
    streakWeeks: streak,
    bestStreakWeeks: best,
    thisWeek: { minutes: thisWeek.minutes, daysHit: thisWeek.daysHit, target: prof.weekDays, dayMinutes: prof.dayMinutes },
    graceLeft: Math.max(0, 2 - (graceUsed.get(thisMonth) ?? 0)),
    totalMinutes: Math.round(blocks.reduce((s, b) => s + (b.minutes || 0), 0)),
    blocksDone: done.length,
    blocksGivenUp: gaveUp.length,
    bestHour,
    hours: hours.map((m) => Math.round(m)),
    minutesByArea: C.AREAS.map((a) => ({ area: a.id, minutes: Math.round(blocks.filter((b) => b.area === a.id).reduce((s, b) => s + (b.minutes || 0), 0)) })),
  };
}

// Skill scores: per area now (last 60 days) and per month since you started.
function skills(userId) {
  const drawings = q.drawings.all(userId, 'done');
  const now = Date.now();
  const perArea = (list) =>
    Object.fromEntries(
      C.AREAS.map((a) => {
        const vals = [];
        for (const d of list) {
          if (d.area !== a.id) continue;
          const s = scoresOf(d);
          if (s) vals.push(avg(Object.values(s.scores).map(Number).filter((n) => n >= 1 && n <= 5)));
        }
        const v = avg(vals.filter((x) => x != null));
        return [a.id, v == null ? null : Math.round(v * 10) / 10];
      }),
    );
  const recent = perArea(drawings.filter((d) => now - d.created_at < 60 * core.DAY));
  const months = new Map();
  for (const d of drawings) {
    const m = new Date(d.created_at).toISOString().slice(0, 7);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(d);
  }
  const history = [...months].map(([month, list]) => ({ month, scores: perArea(list), drawings: list.length }));
  // Calibration: how far your self-ratings are from critiques on the same drawings.
  const gaps = [];
  for (const d of drawings) {
    try {
      const self = d.self_scores ? JSON.parse(d.self_scores) : null;
      const crit = d.critique ? JSON.parse(d.critique) : null;
      if (!self || !crit?.scores) continue;
      for (const [k, v] of Object.entries(crit.scores)) if (self[k] != null) gaps.push(Math.abs(Number(self[k]) - Number(v)));
    } catch {
      // ignore
    }
  }
  return { recent, history, calibration: gaps.length ? Math.round(avg(gaps) * 10) / 10 : null, drawings: drawings.length };
}

// Pace: lessons per week over the last 4 weeks -> time to the next stage and the end.
function pace(userId) {
  const state = core.lessonState(userId);
  const done = q.lessonsDone.all(userId);
  const recent = done.filter((l) => Date.now() - l.done_at < 28 * core.DAY).length;
  const perWeek = recent / 4;
  const cur = core.currentLesson(userId, state);
  const stage = cur?.stage ?? 10;
  const leftInStage = C.MAIN.filter((l) => l.stage === stage && !state.get(l.id)?.done_at).length;
  const leftTotal = C.MAIN.filter((l) => !state.get(l.id)?.done_at).length;
  const doneMain = C.MAIN.length - leftTotal;
  return {
    stage,
    lessonsDone: doneMain,
    lessonsTotal: C.MAIN.length,
    leftInStage,
    perWeek: Math.round(perWeek * 10) / 10,
    weeksToNextStage: perWeek > 0 ? Math.ceil(leftInStage / perWeek) : null,
    weeksToEnd: perWeek > 0 ? Math.ceil(leftTotal / perWeek) : null,
    stagesDone: core.stagesDone(state),
  };
}

// Your valley: trees from focus blocks, stones from lessons, buildings from
// stages, lanterns from weeks you hit your target, pictures from skill checks.
function world(userId) {
  const prof = core.profile(userId);
  const blocks = q.blocks.all(userId, 'running');
  const state = core.lessonState(userId);
  const cons = consistency(userId, prof);
  const checks = new Map();
  for (const d of q.drawings.all(userId, 'done')) if (d.kind === 'check' && d.check_round) checks.set(d.check_round, (checks.get(d.check_round) ?? 0) + 1);
  return {
    trees: blocks.map((b) => ({ id: b.id, at: b.started_at, area: b.area ?? 'free', tree: b.status === 'gave_up' ? 'withered' : b.tree ?? 'sapling', minutes: Math.round(b.minutes || 0), stage: b.stage })),
    stones: [...state.values()].filter((r) => r.done_at).length,
    buildings: core.stagesDone(state).map((id) => C.STAGES[id].building),
    lanterns: cons.metWeeks,
    gallery: [...checks.keys()].sort((a, b) => a - b),
    stage: core.currentStage(userId, state),
    startedAt: prof.startedAt,
  };
}

// The weekly review (shown on Mondays, available any time).
function weeklyReview(userId) {
  const prof = core.profile(userId);
  const cons = consistency(userId, prof);
  const weeks = cons.weeks;
  const last = weeks[weeks.length - 2] ?? null;
  const before = weeks[weeks.length - 3] ?? null;
  const sk = skills(userId);
  const hist = sk.history;
  const lastMonth = hist[hist.length - 1]?.scores ?? {};
  const prevMonth = hist[hist.length - 2]?.scores ?? {};
  const improved = C.AREAS.map((a) => ({ area: a.id, name: a.name, delta: lastMonth[a.id] != null && prevMonth[a.id] != null ? lastMonth[a.id] - prevMonth[a.id] : null }))
    .filter((x) => x.delta != null && x.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  const weakest = C.AREAS.map((a) => ({ area: a.id, name: a.name, score: sk.recent[a.id] })).filter((x) => x.score != null).sort((a, b) => a.score - b.score)[0] ?? null;
  return {
    lastWeek: last,
    change: last && before ? last.minutes - before.minutes : null,
    streakWeeks: cons.streakWeeks,
    improved: improved.slice(0, 3),
    focus: weakest,
    pace: pace(userId),
    freshStart: isFreshStart(prof.tz),
  };
}

// Monday or the 1st of the month: a good moment to reset goals (fresh-start effect).
function isFreshStart(tz) {
  const day = core.dayKey(Date.now(), tz);
  const d = new Date(`${day}T12:00:00Z`);
  return { monday: d.getUTCDay() === 1, newMonth: day.endsWith('-01') };
}

module.exports = { consistency, skills, pace, world, weeklyReview, scoresOf };
