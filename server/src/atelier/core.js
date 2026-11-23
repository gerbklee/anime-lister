// Atelier's core: your plan (profile), lesson progress, spaced reviews of
// skills, and the daily session builder.
//
// Learning methods built in here:
//  - Spacing: every finished lesson's skills come back at growing intervals
//    (1, ~2.5, ~6, ~15, ~40 days...), sooner when a review felt hard.
//  - Interleaving: a day's reviews are taken from different skill areas.
//  - Retrieval: lessons end with a drawing-from-memory exercise, and reviews
//    prefer those.
const { db } = require('../db');
const { isSpicy } = require('../adult');
const C = require('./curriculum');

const DAY = 24 * 3600 * 1000;

const q = {
  profile: db.prepare('SELECT * FROM atelier_profile WHERE user_id = ?'),
  createProfile: db.prepare('INSERT OR IGNORE INTO atelier_profile (user_id, started_at) VALUES (?, ?)'),
  lessons: db.prepare('SELECT lesson_id, read_at, done_at FROM atelier_lessons WHERE user_id = ?'),
  readLesson: db.prepare(`INSERT INTO atelier_lessons (user_id, lesson_id, read_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET read_at = COALESCE(read_at, excluded.read_at)`),
  doneLesson: db.prepare(`INSERT INTO atelier_lessons (user_id, lesson_id, read_at, done_at) VALUES (@u, @l, @t, @t)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET done_at = @t, read_at = COALESCE(read_at, @t)`),
  undoLesson: db.prepare('UPDATE atelier_lessons SET done_at = NULL WHERE user_id = ? AND lesson_id = ?'),
  reviews: db.prepare('SELECT * FROM atelier_reviews WHERE user_id = ?'),
  review: db.prepare('SELECT * FROM atelier_reviews WHERE user_id = ? AND skill = ?'),
  saveReview: db.prepare(`INSERT INTO atelier_reviews (user_id, skill, interval, due_at, last_at, reps, last_rating)
    VALUES (@u, @s, @interval, @due, @last, @reps, @rating)
    ON CONFLICT(user_id, skill) DO UPDATE SET interval = @interval, due_at = @due, last_at = @last, reps = @reps, last_rating = @rating`),
  exerciseDone: db.prepare(`SELECT DISTINCT exercise_id FROM atelier_drawings WHERE user_id = ? AND lesson_id = ? AND exercise_id IS NOT NULL AND status = 'done'`),
  lastCheck: db.prepare(`SELECT MAX(check_round) AS round, MAX(created_at) AS at FROM atelier_drawings WHERE user_id = ? AND kind = 'check'`),
  lastCritique: db.prepare('SELECT id, critique FROM atelier_drawings WHERE user_id = ? AND critique IS NOT NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1'),
  lastSelf: db.prepare('SELECT id, area, self_scores FROM atelier_drawings WHERE user_id = ? AND self_scores IS NOT NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1'),
  anyCheck: db.prepare("SELECT COUNT(*) AS n, MAX(created_at) AS last FROM atelier_drawings WHERE user_id = ? AND kind = 'check' AND file IS NOT NULL"),
  stageMinutes: db.prepare("SELECT stage, COALESCE(SUM(minutes), 0) AS m FROM atelier_blocks WHERE user_id = ? AND status = 'done' AND stage IS NOT NULL GROUP BY stage"),
  exerciseDays: db.prepare(`SELECT lesson_id, exercise_id, COUNT(DISTINCT date(created_at / 1000, 'unixepoch')) AS n, MAX(created_at) AS last
    FROM atelier_drawings WHERE user_id = ? AND status = 'done' AND lesson_id IS NOT NULL AND exercise_id IS NOT NULL GROUP BY lesson_id, exercise_id`),
  minutesSince: db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM atelier_blocks WHERE user_id = ? AND started_at >= ?'),
};

// ---- Time ----------------------------------------------------------------------------------

// "YYYY-MM-DD" of a moment in the user's time zone.
function dayKey(ts, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}
// Local hour and minute in the user's time zone.
function localTime(ts, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { hour: get('hour') % 24, minute: get('minute') };
  } catch {
    const d = new Date(ts);
    return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
}
// Monday-based week key of a day key ("2026-11-23" -> "2026-11-23" for that Monday).
function weekKey(day) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}
const addDays = (day, n) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

// ---- Profile -------------------------------------------------------------------------------

function profile(userId) {
  q.createProfile.run(userId, Date.now());
  const p = q.profile.get(userId);
  const level = isSpicy(userId);
  return {
    dailyMinutes: p.daily_minutes,
    weekDays: p.week_days,
    dayMinutes: p.day_minutes,
    planWhen: p.plan_when ?? '',
    planWhere: p.plan_where ?? '',
    reminderAt: p.reminder_at ?? '',
    tz: p.tz ?? 'UTC',
    adultTrack: !!p.adult_track && level > 0,
    adultAllowed: level > 0,
    spicyLevel: level,
    critiqueCap: p.critique_cap,
    focusMinutes: p.focus_minutes,
    breakMinutes: p.break_minutes,
    startedAt: p.started_at,
    raw: p,
  };
}

const PROFILE_FIELDS = {
  dailyMinutes: ['daily_minutes', (v) => Math.max(10, Math.min(300, Math.round(Number(v) || 0)))],
  weekDays: ['week_days', (v) => Math.max(1, Math.min(7, Math.round(Number(v) || 0)))],
  dayMinutes: ['day_minutes', (v) => Math.max(5, Math.min(240, Math.round(Number(v) || 0)))],
  planWhen: ['plan_when', (v) => String(v ?? '').slice(0, 120)],
  planWhere: ['plan_where', (v) => String(v ?? '').slice(0, 120)],
  reminderAt: ['reminder_at', (v) => (/^\d{2}:\d{2}$/.test(String(v ?? '')) ? String(v) : null)],
  tz: ['tz', (v) => (typeof v === 'string' && v.length < 64 ? v : 'UTC')],
  critiqueCap: ['critique_cap', (v) => Math.max(0, Math.min(10000, Math.round(Number(v) || 0)))],
  focusMinutes: ['focus_minutes', (v) => Math.max(5, Math.min(180, Math.round(Number(v) || 0)))],
  breakMinutes: ['break_minutes', (v) => Math.max(1, Math.min(60, Math.round(Number(v) || 0)))],
};
function updateProfile(userId, patch) {
  profile(userId);
  for (const [key, [col, clean]] of Object.entries(PROFILE_FIELDS)) {
    if (patch[key] === undefined) continue;
    db.prepare(`UPDATE atelier_profile SET ${col} = ? WHERE user_id = ?`).run(clean(patch[key]), userId);
  }
  // The adult track: only with Spicy or Explicit art on, and an 18+ confirmation.
  if (patch.adultTrack !== undefined) {
    const on = patch.adultTrack === true && patch.confirm18 === true && isSpicy(userId) > 0;
    db.prepare('UPDATE atelier_profile SET adult_track = ? WHERE user_id = ?').run(on ? 1 : 0, userId);
  }
  return profile(userId);
}

// ---- Progress ------------------------------------------------------------------------------

function lessonState(userId) {
  const rows = q.lessons.all(userId);
  return new Map(rows.map((r) => [r.lesson_id, r]));
}

// Lessons you can see: the main path, plus adult units whose main stage you've reached.
function visibleLessons(userId, prof = profile(userId)) {
  const state = lessonState(userId);
  const stage = currentStage(userId, state);
  const adult = prof.adultTrack ? C.ADULT.filter((l) => (C.ADULT_UNITS.find((u) => u.id === l.unit)?.opensWith ?? 99) <= stage) : [];
  return { main: C.MAIN, adult, state, stage };
}

// ---- Mastery: sessions per exercise and hours per stage ------------------------------------
//
// Skill needs volume spread over time. An exercise counts as practised once
// you've done it on its required number of different days; a lesson can be
// finished when all its exercises are; a stage is complete when all its
// lessons are finished AND you've put its hours of focused practice in.
// Only then does the next stage open.

function practice(userId) {
  const stageMinutes = new Map(q.stageMinutes.all(userId).map((r) => [r.stage, r.m]));
  const exDays = new Map(q.exerciseDays.all(userId).map((r) => [`${r.lesson_id}/${r.exercise_id}`, { days: r.n, last: r.last }]));
  const check = q.anyCheck.get(userId);
  return { stageMinutes, exDays, check: { days: check.n > 0 ? 1 : 0, last: check.last ?? 0 } };
}
// Skill-check exercises count any skill check (they are drawn on the Check page).
const exProgress = (lesson, e, prog) => (e.kind === "check" ? prog.check : prog.exDays.get(`${lesson.id}/${e.id}`) ?? { days: 0, last: 0 });
function lessonReady(lesson, prog) {
  return lesson.exercises.every((e) => exProgress(lesson, e, prog).days >= (e.sessions ?? 1));
}
function lessonProgress(lesson, prog) {
  const exercises = lesson.exercises.map((e) => ({ id: e.id, done: Math.min(e.sessions ?? 1, exProgress(lesson, e, prog).days), need: e.sessions ?? 1, last: exProgress(lesson, e, prog).last || null }));
  return { exercises, sessionsDone: exercises.reduce((s, x) => s + x.done, 0), sessionsNeeded: exercises.reduce((s, x) => s + x.need, 0), ready: lessonReady(lesson, prog) };
}
function stageInfo(stage, state, prog) {
  const lessons = C.MAIN.filter((l) => l.stage === stage.id);
  const lessonsDone = lessons.filter((l) => state.get(l.id)?.done_at).length;
  const minutes = Math.round(prog.stageMinutes.get(stage.id) ?? 0);
  return { id: stage.id, lessons: lessons.length, lessonsDone, minutes, hours: stage.hours, complete: lessonsDone === lessons.length && minutes >= stage.hours * 60 };
}

// The stage you're in: the first one not complete.
function currentStage(userId, state = lessonState(userId), prog = practice(userId)) {
  return C.STAGES.find((s) => !stageInfo(s, state, prog).complete)?.id ?? 10;
}
// The first unfinished lesson of the current stage; null when only practice hours are left.
function currentLesson(userId, state = lessonState(userId), prog = practice(userId)) {
  const stage = currentStage(userId, state, prog);
  return C.MAIN.find((l) => l.stage === stage && !state.get(l.id)?.done_at) ?? null;
}
function stagesDone(userId, state = lessonState(userId), prog = practice(userId)) {
  return C.STAGES.filter((s) => stageInfo(s, state, prog).complete).map((s) => s.id);
}

function markRead(userId, lessonId) {
  q.readLesson.run(userId, lessonId, Date.now());
}
// Finishing a lesson schedules its skills for their first review tomorrow.
// It needs every exercise done on its number of days, unless forced.
function markDone(userId, lessonId, { force = false } = {}) {
  const lesson = C.LESSON.get(lessonId);
  if (!lesson) return { ok: false };
  const prog = lessonProgress(lesson, practice(userId));
  if (!prog.ready && !force) return { ok: false, progress: prog };
  const now = Date.now();
  q.doneLesson.run({ u: userId, l: lessonId, t: now });
  for (const s of lesson.skills) {
    if (!q.review.get(userId, s)) q.saveReview.run({ u: userId, s, interval: 1, due: now + DAY, last: now, reps: 0, rating: null });
  }
  return { ok: true };
}
function undoDone(userId, lessonId) {
  q.undoLesson.run(userId, lessonId);
}

// Spaced review: rating 1-5 of how it went. Hard -> tomorrow again; ok -> a bit
// longer; easy -> much longer.
function rateReview(userId, skill, rating) {
  const r = q.review.get(userId, skill) ?? { interval: 1, reps: 0 };
  const g = Math.max(1, Math.min(5, Math.round(Number(rating) || 3)));
  const interval = g <= 2 ? 1 : g === 3 ? Math.max(2, r.interval * 1.6) : Math.min(120, Math.max(3, r.interval * 2.5));
  const now = Date.now();
  q.saveReview.run({ u: userId, s: skill, interval, due: now + interval * DAY, last: now, reps: (r.reps ?? 0) + 1, rating: g });
  return { skill, interval, dueAt: now + interval * DAY };
}
// A weak critique score brings the skill back tomorrow.
function flagWeak(userId, skill) {
  const r = q.review.get(userId, skill);
  if (!r) return;
  q.saveReview.run({ u: userId, s: skill, interval: 1, due: Date.now() + DAY, last: r.last_at, reps: r.reps, rating: r.last_rating });
}

// The lesson and exercise that practise a skill (for reviews).
function skillHome(skill) {
  for (const l of C.LESSONS) if (l.skills.includes(skill)) return l;
  return null;
}
function reviewExercise(lesson) {
  return lesson.exercises.find((e) => e.kind === 'memory') ?? lesson.exercises.find((e) => e.kind === 'drill') ?? lesson.exercises.find((e) => e.kind === 'study') ?? null;
}

// ---- Skill checks (every 28 days) ----------------------------------------------------------

function checkStatus(userId) {
  const last = q.lastCheck.get(userId);
  const round = last?.round ?? 0;
  const dueAt = last?.at ? last.at + 28 * DAY : Date.now();
  return { lastRound: round, nextRound: round + 1, dueAt, due: Date.now() >= dueAt, prompts: C.SKILL_CHECK };
}

// ---- Today's session -----------------------------------------------------------------------

// Builds today's session from your daily time: warm-up, due reviews (mixed
// across areas), today's lesson, a study, and project time.
function todaySession(userId) {
  const prof = profile(userId);
  const state = lessonState(userId);
  const prog = practice(userId);
  const stage = currentStage(userId, state, prog);
  const lesson = currentLesson(userId, state, prog);
  const D = prof.dailyMinutes;
  const tz = prof.tz;
  const today = dayKey(Date.now(), tz);
  const dayIndex = Math.floor(new Date(`${today}T12:00:00Z`).getTime() / DAY);
  const parts = [];

  const check = checkStatus(userId);
  if (check.due && state.size > 0) {
    parts.push({ id: 'check', kind: 'check', title: `Skill check #${check.nextRound}`, minutes: 30, prompt: 'Four prompts, the same every time, so you can see your progress.', round: check.nextRound });
  }

  // Warm-up, rotating through what you've reached.
  const warmups = C.WARMUPS.filter((w) => w.fromStage <= stage);
  const warm = warmups[dayIndex % warmups.length];
  parts.push({ id: `warmup:${warm.id}`, kind: 'warmup', title: `Warm-up: ${warm.title}`, prompt: warm.prompt, minutes: D >= 45 ? 10 : 5, refs: warm.refs ?? null, practice: warm.practice ?? null });

  // Due reviews, interleaved: at most one per area, oldest first.
  const maxReviews = D >= 120 ? 3 : D >= 60 ? 2 : D >= 30 ? 1 : 0;
  const due = q.reviews.all(userId).filter((r) => r.due_at <= Date.now() + 6 * 3600 * 1000).sort((a, b) => a.due_at - b.due_at);
  const usedAreas = new Set();
  for (const r of due) {
    if (parts.filter((p) => p.kind === 'review').length >= maxReviews) break;
    const home = skillHome(r.skill);
    if (!home) continue;
    if (home.area && usedAreas.has(home.area)) continue;
    const ex = reviewExercise(home);
    if (!ex) continue;
    usedAreas.add(home.area);
    parts.push({ id: `review:${r.skill}`, kind: 'review', skill: r.skill, lessonId: home.id, area: home.area, title: `Review: ${home.title}`, prompt: ex.prompt, minutes: 10, exerciseId: ex.id, refs: ex.refs ?? null, practice: ex.practice ?? null, reps: r.reps, steps: ex.steps, success: ex.success, example: ex.example, exampleUrl: ex.exampleUrl });
  }

  const dayStart = startOfDay(Date.now(), tz);
  const exPart = (l, ex, minutes, extra = {}) => {
    const p = exProgress(l, ex, prog);
    return { id: `exercise:${l.id}:${ex.id}`, kind: ex.kind, lessonId: l.id, area: l.area, exerciseId: ex.id, title: ex.title, prompt: ex.prompt, minutes, refs: ex.refs ?? null, psd: !!ex.psd, practice: ex.practice ?? null, session: Math.min(ex.sessions, p.days + 1), sessions: ex.sessions, steps: ex.steps, success: ex.success, example: ex.example, exampleUrl: ex.exampleUrl, ...extra };
  };
  let budget = Math.max(15, D - parts.reduce((s, p) => s + p.minutes, 0) - (D >= 75 ? 20 : 0));

  // Today's lesson: its exercises that still need sessions (one session per exercise per day).
  if (lesson) {
    const read = !!state.get(lesson.id)?.read_at;
    if (!read) parts.push({ id: `lesson:${lesson.id}`, kind: 'lesson', lessonId: lesson.id, area: lesson.area, title: `Lesson: ${lesson.title}`, prompt: lesson.why, minutes: Math.min(20, Math.max(10, Math.round(lesson.minutes / 3))) });
    budget -= read ? 0 : parts[parts.length - 1].minutes;
    const open = lesson.exercises.filter((e) => exProgress(lesson, e, prog).days < e.sessions && exProgress(lesson, e, prog).last < dayStart);
    for (const ex of open) {
      if (budget <= 0) break;
      const minutes = Math.min(ex.minutes, budget);
      parts.push(exPart(lesson, ex, minutes));
      budget -= minutes;
    }
    if (lessonReady(lesson, prog) && read) parts.push({ id: `finish:${lesson.id}`, kind: 'finish', lessonId: lesson.id, title: `Finish “${lesson.title}”`, prompt: 'Every exercise has had its sessions: mark the lesson as finished to schedule its reviews.', minutes: 2 });
  }

  // Stage practice: when today's lesson work is done (or only practice hours
  // are left in the stage), mix exercises from the stage's finished lessons,
  // the ones practised longest ago first, one per area.
  if (budget >= 10) {
    const pool = C.MAIN.filter((l) => l.stage === stage && state.get(l.id)?.done_at)
      .flatMap((l) => l.exercises.filter((e) => e.kind !== 'check').map((e) => ({ l, e, last: exProgress(l, e, prog).last })))
      .filter((x) => x.last < dayStart)
      .sort((a, b) => a.last - b.last);
    const areas = new Set(parts.map((p) => p.area).filter(Boolean));
    for (const { l, e } of pool) {
      if (budget < 10) break;
      if (l.area && areas.has(l.area)) continue;
      areas.add(l.area);
      const minutes = Math.min(e.minutes, budget);
      parts.push(exPart(l, e, minutes, { id: `practice:${l.id}:${e.id}`, practiceOf: l.title }));
      budget -= minutes;
    }
  }

  // Free project time on longer days.
  if (D >= 75) {
    const used = parts.reduce((s, p) => s + p.minutes, 0);
    if (D - used >= 10) parts.push({ id: 'free', kind: 'free', title: 'Free drawing', prompt: 'Draw anything you like using today’s lesson: your characters, fan art, an idea. Fun counts.', minutes: Math.min(30, D - used) });
  }

  const minutesToday = q.minutesSince.get(userId, startOfDay(Date.now(), tz)).m;
  return { day: today, dailyMinutes: D, minutesToday: Math.round(minutesToday), stage, stageInfo: stageInfo(C.STAGES[stage], state, prog), lessonId: lesson?.id ?? null, parts, check, focus: focusPoint(userId, lesson) };
}

// Deliberate practice works on one specific thing at a time. Today's "one
// thing": the next step from your latest critique, else your weakest
// self-rated criterion, else the current lesson's first key point.
function focusPoint(userId, lesson) {
  const since = Date.now() - 14 * DAY;
  const c = q.lastCritique.get(userId, since);
  if (c) {
    try {
      const crit = JSON.parse(c.critique);
      if (!crit.refused && crit.nextStep) return { text: crit.nextStep, from: 'critique', drawingId: c.id, lessonId: crit.revisitLesson ?? null };
    } catch {
      // ignore
    }
  }
  const s = q.lastSelf.get(userId, since);
  if (s?.area && C.AREA[s.area]) {
    try {
      const scores = JSON.parse(s.self_scores);
      const weakest = C.AREA[s.area].criteria.filter((k) => scores[k.id] != null).sort((a, b) => scores[a.id] - scores[b.id])[0];
      if (weakest && scores[weakest.id] <= 3) return { text: `${weakest.name}: ${weakest.hint}.`, from: 'self', drawingId: s.id };
    } catch {
      // ignore
    }
  }
  if (lesson?.points?.length) return { text: lesson.points[0], from: 'lesson', lessonId: lesson.id };
  return null;
}

// Start of the user's local day as a timestamp (approximate across DST).
function startOfDay(ts, tz) {
  const { hour, minute } = localTime(ts, tz);
  const d = new Date(ts);
  return ts - (hour * 3600 + minute * 60 + d.getUTCSeconds()) * 1000 - d.getUTCMilliseconds();
}

module.exports = {
  DAY,
  dayKey,
  localTime,
  weekKey,
  addDays,
  startOfDay,
  profile,
  updateProfile,
  lessonState,
  visibleLessons,
  currentLesson,
  currentStage,
  stagesDone,
  practice,
  lessonProgress,
  lessonReady,
  stageInfo,
  markRead,
  markDone,
  undoDone,
  rateReview,
  flagWeak,
  skillHome,
  checkStatus,
  todaySession,
};
