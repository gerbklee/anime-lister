// The whole curriculum: stages, lessons, the adult track, warm-ups, skill
// checks and practice briefs. Checked once at startup so a typo in a lesson
// file shows up immediately.
const { AREAS, AREA } = require('./areas');
const { STAGES, ADULT_UNITS, SKILL_CHECK } = require('./stages');

// Main path in stage order (a stable sort keeps the order within each stage).
const MAIN = [...require('./s00-s01'), ...require('./s02-s03'), ...require('./s04-s05'), ...require('./s06-s07'), ...require('./s08-s10'), ...require('./s09-s11')]
  .map((l, i) => [l, i])
  .sort((a, b) => a[0].stage - b[0].stage || a[1] - b[1])
  .map(([l]) => l);
const ADULT = require('./adult');
// Optional tracks (character design, manga, business, key visuals).
const { TRACKS, TRACK_LESSONS } = require('./tracks');

const LESSONS = [...MAIN, ...ADULT, ...TRACK_LESSONS];
const LESSON = new Map(LESSONS.map((l) => [l.id, l]));
const MAIN_ORDER = MAIN.map((l) => l.id);

// Warm-ups rotate daily; later stages add their own.
const WARMUPS = [
  { id: 'w-lines', lesson: 's1-lines', fromStage: 0, title: 'Ghosted lines', prompt: 'Fill half a page with ghosted straight lines in all directions, one stroke each.', minutes: 5 },
  { id: 'w-ellipses', lesson: 's1-ellipses', fromStage: 1, title: 'Ellipses', prompt: 'Two rows of ellipses in different degrees, going around 2–3 times each.', minutes: 5 },
  { id: 'w-boxes', lesson: 's1-persp23', fromStage: 1, title: 'Boxes', prompt: 'Five boxes from imagination in 2-point perspective, drawn through.', minutes: 5 },
  { id: 'w-curves', lesson: 's1-lines', fromStage: 1, title: 'Curves', prompt: 'Long C- and S-curves from the shoulder, smooth and confident.', minutes: 5 },
  { id: 'w-gestures', lesson: 's2-gesture', fromStage: 2, title: 'Quick gestures', prompt: '8 gestures at 30 seconds from references.', minutes: 5, refs: { tags: ['full_body', 'dynamic_pose'] }, practice: { seconds: 30, count: 8 } },
  { id: 'w-master', lesson: 's9-masters', fromStage: 2, title: 'Master copy', prompt: 'Copy a small part of an official anime illustration freehand (a face, a hand, a fold) for 10 minutes, then name two things the artist did on purpose. A different artist every time: mixing styles teaches you what makes each one work.', minutes: 10, refs: { tags: ['official_art'] } },
  { id: 'w-mannequins', lesson: 's2-mannequin', fromStage: 2, title: 'Mannequins', prompt: 'Three quick mannequins from imagination.', minutes: 5 },
  { id: 'w-hands', lesson: 's3-hands', fromStage: 3, title: 'Hand boxes', prompt: 'Six hands as palm boxes with finger cylinders.', minutes: 5 },
  { id: 'w-heads', lesson: 's4-head', fromStage: 4, title: 'Head constructions', prompt: 'Six constructed heads at different angles, no features.', minutes: 5 },
  { id: 'w-folds', lesson: 's5-folds', fromStage: 5, title: 'Fold types', prompt: 'Draw three fold types from memory: pipe, zigzag, spiral.', minutes: 5 },
  { id: 'w-values', lesson: 's6-values', fromStage: 6, title: 'Value spheres', prompt: 'Three lit spheres with different light directions.', minutes: 5 },
];

// Practice briefs for Stage 10 (like a client would write them).
const BRIEFS = [
  'A key visual for a fantasy light novel: the heroine on a cliff at sunrise, sword in hand, cape blowing. Portrait format, room for a title at the top.',
  'A VTuber design: an energetic idol with a space theme. Front view full body, three expressions, a colour palette with hex codes.',
  'A trading card illustration: a dark mage casting a spell, dramatic underlighting, square format, the character fills 60% of the card.',
  'A cosy illustration for a café menu: a character serving coffee, warm afternoon light, landscape format.',
  'A game character portrait set: one character in four moods (neutral, happy, angry, sad), bust shots, consistent framing.',
];

// Clip Studio guides each lesson uses (shown with the lesson, in order).
const CSP = require('./csp');
const LESSON_GUIDES = {
  's0-how': ['checking'],
  's0-csp': ['setup-canvas', 'layers', 'brushes', 'shortcuts'],
  's0-tablet': ['pressure', 'shortcuts'],
  's0-routine': ['timelapse'],
  's1-lines': ['pressure'],
  's1-ellipses': ['rulers', 'smart-shape'],
  's1-forms': ['layers', 'checking'],
  's1-persp1': ['rulers'],
  's1-persp23': ['rulers'],
  's1-objects': ['transform', 'reference'],
  's1-observe': ['reference', 'checking'],
  's2-gesture': ['reference', 'layers'],
  's2-proportions': ['3d-figure', 'layers'],
  's2-mannequin': ['3d-figure'],
  's2-balance': ['checking'],
  's2-foreshortening': ['3d-figure'],
  's2-project': ['3d-figure', 'transform', 'timelapse'],
  's3-torso': ['3d-figure'],
  's3-arms': ['3d-figure'],
  's3-legs': ['3d-figure'],
  's3-hands': ['3d-hand'],
  's3-feet': ['3d-figure'],
  's3-neck': ['3d-figure'],
  's3-project': ['transform', 'checking'],
  's4-head': ['3d-figure', 'symmetry'],
  's4-eyes': ['symmetry', 'vector-lines'],
  's4-features': ['symmetry'],
  's4-expressions': ['transform'],
  's4-hair': ['vector-lines'],
  's4-project': ['vector-lines', 'checking'],
  's5-folds': ['reference'],
  's5-weight': ['3d-figure', 'reference'],
  's5-wrap': ['reference'],
  's5-costume': ['symmetry', 'colour'],
  's5-project': ['vector-lines', 'checking'],
  's6-values': ['checking', 'correction'],
  's6-form-shading': ['clipping', 'flats'],
  's6-light-sources': ['blending', '3d-figure'],
  's6-cel': ['flats', 'clipping'],
  's6-soft': ['brushes', 'blending'],
  's6-project': ['flats', 'clipping', 'correction'],
  's7-hsv': ['colour', 'checking'],
  's7-temperature': ['blending', 'clipping'],
  's7-palettes': ['colour', 'correction'],
  's7-anime-colour': ['flats', 'clipping', 'blending'],
  's7-project': ['flats', 'clipping', 'correction'],
  's8-thumbnails': ['layers', 'transform'],
  's8-focal': ['checking', 'correction'],
  's8-camera': ['3d-figure', 'rulers'],
  's8-backgrounds': ['rulers', 'smart-shape'],
  's8-project': ['rulers', '3d-figure', 'timelapse'],
  's9-lineart': ['vector-lines', 'pressure'],
  's9-polish': ['correction', 'blending'],
  's9-masters': ['reference', 'checking'],
  's9-style': ['brushes', 'colour'],
  's9-project': ['vector-lines', 'flats', 'clipping', 'blending'],
  's10-workflow': ['shortcuts', 'layers', 'timelapse'],
  's10-design': ['colour', 'symmetry'],
  's10-briefs': ['3d-figure', 'correction'],
  's10-speed': ['shortcuts', 'transform'],
  's10-portfolio': ['timelapse'],
  'a1-life': ['reference', 'checking'],
  'a1-soft-forms': ['3d-figure'],
  'a2-adult': ['3d-figure'],
  'a3-curves': ['3d-figure', 'transform'],
  'a3-camera': ['3d-figure'],
  'a4-expression': ['symmetry', 'transform'],
  'a5-skin': ['clipping', 'blending'],
  'a6-swim': ['flats', 'clipping'],
  'a6-sheer': ['blending', 'clipping'],
  'a7-nude': ['correction', 'checking'],
  'a8-portfolio': ['timelapse'],
  'bg-interiors': ['rulers', 'backgrounds-3d'],
  'bg-streets': ['rulers', 'backgrounds-3d'],
  'bg-nature': ['brushes', 'clipping'],
  'bg-sky': ['correction', 'blending'],
  'bg-integrate': ['correction', 'checking'],
  'mx-metal-glass': ['blending', 'clipping'],
  'mx-hair-eyes': ['clipping', 'blending'],
  'mx-effects': ['effects', 'blending'],
  'mx-weather': ['effects', 'brushes'],
  'ms-staging': ['3d-figure', 'checking'],
  'ms-contact': ['3d-figure', '3d-hand'],
  'ms-group': ['3d-figure', 'transform'],
  'ms-story': ['layers', 'checking'],
  'ms-project': ['timelapse', 'correction'],
  'cd-silhouette': ['layers', 'checking'],
  'cd-costume': ['colour', 'symmetry'],
  'cd-turnaround': ['3d-figure', 'rulers'],
  'cd-sheet': ['colour', 'layers'],
  'cd-vtuber': ['layers', 'timelapse'],
  'mg-panels': ['frames'],
  'mg-storytelling': ['frames', '3d-figure'],
  'mg-tone': ['tones', 'vector-lines'],
  'mg-lettering': ['balloons'],
  'mg-short': ['frames', 'tones', 'balloons'],
  'biz-pricing': ['timelapse'],
  'biz-audience': ['timelapse'],
  'biz-clients': ['layers'],
  'biz-files': ['setup-canvas', 'correction'],
  'kv-poses': ['3d-figure', 'transform'],
  'kv-layers': ['effects', 'layers'],
  'kv-polish': ['correction', 'effects'],
  'kv-piece': ['effects', 'timelapse'],
};
for (const l of LESSONS) l.cspGuides = LESSON_GUIDES[l.id] ?? [];

// Lesson detail: a step-by-step method, a deeper explanation, and for every
// exercise the sessions it needs (on separate days), steps, success criteria
// and a worked example. Kept in details/ so the lesson files stay readable.
const DETAILS = Object.assign({}, ...['d-s0-s1', 'd-s2-s3', 'd-s4-s5', 'd-s6-s7', 'd-s8-s10', 'd-adult'].map((f) => require(`./details/${f}`)));
const imageSearch = (q) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;
for (const l of LESSONS) {
  // Newer lessons carry their detail inline (method, more, and per exercise).
  const d = DETAILS[l.id] ?? (l.method ? { method: l.method, more: l.more, ex: Object.fromEntries(l.exercises.map((e) => [e.id, e])) } : null);
  if (!d) throw new Error(`Lesson ${l.id}: no details`);
  if (!d.method?.length) throw new Error(`Lesson ${l.id}: no method`);
  l.method = d.method;
  l.more = d.more ?? [];
  for (const e of l.exercises) {
    const x = d.ex?.[e.id];
    if (!x || !x.sessions || !x.steps?.length || !x.success?.length || !x.example) throw new Error(`Exercise ${l.id}/${e.id}: incomplete details`);
    Object.assign(e, { sessions: x.sessions, steps: x.steps, success: x.success, example: x.example, exampleUrl: x.search ? imageSearch(x.search) : null });
  }
  for (const id of Object.keys(d.ex ?? {})) if (!l.exercises.some((e) => e.id === id)) throw new Error(`Details for unknown exercise ${l.id}/${id}`);
}
for (const id of Object.keys(DETAILS)) if (!LESSON.has(id)) throw new Error(`Details for unknown lesson ${id}`);

// Sanity check at startup.
for (const [id, guides] of Object.entries(LESSON_GUIDES)) {
  if (!LESSON.has(id)) throw new Error(`Clip Studio guides for unknown lesson ${id}`);
  for (const g of guides) if (!CSP.GUIDE.has(g)) throw new Error(`Lesson ${id}: unknown Clip Studio guide ${g}`);
}
for (const l of LESSONS) {
  if (l.area && !AREA[l.area]) throw new Error(`Lesson ${l.id}: unknown area ${l.area}`);
  if (l.stage == null && !l.unit && !l.track) throw new Error(`Lesson ${l.id}: no stage, unit or track`);
  if (l.track && !TRACKS.some((t) => t.id === l.track)) throw new Error(`Lesson ${l.id}: unknown track ${l.track}`);
}
if (LESSON.size !== LESSONS.length) throw new Error('Duplicate lesson ids');
for (const w of WARMUPS) if (!LESSON.has(w.lesson)) throw new Error(`Warm-up ${w.id}: unknown lesson ${w.lesson}`);

module.exports = { AREAS, AREA, STAGES, ADULT_UNITS, SKILL_CHECK, LESSONS, LESSON, MAIN, ADULT, TRACKS, TRACK_LESSONS, MAIN_ORDER, WARMUPS, BRIEFS, CSP_GUIDES: CSP.GUIDES, CSP_GUIDE: CSP.GUIDE, CSP_GROUPS: CSP.GROUPS };
