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
  quick: { image: 896, refImage: 640, layers: 0, effort: 'low', maxTokens: 8000, fixes: 2, marks: true, process: false },
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

async function jpeg(buf, max, { flatten = false } = {}) {
  let img = sharp(buf, { failOn: 'none' }).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
  if (flatten) img = img.flatten({ background: '#ffffff' });
  return img.jpeg({ quality: 85 }).toBuffer();
}
async function asImage(buf, max, opts) {
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (await jpeg(buf, max, opts)).toString('base64') } };
}

// The final drawing with a faint coordinate grid (a line every 0.1, the 0.5
// lines stronger), so fix pins and correction lines land where they should.
// No text labels: the server has no fonts.
async function gridJpeg(buf, max) {
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
  return sharp(base.data).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toBuffer();
}

const SYSTEM = `You are an honest, demanding drawing teacher in an online art school for anime-style illustration, with the eye of a professional art director. A student uploads a drawing. They want the truth about it, because they are training to become an industry illustrator. Your feedback must help them improve next time.
Rules:
- Honesty over comfort. Name every real problem you see, plainly. Do not soften a serious flaw into a "small tweak", do not invent strengths, and do not pad with praise. Kind in tone, never vague.
- Be specific to THIS drawing: point at real places in it, and mark them on the image.
- Start with what genuinely works (only things that really do).
- Then give the most important fixes, ordered by impact on the drawing. Each fix says what is wrong, why it reads wrong, and how to fix it.
- Score each lesson criterion 1-5 for this student's stage: 1 not yet, 2 emerging, 3 working, 4 solid, 5 confident. Be calibrated, not generous: 3 is a normal result for a decent attempt.
- Also rate the skill areas this drawing actually shows on the professional 1-10 industry scale, against published professional anime and game illustration, with no allowance for the student's stage. Most students sit between 2 and 5; 8 means a working industry professional could have drawn it. Only rate areas you can really judge from this drawing.
- End with exactly one concrete next step they can do in the next session.
- If the lesson doesn't match what was drawn, critique what was drawn.
- Coordinates are fractions of the student's final drawing (0,0 top left, 1,1 bottom right). The final drawing carries a faint blue grid with a line every 0.1 (the 0.5 lines are stronger) to help you place coordinates precisely; it is not part of the drawing, so ignore it when judging.`;

const point = { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false };

// The professional 1–10 scale, shared by critiques, the portfolio review and
// your skill levels.
const INDUSTRY = [
  '1 Novice: shapes and lines still fight you',
  '2 Beginner: basic construction appears, proportions often off',
  '3 Hobbyist: recognisable, but errors in structure everywhere',
  '4 Skilled hobbyist: solid in places, weak links obvious',
  '5 Advanced: few structural errors, finish and consistency lacking',
  '6 Semi-pro: good work, still below published standard',
  '7 Commission-ready: clients would pay for it',
  '8 Industry pro: at the level of published anime and game art',
  '9 Senior pro: lead-artist quality',
  '10 Master: top of the industry',
];

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
    industry: {
      type: 'array',
      items: { type: 'object', properties: { area: { type: 'string', enum: C.AREAS.map((a) => a.id) }, level: { type: 'integer' }, why: { type: 'string' } }, required: ['area', 'level', 'why'], additionalProperties: false },
    },
    nextStep: { type: 'string' },
    revisitLesson: { type: ['string', 'null'] },
  };
  if (L.marks) {
    // Correction overlays drawn over the student's drawing: regions highlight
    // problem areas, lines and arrows show the correction.
    props.marks = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['region', 'line', 'arrow', 'circle'] },
          points: { type: 'array', items: point },
          note: { type: 'string' },
          fix: { type: 'integer' },
          severity: { type: 'string', enum: ['major', 'minor'] },
        },
        required: ['kind', 'points', 'note', 'fix', 'severity'],
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

// Everything a critique needs, for the API and for Claude.ai alike.
// drawing: DB row; files: { drawing, reference?, layers?: [{ name, buf }] }; clip: parsed clip info
async function prepare(drawing, files, { selfScores, level = 'standard', clip = null } = {}) {
  const L = LEVELS[level] ?? LEVELS.standard;
  level = LEVELS[level] ? level : 'standard';
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
    `For industry: rate 1–4 skill areas this drawing really shows (always include "${area.id}"), each with a one-sentence reason naming what holds it below the next level. Area ids: ${C.AREAS.map((a) => `${a.id} (${a.name})`).join(', ')}. The scale:\n${INDUSTRY.join('\n')}`,
    selfScores ? `The student rated themselves: ${JSON.stringify(selfScores)}. Say plainly where your view differs, to help them calibrate.` : '',
    `For revisitLesson, use one of these lesson ids or null: ${lessonIds.join(', ')}.`,
    clip?.workMinutes ? `Clip Studio recorded ${clip.workMinutes} minutes of work on this file.` : '',
    level !== 'quick' ? layerList : '',
    L.marks
      ? `For marks: highlight the problem areas on the final drawing, ${level === 'quick' ? '1–3' : '2–8'} marks. Use "region" to box a problem area (2 points: top-left and bottom-right corners, tight around the problem), "line" to show a corrected line or angle, "arrow" to show where something should move, "circle" around a small spot (2 points: centre, a point on the edge). Every fix gets at least one region. "fix" is the 0-based index of the fix it belongs to; "severity" is major (hurts the whole drawing) or minor; "note" says in a few words what's wrong there.`
      : '',
    L.process ? 'For process: judge the construction you can see in the sketch layers, how the layers are organised (separate sketch/lines/flats, clipped shading, sensible names), how the work time fits the result, and give one workflow tip for Clip Studio.' : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const images = [];
  if (files.reference) images.push({ label: 'the reference', buf: await jpeg(files.reference, L.refImage) });
  images.push({ label: 'the final drawing (with the coordinate grid)', buf: await gridJpeg(files.drawing, L.image) });
  for (const l of layers) images.push({ label: `the layer "${l.name}" on its own`, buf: await jpeg(l.buf, 1024, { flatten: true }) });
  const order = `Images in order: ${images.map((i) => i.label).join(', ')}.`;
  return { L, level, area, criteria, layers, images, context, order, schema: schemaFor(level, criteria) };
}

// Clean up a critique (from the API or pasted from Claude.ai).
function normalize(parsed, p, extra) {
  const clamp = (n) => Math.max(0, Math.min(1, Number(n) || 0));
  const str = (s) => (typeof s === 'string' ? s.trim() : '');
  const out = {
    summary: str(parsed.summary),
    works: (Array.isArray(parsed.works) ? parsed.works : []).map(str).filter(Boolean).slice(0, 6),
    fixes: (Array.isArray(parsed.fixes) ? parsed.fixes : []).slice(0, p.L.fixes).map((f) => ({ title: str(f?.title), detail: str(f?.detail), x: clamp(f?.x), y: clamp(f?.y) })).filter((f) => f.title || f.detail),
    scores: {},
    industry: [],
    nextStep: str(parsed.nextStep),
    revisitLesson: parsed.revisitLesson && C.LESSON.has(parsed.revisitLesson) ? parsed.revisitLesson : null,
  };
  for (const c of p.criteria) {
    const v = Number(parsed.scores?.[c.id]);
    if (Number.isFinite(v)) out.scores[c.id] = Math.max(1, Math.min(5, Math.round(v)));
  }
  const seen = new Set();
  for (const r of Array.isArray(parsed.industry) ? parsed.industry : []) {
    const v = Number(r?.level);
    if (!C.AREA[r?.area] || !Number.isFinite(v) || seen.has(r.area)) continue;
    seen.add(r.area);
    out.industry.push({ area: r.area, level: Math.max(1, Math.min(10, Math.round(v))), why: str(r.why) });
  }
  if (p.L.marks) {
    out.marks = (Array.isArray(parsed.marks) ? parsed.marks : [])
      .slice(0, 10)
      .map((m) => ({
        kind: ['region', 'line', 'arrow', 'circle'].includes(m?.kind) ? m.kind : 'region',
        points: (Array.isArray(m?.points) ? m.points : []).slice(0, 2).map((pt) => ({ x: clamp(pt?.x), y: clamp(pt?.y) })),
        note: str(m?.note),
        fix: Number.isInteger(m?.fix) ? m.fix : -1,
        severity: m?.severity === 'minor' ? 'minor' : 'major',
      }))
      .filter((m) => m.points.length === 2);
  }
  if (p.L.process && parsed.process) out.process = { construction: str(parsed.process.construction), organisation: str(parsed.process.organisation), time: str(parsed.process.time), workflowTip: str(parsed.process.workflowTip) };
  if (!out.summary && !out.fixes.length) throw new Error('That doesn’t look like a critique: no summary and no fixes found.');
  return { ...out, level: p.level, layersSeen: p.layers.map((l) => l.name), area: p.area.id, at: Date.now(), ...extra };
}

const asBlock = (img) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.buf.toString('base64') } });

async function critique(drawing, files, opts = {}) {
  const p = await prepare(drawing, files, opts);
  const content = [...p.images.map(asBlock), { type: 'text', text: `${p.context}\n\n${p.order}` }];
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: p.L.maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: p.L.effort, format: { type: 'json_schema', schema: p.schema } },
    messages: [{ role: 'user', content }],
  });

  const cost = (response.usage?.input_tokens ?? 0) * PRICE_IN + (response.usage?.output_tokens ?? 0) * PRICE_OUT;
  if (response.stop_reason === 'refusal') {
    return { result: { refused: true, level: p.level, at: Date.now(), message: 'Claude declined to review this drawing (it does this for some nude or explicit pictures). Use the self-review checklist and the overlay instead.' }, cost };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The critique came back incomplete. Try again.');
  }
  return { result: normalize(parsed, p, { model: response.model, source: 'api' }), cost };
}

// ---- Critiques in Claude.ai (your own subscription) ------------------------------------------
// Atelier writes the same instructions as a prompt to paste into Claude.ai,
// with the images to attach, and reads the JSON answer you paste back.

async function manualPrompt(drawing, files, opts = {}) {
  const p = await prepare(drawing, files, opts);
  const prompt = [
    SYSTEM,
    '---',
    `I've attached ${p.images.length} image${p.images.length === 1 ? '' : 's'}. ${p.order}`,
    p.context,
    '---',
    'Answer with ONLY one JSON object (no text before or after it), exactly in this shape (JSON Schema):',
    JSON.stringify(p.schema),
  ].join('\n\n');
  return { prompt, images: p.images, level: p.level };
}

function parsePasted(text) {
  const raw = String(text ?? '').replace(/```(?:json)?/gi, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON found. Paste Claude’s whole answer (the part in curly braces).');
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('The JSON is incomplete or broken. Copy Claude’s whole answer again (use the copy button under it).');
  }
}

async function manualResult(drawing, files, opts, text) {
  const p = await prepare(drawing, files, opts);
  return normalize(parsePasted(text), p, { source: 'claude.ai' });
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
const PRO_LEVELS = INDUSTRY.join('; ');

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
    system: 'You are an experienced portfolio reviewer and art director for anime and game illustration. Be honest and calibrated: judge against published professional work, name the real weaknesses plainly, and never inflate scores to be kind.',
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  const cost = (response.usage?.input_tokens ?? 0) * PRICE_IN + (response.usage?.output_tokens ?? 0) * PRICE_OUT;
  if (response.stop_reason === 'refusal') return { result: { refused: true, at: Date.now() }, cost };
  const parsed = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  for (const k of Object.keys(parsed.scores ?? {})) parsed.scores[k] = Math.max(1, Math.min(10, Math.round(parsed.scores[k])));
  return { result: { ...parsed, at: Date.now() }, cost };
}

module.exports = { critique, manualPrompt, manualResult, INDUSTRY, portfolioCritique, available, spentThisMonth, defaultLevel, LEVELS, PRO_RUBRIC, PRO_LEVELS, MODEL };
