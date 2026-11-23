// The whole curriculum: stages, lessons, the adult track, warm-ups, skill
// checks and practice briefs. Checked once at startup so a typo in a lesson
// file shows up immediately.
const { AREAS, AREA } = require('./areas');
const { STAGES, ADULT_UNITS, SKILL_CHECK } = require('./stages');

const MAIN = [...require('./s00-s01'), ...require('./s02-s03'), ...require('./s04-s05'), ...require('./s06-s07'), ...require('./s08-s10')];
const ADULT = require('./adult');

const LESSONS = [...MAIN, ...ADULT];
const LESSON = new Map(LESSONS.map((l) => [l.id, l]));
const MAIN_ORDER = MAIN.map((l) => l.id);

// Warm-ups rotate daily; later stages add their own.
const WARMUPS = [
  { id: 'w-lines', fromStage: 0, title: 'Ghosted lines', prompt: 'Fill half a page with ghosted straight lines in all directions, one stroke each.', minutes: 5 },
  { id: 'w-ellipses', fromStage: 1, title: 'Ellipses', prompt: 'Two rows of ellipses in different degrees, going around 2–3 times each.', minutes: 5 },
  { id: 'w-boxes', fromStage: 1, title: 'Boxes', prompt: 'Five boxes from imagination in 2-point perspective, drawn through.', minutes: 5 },
  { id: 'w-curves', fromStage: 1, title: 'Curves', prompt: 'Long C- and S-curves from the shoulder, smooth and confident.', minutes: 5 },
  { id: 'w-gestures', fromStage: 2, title: 'Quick gestures', prompt: '8 gestures at 30 seconds from references.', minutes: 5, refs: { tags: ['full_body', 'dynamic_pose'] }, practice: { seconds: 30, count: 8 } },
  { id: 'w-mannequins', fromStage: 2, title: 'Mannequins', prompt: 'Three quick mannequins from imagination.', minutes: 5 },
  { id: 'w-hands', fromStage: 3, title: 'Hand boxes', prompt: 'Six hands as palm boxes with finger cylinders.', minutes: 5 },
  { id: 'w-heads', fromStage: 4, title: 'Head constructions', prompt: 'Six constructed heads at different angles, no features.', minutes: 5 },
  { id: 'w-folds', fromStage: 5, title: 'Fold types', prompt: 'Draw three fold types from memory: pipe, zigzag, spiral.', minutes: 5 },
  { id: 'w-values', fromStage: 6, title: 'Value spheres', prompt: 'Three lit spheres with different light directions.', minutes: 5 },
];

// Practice briefs for Stage 10 (like a client would write them).
const BRIEFS = [
  'A key visual for a fantasy light novel: the heroine on a cliff at sunrise, sword in hand, cape blowing. Portrait format, room for a title at the top.',
  'A VTuber design: an energetic idol with a space theme. Front view full body, three expressions, a colour palette with hex codes.',
  'A trading card illustration: a dark mage casting a spell, dramatic underlighting, square format, the character fills 60% of the card.',
  'A cosy illustration for a café menu: a character serving coffee, warm afternoon light, landscape format.',
  'A game character portrait set: one character in four moods (neutral, happy, angry, sad), bust shots, consistent framing.',
];

// Sanity check at startup.
for (const l of LESSONS) {
  if (l.area && !AREA[l.area]) throw new Error(`Lesson ${l.id}: unknown area ${l.area}`);
  if (l.stage == null && !l.unit) throw new Error(`Lesson ${l.id}: no stage or unit`);
}
if (LESSON.size !== LESSONS.length) throw new Error('Duplicate lesson ids');

module.exports = { AREAS, AREA, STAGES, ADULT_UNITS, SKILL_CHECK, LESSONS, LESSON, MAIN, ADULT, MAIN_ORDER, WARMUPS, BRIEFS };
