// Drawing critiques from Claude (needs ANTHROPIC_API_KEY on the server).
//
// Three levels, so practice stays cheap and finished pieces get everything:
//   quick     the final picture only, short feedback (about 2¢)
//   standard  + reference, up to 3 key layers from a .clip file, the layer
//             list and work time, and correction overlays (about 8¢)
//   full      + up to 8 layers, a process review (construction, layer
//             organisation, time) and detailed overlays (about 15–25¢)
// Feedback follows Hattie & Timperley: where you're going, how you're doing,
// what to do next.
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const { db } = require('../db');
const C = require('./curriculum');

const MODEL = 'claude-opus-5-5';
// Claude Opus 5.5 prices in dollars per token (input $4 / output $20 per million).
const PRICE_IN = 4 / 1e6;
const PRICE_OUT = 20 / 1e6;

const LEVELS = {
  quick: { image: 896, refImage: 640, layers: 0, effort: 'low', maxTokens: 6000, fixes: 2, marks: false, process: false },
  standard: { image: 1568, refImage: 1024, layers: 3, effort: 'medium', maxTokens: 16000, fixes: 3, marks: true, process: false },
  full: { image: 1568, refImage: 1568, layers: 8, effort: 'high', maxTokens: 32000, fixes: 5, marks: true, process: true },
};
// The level a drawing gets unless you choose another.
const defaultLevel = (kind) => (['warmup', 'drill', 'memory', 'free'].includes(kind) ? 'quick' : ['project', 'piece'].includes(kind) ? 'full' : 'standard');

const available = () => !!process.env.ANTHROPIC_API_KEY;
let client = null;
const getClient = () => (client ??= new Anthropic());

const q = {
  spentSince: db.prepare(`SELECT COALESCE(SUM(critique_cost), 0) AS d FROM atelier_drawings WHERE user_id = ? AND json_extract(critique, '$.at') >= ?`),
  reviewSpentSince: db.prepare('SELECT COALESCE(SUM(cost), 0) AS d FROM atelier_portfolio_reviews WHERE user_id = ? AND created_at >= ?'),
};

function monthStart() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
// Dollars spent on critiques (drawings and portfolio reviews) this month.
const spentThisMonth = (userId) => q.spentSince.get(userId, monthStart()).d + q.reviewSpentSince.get(userId, monthStart()).d;

async function asImage(buf, max, { flatten = false } = {}) {
  let img = sharp(buf, { failOn: 'none' }).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
  if (flatten) img = img.flatten({ background: '#ffffff' });
  const out = await img.jpeg({ quality: 85 }).toBuffer();
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: out.toString('base64') } };
}

// The final drawing with a faint coordinate grid (a line every 0.1, the 0.5
// lines stronger), so fix pins and correction lines land where they should.
// No text labels: the server has no fonts.
async function withGrid(buf, max) {
  const base = await sharp(buf, { failOn: 'none' }).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = base.info;
  const lines = [];
  for (let i = 1; i < 10; i++) {
    const x = Math.round((w * i) / 10);
    const y = Math.round((h * i) / 10);
    const strong = i === 5;
    const attrs = `stroke="#00a0ff" stroke-opacity="${strong ? 0.5 : 0.25}" stroke-width="${strong ? 2 : 1}"`;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" ${attrs}/><line x1="0" y1="${y}" x2="${w}" y2="${y}" ${attrs}/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${lines.join('')}</svg>`;
  const out = await sharp(base.data).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toBuffer();
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: out.toString('base64') } };
}

const SYSTEM = `You are a warm but honest drawing teacher in an online art school for anime-style illustration. A student uploads a drawing. Your feedback must help them improve next time.
Rules:
- Be specific to THIS drawing: point at real places in it.
- Start from what genuinely works.
- Then give only the most important fixes, ordered by impact. Each fix says what to change and how.
- Score each criterion 1-5 for this student's stage: 1 not yet, 2 emerging, 3 working, 4 solid, 5 confident. Be calibrated, not generous.
- End with exactly one concrete next step they can do in the next session.
- If the lesson doesn't match what was drawn, critique what was drawn.
- Coordinates are fractions of the student's final drawing (0,0 top left, 1,1 bottom right). The final drawing carries a faint blue grid with a line every 0.1 (the 0.5 lines are stronger) to help you place coordinates precisely; it is not part of the drawing, so ignore it when judging.
- Keep it concise and encouraging; no generic praise.`;

const point = { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false };

function schemaFor(level, criteria) {
  const L = LEVELS[level];
  const props = {
    summary: { type: 'string' },
    works: { type: 'array', items: { type: 'string' } },
    fixes: {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['title', 'detail', 'x', 'y'], additionalProperties: false },
    },
    scores: { type: 'object', properties: Object.fromEntries(criteria.map((c) => [c.id, { type: 'integer' }])), required: criteria.map((c) => c.id), additionalProperties: false },
    nextStep: { type: 'string' },
    revisitLesson: { type: ['string', 'null'] },
  };
  if (L.marks) {
    // Correction overlays: lines and arrows drawn over the student's drawing.
    props.marks = {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['line', 'arrow', 'circle'] }, points: { type: 'array', items: point }, note: { type: 'string' }, fix: { type: 'integer' } },
        required: ['kind', 'points', 'note', 'fix'],
        additionalProperties: false,
      },
    };
  }
  if (L.process) {
    props.process = {
      type: 'object',
      properties: { construction: { type: 'string' }, organisation: { type: 'string' }, time: { type: 'string' }, workflowTip: { type: 'string' } },
      required: ['construction', 'organisation', 'time', 'workflowTip'],
      additionalProperties: false,
    };
  }
  return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false };
}

// drawing: DB row; files: { drawing, reference?, layers?: [{ name, buf }] }; clip: parsed clip info
async function critique(drawing, files, { selfScores, level = 'standard', clip = null } = {}) {
  const L = LEVELS[level] ?? LEVELS.standard;
  const lesson = drawing.lesson_id ? C.LESSON.get(drawing.lesson_id) : null;
  const exercise = lesson?.exercises.find((e) => e.id === drawing.exercise_id) ?? null;
  const area = C.AREA[drawing.area ?? lesson?.area ?? 'form'] ?? C.AREA.form;
  const criteria = area.criteria;
  const lessonIds = C.LESSONS.filter((l) => l.area === area.id).map((l) => `${l.id} (${l.title})`);
  const layers = (files.layers ?? []).slice(0, L.layers);

  const layerList = clip?.layers?.length
    ? `Layers in the Clip Studio file (bottom to top, indented by folder):\n${clip.layers.map((l) => `${'  '.repeat(l.depth)}- ${l.name} [${l.kind}${l.blend !== 'Normal' ? `, ${l.blend}` : ''}${l.clipped ? ', clipped' : ''}${l.opacity < 100 ? `, ${l.opacity}%` : ''}${l.visible ? '' : ', hidden'}${l.draft ? ', draft' : ''}]`).join('\n')}`
    : '';
  const context = [
    `Critique level: ${level}. Give at most ${L.fixes} fixes.`,
    `Exercise type: ${drawing.kind}.`,
    lesson ? `Lesson: ${lesson.title}. Why it matters: ${lesson.why}` : 'Free drawing.',
    exercise ? `Exercise: ${exercise.title}: ${exercise.prompt}` : drawing.title ? `Title: ${drawing.title}` : '',
    lesson ? `Key points of the lesson:\n- ${lesson.points.join('\n- ')}` : '',
    lesson?.mistakes?.length ? `Common mistakes to look for:\n- ${lesson.mistakes.join('\n- ')}` : '',
    `Score these criteria (area: ${area.name}):\n${criteria.map((c) => `- ${c.id}: ${c.name} – ${c.hint}`).join('\n')}`,
    selfScores ? `The student rated themselves: ${JSON.stringify(selfScores)}. Mention briefly where your view differs, to help them calibrate.` : '',
    `For revisitLesson, use one of these lesson ids or null: ${lessonIds.join(', ')}.`,
    clip?.workMinutes ? `Clip Studio recorded ${clip.workMinutes} minutes of work on this file.` : '',
    level !== 'quick' ? layerList : '',
    L.marks ? 'For marks: draw 1–6 correction overlays on the final drawing, e.g. a line showing the corrected angle of a limb, an arrow showing where a shape should move, a circle around a problem. "fix" is the index (0-based) of the fix it illustrates. Use 2 points for lines and arrows (start, end) and 2 points for circles (centre, a point on the edge).' : '',
    L.process ? 'For process: judge the construction you can see in the sketch layers, how the layers are organised (separate sketch/lines/flats, clipped shading, sensible names), how the work time fits the result, and give one workflow tip for Clip Studio.' : '',
    `Images in order: ${[files.reference ? 'the reference' : null, 'the final drawing', ...layers.map((l) => `the layer "${l.name}" on its own`)].filter(Boolean).join(', ')}.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const content = [];
  if (files.reference) content.push(await asImage(files.reference, L.refImage));
  content.push(await withGrid(files.drawing, L.image));
  for (const l of layers) content.push(await asImage(l.buf, 1024, { flatten: true }));
  content.push({ type: 'text', text: context });

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: L.maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: L.effort, format: { type: 'json_schema', schema: schemaFor(level, criteria) } },
    messages: [{ role: 'user', content }],
  });

  const cost = (response.usage?.input_tokens ?? 0) * PRICE_IN + (response.usage?.output_tokens ?? 0) * PRICE_OUT;
  if (response.stop_reason === 'refusal') {
    return { result: { refused: true, level, at: Date.now(), message: 'Claude declined to review this drawing (it does this for some nude or explicit pictures). Use the self-review checklist and the overlay instead.' }, cost };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The critique came back incomplete. Try again.');
  }
  const clamp = (n) => Math.max(0, Math.min(1, Number(n) || 0));
  parsed.fixes = (parsed.fixes ?? []).slice(0, L.fixes).map((f) => ({ ...f, x: clamp(f.x), y: clamp(f.y) }));
  if (parsed.marks) parsed.marks = parsed.marks.slice(0, 8).map((m) => ({ ...m, points: (m.points ?? []).slice(0, 2).map((p) => ({ x: clamp(p.x), y: clamp(p.y) })) })).filter((m) => m.points.length === 2);
  for (const k of Object.keys(parsed.scores ?? {})) parsed.scores[k] = Math.max(1, Math.min(5, Math.round(parsed.scores[k])));
  if (parsed.revisitLesson && !C.LESSON.has(parsed.revisitLesson)) parsed.revisitLesson = null;
  return { result: { ...parsed, level, layersSeen: layers.map((l) => l.name), area: area.id, at: Date.now(), model: response.model }, cost };
}

// ---- Portfolio review --------------------------------------------------------------------------

// A professional rubric, 1–10, for the quarterly portfolio review.
const PRO_RUBRIC = [
  { id: 'drawing', name: 'Drawing & anatomy', hint: 'Construction, proportion, believable bodies and hands' },
  { id: 'composition', name: 'Composition', hint: 'Focal point, camera, eye flow, readable silhouettes' },
  { id: 'light', name: 'Light & colour', hint: 'Values, light logic, palette, mood' },
  { id: 'rendering', name: 'Rendering & finish', hint: 'Edges, materials, line art, polish' },
  { id: 'appeal', name: 'Appeal & storytelling', hint: 'Character appeal, expression, a moment worth looking at' },
  { id: 'consistency', name: 'Consistency', hint: 'Every piece at the same level; no weak links' },
];
const PRO_LEVELS = '1–2 beginner, 3–4 hobbyist, 5–6 advanced hobbyist, 7 ready for small commissions, 8 professional (freelance), 9 senior professional, 10 top of the industry';

async function portfolioCritique(pieces) {
  const schema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' } },
      priorities: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'], additionalProperties: false } },
      scores: { type: 'object', properties: Object.fromEntries(PRO_RUBRIC.map((c) => [c.id, { type: 'integer' }])), required: PRO_RUBRIC.map((c) => c.id), additionalProperties: false },
      pieceNotes: { type: 'array', items: { type: 'string' } },
      nextQuarter: { type: 'string' },
    },
    required: ['summary', 'strengths', 'priorities', 'scores', 'pieceNotes', 'nextQuarter'],
    additionalProperties: false,
  };
  const content = [];
  for (const p of pieces) content.push(await asImage(p.buf, 1280));
  content.push({
    type: 'text',
    text: `These are ${pieces.length} portfolio pieces by an anime illustration student (titles: ${pieces.map((p, i) => `${i + 1}. ${p.title ?? 'Untitled'}`).join('; ')}). Review them as a portfolio reviewer at an art school would. Score each criterion 1–10 on the professional scale (${PRO_LEVELS}):\n${PRO_RUBRIC.map((c) => `- ${c.id}: ${c.name} – ${c.hint}`).join('\n')}\nGive 2–4 strengths, the 3 priorities for the next three months, one short note per piece (in order), and one sentence for the next quarter's focus. Be calibrated: most students sit between 3 and 6.`,
  });
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 24000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: 'You are an experienced, kind and honest portfolio reviewer for anime and game illustration.',
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  const cost = (response.usage?.input_tokens ?? 0) * PRICE_IN + (response.usage?.output_tokens ?? 0) * PRICE_OUT;
  if (response.stop_reason === 'refusal') return { result: { refused: true, at: Date.now() }, cost };
  const parsed = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  for (const k of Object.keys(parsed.scores ?? {})) parsed.scores[k] = Math.max(1, Math.min(10, Math.round(parsed.scores[k])));
  return { result: { ...parsed, at: Date.now() }, cost };
}

module.exports = { critique, portfolioCritique, available, spentThisMonth, defaultLevel, LEVELS, PRO_RUBRIC, PRO_LEVELS, MODEL };
