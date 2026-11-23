// Drawing critiques from Claude (needs ANTHROPIC_API_KEY on the server).
//
// Claude gets your drawing, the reference (if any), the lesson's key points and
// the area's scoring guide, and answers in a fixed structure: what works, the
// 2-3 most important fixes (with a spot on the drawing), scores per criterion,
// one concrete next step, and which lesson to revisit. Feedback follows Hattie
// & Timperley: where you're going, how you're doing, what to do next.
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const { db } = require('../db');
const C = require('./curriculum');

const MODEL = 'claude-opus-5-5';
// Claude Opus 5.5 prices in dollars per token (input $4 / output $20 per million).
const PRICE_IN = 4 / 1e6;
const PRICE_OUT = 20 / 1e6;

const available = () => !!process.env.ANTHROPIC_API_KEY;
let client = null;
const getClient = () => (client ??= new Anthropic());

const q = {
  spentSince: db.prepare(`SELECT COALESCE(SUM(critique_cost), 0) AS d FROM atelier_drawings WHERE user_id = ? AND json_extract(critique, '$.at') >= ?`),
};

function monthStart() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
// Dollars spent on critiques this month.
const spentThisMonth = (userId) => q.spentSince.get(userId, monthStart()).d;

async function asImage(buf) {
  const out = await sharp(buf, { failOn: 'none' }).rotate().resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: out.toString('base64') } };
}

const SYSTEM = `You are a warm but honest drawing teacher in an online art school for anime-style illustration. A student uploads a drawing for one exercise. Your feedback must help them improve next time.
Rules:
- Be specific to THIS drawing: point at real places in it.
- Start from what genuinely works.
- Then give only the 2-3 most important fixes, ordered by impact. Each fix says what to change and how.
- Score each criterion 1-5 for this student's stage: 1 not yet, 2 emerging, 3 working, 4 solid, 5 confident. Be calibrated, not generous.
- End with exactly one concrete next step they can do in the next session.
- If the lesson doesn't match what was drawn, critique what was drawn.
- For each fix, give the approximate location on the student's drawing as x and y between 0 and 1 (0,0 top left).
- Keep it concise and encouraging; no generic praise.`;

// drawing: DB row; files: { drawing: Buffer, reference?: Buffer }
async function critique(drawing, files, { selfScores } = {}) {
  const lesson = drawing.lesson_id ? C.LESSON.get(drawing.lesson_id) : null;
  const exercise = lesson?.exercises.find((e) => e.id === drawing.exercise_id) ?? null;
  const area = C.AREA[drawing.area ?? lesson?.area ?? 'form'] ?? C.AREA.form;
  const criteria = area.criteria;
  const lessonIds = C.LESSONS.filter((l) => l.area === area.id).map((l) => `${l.id} (${l.title})`);

  const schema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      works: { type: 'array', items: { type: 'string' } },
      fixes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, detail: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } },
          required: ['title', 'detail', 'x', 'y'],
          additionalProperties: false,
        },
      },
      scores: {
        type: 'object',
        properties: Object.fromEntries(criteria.map((c) => [c.id, { type: 'integer' }])),
        required: criteria.map((c) => c.id),
        additionalProperties: false,
      },
      nextStep: { type: 'string' },
      revisitLesson: { type: ['string', 'null'] },
    },
    required: ['summary', 'works', 'fixes', 'scores', 'nextStep', 'revisitLesson'],
    additionalProperties: false,
  };

  const context = [
    `Exercise type: ${drawing.kind}.`,
    lesson ? `Lesson: ${lesson.title} (stage ${lesson.stage ?? lesson.unit}). Why it matters: ${lesson.why}` : 'Free drawing.',
    exercise ? `Exercise: ${exercise.title}: ${exercise.prompt}` : drawing.title ? `Title: ${drawing.title}` : '',
    lesson ? `Key points of the lesson:\n- ${lesson.points.join('\n- ')}` : '',
    lesson?.mistakes?.length ? `Common mistakes to look for:\n- ${lesson.mistakes.join('\n- ')}` : '',
    `Score these criteria (area: ${area.name}):\n${criteria.map((c) => `- ${c.id}: ${c.name} – ${c.hint}`).join('\n')}`,
    selfScores ? `The student rated themselves: ${JSON.stringify(selfScores)}. Mention briefly where your view differs, to help them calibrate.` : '',
    `For revisitLesson, use one of these lesson ids or null: ${lessonIds.join(', ')}.`,
    files.reference ? 'The FIRST image is the reference they worked from; the SECOND image is the student’s drawing.' : 'The image is the student’s drawing.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const content = [];
  if (files.reference) content.push(await asImage(files.reference));
  content.push(await asImage(files.drawing));
  content.push({ type: 'text', text: context });

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });

  const cost = (response.usage?.input_tokens ?? 0) * PRICE_IN + (response.usage?.output_tokens ?? 0) * PRICE_OUT;
  if (response.stop_reason === 'refusal') {
    return { result: { refused: true, at: Date.now(), message: 'Claude declined to review this drawing (it does this for some nude or explicit pictures). Use the self-review checklist and the overlay instead.' }, cost };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The critique came back incomplete. Try again.');
  }
  const clamp = (n) => Math.max(0, Math.min(1, Number(n) || 0));
  parsed.fixes = (parsed.fixes ?? []).slice(0, 4).map((f) => ({ ...f, x: clamp(f.x), y: clamp(f.y) }));
  for (const k of Object.keys(parsed.scores ?? {})) parsed.scores[k] = Math.max(1, Math.min(5, Math.round(parsed.scores[k])));
  if (parsed.revisitLesson && !C.LESSON.has(parsed.revisitLesson)) parsed.revisitLesson = null;
  return { result: { ...parsed, area: area.id, at: Date.now(), model: response.model }, cost };
}

module.exports = { critique, available, spentThisMonth, MODEL };
