// Your skill levels, RPG-style, on the professional 1–10 scale (8 = industry
// pro, the goal). Proof only: a level counts once 2 of your last 3 assessed
// drawings in that area reach it. Assessments are Claude's industry ratings
// from critiques run through the API and from portfolio reviews; self-ratings
// and critiques pasted from Claude.ai don't count.
const { db } = require('../db');
const C = require('./curriculum');
const core = require('./core');
const stats = require('./stats');
const crit = require('./critique');

const GOAL = 8;
const RANKS = crit.INDUSTRY.map((s) => {
  const m = /^(\d+) ([^:]+): (.*)$/.exec(s);
  return { level: Number(m[1]), name: m[2], text: m[3] };
});
const rankOf = (level) => RANKS.find((r) => r.level === level) ?? { level: 0, name: 'Unranked', text: 'Not proven yet: two assessed drawings needed' };

// Industry work needs all of these at once: your title is the weakest.
const CORE = ['line', 'anatomy', 'face', 'value', 'color', 'composition', 'rendering'];
// Which skill areas a portfolio-review criterion proves.
const PORTFOLIO_AREAS = { drawing: ['anatomy', 'gesture'], composition: ['composition'], light: ['value', 'color'], rendering: ['rendering', 'line'] };
// The level the path aims for by the end of each stage (realistic, not a promise).
const STAGE_AIM = [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8];

const q = {
  critiques: db.prepare("SELECT id, title, lesson_id, file, critique FROM atelier_drawings WHERE user_id = ? AND critique IS NOT NULL AND json_extract(critique, '$.industry') IS NOT NULL"),
  reviews: db.prepare('SELECT id, created_at, critique FROM atelier_portfolio_reviews WHERE user_id = ? AND critique IS NOT NULL'),
};

const parse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// Every assessment, per area, oldest first.
function assessments(userId) {
  const by = Object.fromEntries(C.AREAS.map((a) => [a.id, []]));
  for (const d of q.critiques.all(userId)) {
    const c = parse(d.critique);
    if (!c || c.refused || c.source === 'claude.ai') continue;
    for (const r of c.industry ?? []) if (by[r.area]) by[r.area].push({ at: c.at, level: r.level, why: r.why, drawingId: d.id, title: d.title ?? null });
  }
  for (const r of q.reviews.all(userId)) {
    const c = parse(r.critique);
    if (!c || c.refused || !c.scores) continue;
    for (const [k, areas] of Object.entries(PORTFOLIO_AREAS)) {
      const v = c.scores[k];
      if (v) for (const a of areas) by[a].push({ at: c.at ?? r.created_at, level: v, why: 'Portfolio review', reviewId: r.id });
    }
  }
  for (const list of Object.values(by)) list.sort((a, b) => a.at - b.at);
  return by;
}

// Proven twice: the highest level that 2 of the last 3 assessments reach.
function levelOf(list) {
  const last = list.slice(-3);
  if (last.length < 2) return { level: 0, progress: 0 };
  const sorted = last.map((x) => x.level).sort((a, b) => b - a);
  const level = sorted[1];
  const avg = last.reduce((s, x) => s + x.level, 0) / last.length;
  return { level, progress: level >= 10 ? 1 : Math.max(0, Math.min(0.99, avg - level)) };
}

function skillSheet(userId) {
  const by = assessments(userId);
  const state = core.lessonState(userId);
  const prog = core.practice(userId);
  const stage = core.currentStage(userId, state, prog);

  const levelUps = [];
  const areas = C.AREAS.map((a) => {
    const list = by[a.id];
    const history = [];
    let prev = 0;
    list.forEach((x, i) => {
      const { level } = levelOf(list.slice(0, i + 1));
      history.push({ at: x.at, level, assessed: x.level });
      if (level > prev) levelUps.push({ area: a.id, name: a.name, from: prev, to: level, at: x.at, rank: rankOf(level).name });
      prev = level;
    });
    const now = levelOf(list);
    return {
      id: a.id,
      name: a.name,
      core: CORE.includes(a.id),
      ...now,
      rank: rankOf(now.level).name,
      assessed: list.length,
      recent: list.slice(-3).reverse(),
      history,
    };
  });

  // Your title: the weakest proven core skill.
  const core7 = areas.filter((a) => a.core);
  const proven = core7.filter((a) => a.level > 0);
  const weakest = proven.length ? proven.reduce((m, a) => (a.level < m.level || (a.level === m.level && a.progress < m.progress) ? a : m)) : null;
  const overall = {
    level: weakest?.level ?? 0,
    rank: rankOf(weakest?.level ?? 0).name,
    heldBackBy: weakest ? { id: weakest.id, name: weakest.name } : null,
    unproven: core7.filter((a) => a.level === 0).map((a) => ({ id: a.id, name: a.name })),
    goal: GOAL,
  };

  // Quests: the next proof for each skill you're working on.
  const reached = (id) => C.MAIN.some((l) => l.area === id && (state.get(l.id)?.done_at || l.stage <= stage));
  const quests = [];
  for (const a of areas) {
    if (a.level >= 10) continue;
    const target = a.level + 1;
    if (a.level === 0) {
      if (!reached(a.id) && !a.assessed) continue;
      quests.push({ id: `prove-${a.id}`, area: a.id, title: `Get ranked in ${a.name}`, text: `Two ${a.name.toLowerCase()} drawings assessed by a critique (API) or a portfolio review.`, done: Math.min(2, a.assessed), need: 2, core: a.core });
      continue;
    }
    const hits = a.recent.filter((x) => x.level >= target).length;
    quests.push({ id: `level-${a.id}-${target}`, area: a.id, title: `${a.name} Lv ${target}: ${rankOf(target).name}`, text: `Two of your next three assessed ${a.name.toLowerCase()} drawings at Lv ${target} or higher.`, done: Math.min(2, hits), need: 2, core: a.core, heldBack: overall.heldBackBy?.id === a.id });
  }
  quests.sort((x, y) => (y.heldBack ? 1 : 0) - (x.heldBack ? 1 : 0) || (y.core ? 1 : 0) - (x.core ? 1 : 0) || y.done / y.need - x.done / x.need);

  // The skill tree: per area, its lessons in path order, with where each stage aims.
  const tree = C.AREAS.map((a) => ({
    id: a.id,
    name: a.name,
    level: areas.find((x) => x.id === a.id).level,
    lessons: [...C.MAIN, ...C.TRACK_LESSONS]
      .filter((l) => l.area === a.id)
      .map((l) => ({ id: l.id, title: l.title, stage: l.stage ?? null, track: l.track ?? null, aim: l.stage != null ? STAGE_AIM[l.stage] : null, status: core.lessonAccess(userId, l, state, prog) })),
  })).filter((t) => t.lessons.length);

  const achievements = stats.milestones(userId).flatMap((m) => m.tiers.slice(0, m.reached).map((t, i) => ({ id: `${m.id}-${i}`, title: `${m.landmarkName}: ${t} ${t === 1 ? m.unit.replace(/s$/, '') : m.unit}`, kind: m.id })));

  return { ranks: RANKS, goal: GOAL, overall, areas, levelUps: levelUps.sort((a, b) => b.at - a.at).slice(0, 30), quests, tree, achievements, stageAim: STAGE_AIM, stage };
}

module.exports = { skillSheet, assessments, levelOf, RANKS, CORE, GOAL };
