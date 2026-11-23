// The stages of the path. `tree` is what focus blocks grow while you're in this
// stage; `building` appears in your valley when you finish it.

// hours: focused practice needed in the stage before the next one opens
// (about 1,200 hours in total: 2–4 years at 1–2 hours a day). months: the
// rough timeline at about 9 hours a week.
const STAGES = [
  {
    id: 0,
    title: 'Setting up',
    subtitle: 'Your tools, your desk, your first marks',
    months: [0, 0.1],
    hours: 4,
    goal: 'Clip Studio set up for learning, a drawing routine planned, and your first skill check drawn.',
    tree: 'sapling',
    building: { id: 'campfire', name: 'Campfire' },
  },
  {
    id: 1,
    title: 'Foundations',
    subtitle: 'Lines, shapes, forms and perspective',
    months: [0.1, 2.5],
    hours: 90,
    goal: 'Draw confident lines, solid boxes, cylinders and spheres, and simple objects in 1-, 2- and 3-point perspective.',
    tree: 'birch',
    building: { id: 'hut', name: 'Drawing hut' },
  },
  {
    id: 2,
    title: 'The figure',
    subtitle: 'Gesture, proportion and the mannequin',
    months: [2.5, 5],
    hours: 110,
    goal: 'Capture a pose in 30 seconds to 2 minutes, build it into a 3D mannequin, and keep anime proportions consistent.',
    tree: 'pine',
    building: { id: 'well', name: 'Well' },
  },
  {
    id: 3,
    title: 'Anatomy',
    subtitle: 'The body as it really works',
    months: [5, 10],
    hours: 170,
    goal: 'Draw torso, arms, legs, hands and feet from imagination with believable structure, then simplify for anime.',
    tree: 'oak',
    building: { id: 'studio', name: 'Studio' },
  },
  {
    id: 4,
    title: 'Heads & faces',
    subtitle: 'Construction, features and expression',
    months: [10, 13],
    hours: 150,
    goal: 'Draw a character’s head from any angle and any emotion, keeping them on-model.',
    tree: 'maple',
    building: { id: 'bridge', name: 'Bridge over the river' },
  },
  {
    id: 5,
    title: 'Clothing',
    subtitle: 'Folds, fabric and costume',
    months: [13, 16],
    hours: 100,
    goal: 'Dress any pose convincingly: folds that follow tension, fabric weight, and layered costumes.',
    tree: 'willow',
    building: { id: 'atelier', name: 'Atelier' },
  },
  {
    id: 6,
    title: 'Light & value',
    subtitle: 'Making forms turn in light',
    months: [16, 19],
    hours: 110,
    goal: 'Light a character from any direction with clear value groups, cel shading and soft rendering.',
    tree: 'ginkgo',
    building: { id: 'windmill', name: 'Windmill' },
  },
  {
    id: 7,
    title: 'Colour',
    subtitle: 'Palettes, temperature and mood',
    months: [19, 22],
    hours: 110,
    goal: 'Choose and apply palettes on purpose, shifting temperature between light and shadow.',
    tree: 'cypress',
    building: { id: 'tower', name: 'Colour tower' },
  },
  {
    id: 8,
    title: 'Composition',
    subtitle: 'Framing your character pieces',
    months: [22, 25],
    hours: 110,
    goal: 'Plan illustrations with thumbnails: strong focal point, camera angle, and a simple supporting background.',
    tree: 'plane',
    building: { id: 'gallery', name: 'Gallery' },
  },
  {
    id: 9,
    title: 'Rendering & style',
    subtitle: 'Polish, finish and your own voice',
    months: [25, 28],
    hours: 130,
    goal: 'Take a sketch to a finished, polished illustration, and start forming a style of your own.',
    tree: 'magnolia',
    building: { id: 'belltower', name: 'Bell tower' },
  },
  {
    id: 10,
    title: 'Professional',
    subtitle: 'Workflow, briefs and portfolio',
    months: [28, 32],
    hours: 140,
    goal: 'Work like a pro: reliable workflow, design sheets, client briefs, and a portfolio of 8–12 finished pieces.',
    tree: 'sakura',
    building: { id: 'museum', name: 'Museum' },
  },
];

// The adult track runs alongside the main path; each unit opens with a main stage.
const ADULT_UNITS = [
  { id: 'A1', title: 'Life drawing', subtitle: 'The nude figure, from real models', opensWith: 2, hours: 30 },
  { id: 'A2', title: 'Adult proportions', subtitle: 'Characters who read clearly as adults', opensWith: 2, hours: 30 },
  { id: 'A3', title: 'Pin-up posing', subtitle: 'Appeal, curves and camera', opensWith: 3, hours: 30 },
  { id: 'A4', title: 'Sensual expression', subtitle: 'Eyes, mouth, hands and mood', opensWith: 4, hours: 30 },
  { id: 'A5', title: 'Skin & light', subtitle: 'Soft rendering and glow', opensWith: 6, hours: 30 },
  { id: 'A6', title: 'Clothing & reveal', subtitle: 'Swimwear, lingerie, sheer and wet fabric', opensWith: 5, hours: 30 },
  { id: 'A7', title: 'Nude illustration', subtitle: 'Full pieces, cropping, implied vs shown', opensWith: 8, hours: 30 },
  { id: 'A8', title: 'Adult portfolio', subtitle: 'Finished pin-up and nude fan art', opensWith: 9, hours: 40 },
];

// Every four weeks: the same four prompts, so your progress is comparable.
const SKILL_CHECK = [
  { id: 'box', area: 'perspective', title: 'A box in 2-point perspective', prompt: 'From imagination: one box, corner towards you, both vanishing points off the page. Draw through it (show the hidden edges). 5 minutes.', minutes: 5 },
  { id: 'head', area: 'face', title: 'A head in three-quarter view', prompt: 'From memory, no reference: one of your favourite characters, head turned three-quarters, looking slightly up. 10 minutes.', minutes: 10 },
  { id: 'figure', area: 'gesture', title: 'A 2-minute figure', prompt: 'One standing or action pose from the reference shown. Two minutes, gesture first, then structure.', minutes: 2, refs: { tags: ['full_body', 'dynamic_pose'] } },
  { id: 'hand', area: 'anatomy', title: 'A hand', prompt: 'One hand from the reference shown, at least as large as your palm on screen. 10 minutes.', minutes: 10, refs: { tags: ['hand_focus'] } },
];

module.exports = { STAGES, ADULT_UNITS, SKILL_CHECK };
