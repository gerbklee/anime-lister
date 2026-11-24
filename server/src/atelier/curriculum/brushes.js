// The Atelier brush kit: the brushes used for the whole path, from the first
// line drill to the portfolio. It starts with three tools and grows as the
// stages teach what the new ones are for. Built-in brushes ship with Clip
// Studio Paint; the others are free downloads from CLIP STUDIO ASSETS
// (ids checked against the store).
//
// A brush: { id, name, slot, where, asset?, use, setup[], how[], avoid[],
//            alt?: [{ name, asset?, note }], from: stage | null, track? }

const asset = (id, title, by) => ({ id, title, by: by ?? null, url: `https://assets.clip-studio.com/en-us/detail?id=${id}` });
const ASSETS_HOME = 'https://assets.clip-studio.com/en-us/';

const SLOTS = [
  { id: 'sketch', name: 'Sketch & construction' },
  { id: 'line', name: 'Line art' },
  { id: 'erase', name: 'Erasing' },
  { id: 'colour', name: 'Flat colour' },
  { id: 'paint', name: 'Light, value & painting' },
  { id: 'world', name: 'Backgrounds & effects' },
  { id: 'manga', name: 'Manga pages' },
];

const BRUSHES = [
  // ---- Sketch & construction --------------------------------------------------------------------
  {
    id: 'su-cream',
    name: 'SU-Cream Pencil',
    slot: 'sketch',
    where: 'Pencil (Sketch) tool, after you download it',
    asset: asset(1761353, 'SU-Cream Pencil'),
    from: 0,
    use: 'Every sketch on the path: line drills’ ghosting, gesture, construction, studies, thumbnails, roughs and all skill checks. One of the most downloaded sketch pencils on Clip Studio Assets: a soft, slightly creamy graphite feel whose texture shows more the bigger you make it.',
    setup: [
      'Size 10–20 px for construction and studies on a 3000 × 2000 canvas; 30–50 px for gesture and thumbnails.',
      'Stabilization 3–5 (Tool property). Leave pressure on for both size and opacity.',
      'Draw in dark blue or dark grey on your Sketch layer, so lines on the layer above stand out.',
      'Tool property menu → Register to initial settings, so “Reset to initial settings” brings your sizes back.',
    ],
    how: [
      'Hold the pen loosely and keep strokes light while you search for a shape; press harder only for the line you decide on. Light searching lines plus one confident line is the whole idea of sketching.',
      'Don’t erase while sketching. Draw the corrected line over the wrong one, and when it gets messy lower the layer’s opacity and start a clean pass on a new layer.',
      'Go big for gesture: large sizes show the pencil’s texture and stop you from fiddling with details. Go small for construction.',
    ],
    avoid: ['Inking with it: the grainy edge leaves gaps when you fill colour under it.', 'Switching pencils every week: skill checks only compare well if they’re drawn with the same pencil.'],
    alt: [
      { name: 'Perfect Pencil (with tilt support)', asset: asset(1712564, 'Perfect Pencil'), note: 'if you like shading with the pen tilted, like a real pencil' },
      { name: 'Pencil R (鉛筆R)', asset: asset(1702962, '鉛筆R'), note: 'a harder, more even pencil' },
    ],
  },
  {
    id: 'mech-pencil',
    name: 'Mechanical pencil',
    slot: 'sketch',
    where: 'Pencil (Sketch) tool → Mechanical pencil (built in)',
    asset: null,
    from: 1,
    use: 'Perspective lines, boxes, cylinders, ellipses and background construction: a thin, even, untextured line that stays precise when you snap it to a ruler.',
    setup: ['Size 3–6 px, stabilization 6–10.', 'Pair it with the Perspective ruler and Linear ruler (Ruler tool) and turn on Snap to special ruler only when the lesson says so.'],
    how: [
      'Use it for structure, not for character: horizon, vanishing lines, box edges, the centre lines of ellipses.',
      'Draw perspective lines lightly and extend them past the object: errors in convergence are easier to see on long lines.',
    ],
    avoid: ['Sketching figures with it: its even line flattens gesture.'],
  },

  // ---- Line art ------------------------------------------------------------------------------------
  {
    id: 'g-pen',
    name: 'G-pen',
    slot: 'line',
    where: 'Pen tool → G-pen (built in)',
    asset: null,
    from: 0,
    use: 'Clean lines in every drill and study until Stage 4: line confidence, ellipses, forms, the figure and anatomy. A plain pen that tapers with pressure and shows every wobble, which is exactly what you want while you learn.',
    setup: [
      'Size 6–12 px on a 3000 × 2000 canvas.',
      'Stabilization 0–6 during drills, so your hand learns, not the software.',
      'Anti-aliasing: the middle setting.',
    ],
    how: [
      'Ghost the stroke first (move above the surface two or three times), then draw it in one quick motion. Speed makes lines smooth; slowness makes them wobble.',
      'Press lighter at the start and end of a stroke for tapered ends, firmer in the middle. That taper is what makes anime line art look alive.',
      'Rotate the canvas so every stroke goes in your comfortable direction; undo and redraw rather than patching a line.',
    ],
    avoid: ['Cranking stabilization to hide shaky lines in drills.', 'Drawing lines in many short hairy strokes.'],
  },
  {
    id: 'anime-gpen',
    name: 'G-pen for anime painting Kai',
    slot: 'line',
    where: 'Pen tool, after you download it',
    asset: asset(1655884, 'G-pen for anime painting Kai (アニメ塗り用Gペン改)', '上原久介'),
    from: 4,
    use: 'Your finished anime line art from Stage 4 on: faces, hair, figures, costumes and all finished pieces. A G-pen tuned for anime: crisp, sharp tapers and a steady weight that colours cleanly.',
    setup: [
      'Size 4–9 px for a full figure on an A4 canvas (2480 × 3508 px); bigger for close-up portraits.',
      'Stabilization 8–12 for final line art (not for drills).',
      'Draw on a vector layer so the Vector eraser and Correct line tools work on your lines.',
    ],
    how: [
      'Line weight follows three rules: outer contours thicker than inner lines; thicker on the shadow side and where forms overlap; thinnest (or broken) where light hits.',
      'Ink in long strokes from the shoulder, overshooting crossings slightly, then trim the overlaps with the Vector eraser.',
      'Hair: draw each clump with one stroke from root to tip, tapering into the point.',
    ],
    avoid: ['Uniform weight everywhere: the drawing goes flat.', 'Inking before the sketch is right: line art only polishes what’s already there.'],
    alt: [{ name: 'Pen for animation (アニメ作画用ペン)', asset: asset(1713084, 'Pen for animation', '7mzk'), note: 'more even, like TV anime production drawings' }],
  },
  {
    id: 'mapping-pen',
    name: 'Mapping pen',
    slot: 'line',
    where: 'Pen tool → Mapping pen (built in)',
    asset: null,
    from: 4,
    use: 'The fine details next to your main pen: eyelashes, iris lines, single hair strands, fabric texture, small folds and background detail.',
    setup: ['Size 2–4 px; stabilization 6–10.'],
    how: ['Use it after the main lines are in, for the 10% of lines that need to be thinner than your main pen can go.', 'Flick strokes outward (eyelashes, hair tips) so they end in a point.'],
    avoid: ['Drawing a whole figure with it: thin lines everywhere look scratchy.'],
    alt: [{ name: 'Sshelby’s Quick Hair Brush', asset: asset(1805196, 'Sshelby’s Quick Hair Brush #0003'), note: 'from Stage 10, for many fine hair strands at once in painted hair' }],
  },

  // ---- Erasing ---------------------------------------------------------------------------------------
  {
    id: 'erasers',
    name: 'Erasers: Hard, Soft, Kneaded, Vector',
    slot: 'erase',
    where: 'Eraser tool → Eraser (built in)',
    asset: null,
    from: 0,
    use: 'Hard: clean edges (cel shadows, trimming flats). Soft: fading edges and gradients. Kneaded: lightening a sketch without removing it. Vector: trimming overlaps in vector line art.',
    setup: ['Vector eraser: Tool property → Erase up to intersection, so one touch removes a line up to where it crosses another.', 'Hard eraser size 10–40 px; Soft eraser big (100+ px) at low opacity.'],
    how: [
      'In drills, don’t erase: redraw. The eraser is for line art and painting.',
      'Use Kneaded on the sketch layer before inking to fade it to a guide.',
      'Many brushes can also erase: pick transparent as the colour (the checker swatch) and paint with the brush itself, for erasing with the same texture.',
    ],
    avoid: ['Erasing every wrong line in a sketch: you lose the history of where the right line is.'],
  },

  // ---- Flat colour -------------------------------------------------------------------------------
  {
    id: 'fills',
    name: 'Fill: Refer other layers + Lasso fill',
    slot: 'colour',
    where: 'Fill tool → Refer other layers; Fill tool → Lasso fill (built in)',
    asset: null,
    from: 5,
    use: 'Flat colours under line art, colour blocking for costume designs, and the hard-edged cel shadow shapes of anime colouring.',
    setup: [
      'Mark the line art layer as reference layer (lighthouse icon in the Layer palette) and set Refer other layers to “Reference layers”.',
      'Close gap: on (small); Area scaling: 1–2 px, so the colour slips under the lines.',
      'One flat colour per layer or a few per layer, under the line art. Shadows go on a clipping layer above (Clip to layer below) in Multiply.',
    ],
    how: [
      'Fill, then zoom in and touch up leftovers with the G-pen at 100% opacity, anti-aliasing off, on the same layer.',
      'Cel shadows: on the clipping layer, draw the shadow shape with Lasso fill. The shape of the shadow describes the form, so think in planes, not in outlines.',
    ],
    avoid: ['Leaving white specks between line and colour: check on a dark background layer.'],
    alt: [{ name: '隙間無く囲って塗るツール (enclose and fill without gaps)', asset: asset(1759448, '隙間無く囲って塗るツール'), note: 'a Lasso fill that leaves no gaps against the lines' }],
  },

  // ---- Light, value & painting ------------------------------------------------------------------
  {
    id: 'gouache',
    name: 'Gouache',
    slot: 'paint',
    where: 'Brush tool → Brushes → Gouache (built in)',
    asset: null,
    from: 6,
    use: 'Value studies, colour studies, block-ins and opaque painting: big, flat, slightly painterly shapes that mix a little with what’s underneath.',
    setup: ['Big sizes: 40–150 px. No stabilization.', 'Pressure on density, so light pressure gives a thin film and firm pressure full colour.'],
    how: [
      'Paint big shapes first (3 values, then 5), then smaller ones. Never start with details.',
      'Pick colours from the canvas with Alt (eyedropper) to mix in between two values.',
      'Squint or zoom out to check the values read as light and shadow.',
    ],
    avoid: ['Tiny brush sizes early in a study: you start rendering before the big values are right.'],
  },
  {
    id: 'soft-air',
    name: 'Soft airbrush',
    slot: 'paint',
    where: 'Airbrush tool → Soft (built in; if you moved it, look in your Brush favourites)',
    asset: null,
    from: 6,
    use: 'Gentle gradients: ambient light, bounce light, blush on cheeks, the gradient at the top of hair, glows (on an Add (Glow) layer) and atmosphere in backgrounds.',
    setup: ['Very big: 200–600 px, opacity 20–40%.', 'Use it on a clipping layer so it stays inside the colour.'],
    how: ['One or two passes, then stop. Gradients should be felt, not seen.', 'For glow: new layer in Add (Glow) mode, dark saturated colour, soft airbrush, then lower opacity.'],
    avoid: ['“Pillow shading”: soft shading around every edge. Anime shading is mostly hard shapes; the airbrush only adds the gradient on top.'],
  },
  {
    id: 'blend',
    name: 'Blend: Blur + Textured blender',
    slot: 'paint',
    where: 'Blend tool → Blend → Blur / Textured blender (built in)',
    asset: null,
    from: 6,
    use: 'Blur: soften chosen shadow edges, such as the core shadow on a cheek or a round arm. Textured blender: painterly transitions in rendering and backgrounds.',
    setup: ['Blur size 30–80 px; Textured blender size 40–120 px.'],
    how: ['Decide which edges turn gradually (round forms) and blend only those; cast shadows and hard planes stay sharp.', 'Blend with short strokes along the edge, not back and forth across it.'],
    avoid: ['Blending everything until the drawing looks plastic.'],
  },
  {
    id: 'dense-cream',
    name: 'Dense Cream',
    slot: 'paint',
    where: 'Brush tool, after you download the Dense Cream Set',
    asset: asset(2004593, 'Dense Cream Set'),
    from: 10,
    use: 'Rendering: skin, cloth, metal, glass and painted hair from Stage 10 on. It paints and blends in one stroke, which is how the soft-painted style of splash art and key visuals is built.',
    setup: ['Dense Cream for soft passages, Dense Cream Hard for crisp edges. Size 20–80 px.', 'Pressure on opacity; pick colours often.'],
    how: [
      'Work from your cel-shaded or value base: soften the edges that turn, add reflected light, then sharpen the edges that matter most (eyes, the face, the focal point).',
      'Hard edges near the focal point, soft edges away from it: that’s where the eye goes.',
    ],
    avoid: ['Rendering before the drawing and values are right.', 'Rendering everything equally: finish the focal point most.'],
  },

  // ---- Backgrounds & effects --------------------------------------------------------------------
  {
    id: 'clouds',
    name: 'Cloud brushes',
    slot: 'world',
    where: 'Brush tool, after you download 雲を描くブラシセット',
    asset: asset(1723992, '雲を描くブラシセット (cloud brush set)'),
    from: 9,
    use: 'Skies: big cumulus (水彩入道雲), far clouds (遠くの雲) and small clouds (小さな雲) for anime skies.',
    setup: ['Paint on a layer above the sky gradient; white or a light tint of the sky colour.'],
    how: ['Block the sky with the brush, then paint over the main cloud by hand (Gouache) so its light matches your scene.', 'Bigger clouds near, smaller and flatter towards the horizon.'],
    avoid: ['Stamping the same cloud shape over and over.'],
  },
  {
    id: 'deco-bg',
    name: 'Decoration: Trees, Leaves, Grass',
    slot: 'world',
    where: 'Decoration tool → Background → Trees / Leaves / Grass (built in)',
    asset: null,
    from: 9,
    use: 'Filler for far-away foliage and grass texture in backgrounds.',
    setup: ['Use its own layer; recolour with Lock transparent pixels.'],
    how: ['Paint the near trees and plants yourself first (that’s the lesson); use these only for the far layer where detail doesn’t matter.'],
    avoid: ['Using them for the main tree of a picture: they look stamped.'],
  },
  {
    id: 'spray',
    name: 'Spray and Noise',
    slot: 'world',
    where: 'Airbrush tool → Spray / Noise (built in)',
    asset: null,
    from: 10,
    use: 'Texture and particles: dust, grain, snow, sparks, stone and rusted metal.',
    setup: ['Low opacity (20–50%) on a separate layer, often in Overlay or Add (Glow).'],
    how: ['A light grain over a finished piece unifies it; particles add depth when they’re bigger and blurrier near the camera.'],
    avoid: ['Grain so strong it hides the drawing.'],
  },
  {
    id: 'sparkle',
    name: 'Sparkle and Glitter',
    slot: 'world',
    where: 'Decoration tool → Effect → Sparkle / Glitter (built in)',
    asset: null,
    from: 10,
    use: 'Eye shines, magic particles and glints on metal, glass and water.',
    setup: ['Use on an Add (Glow) layer.'],
    how: ['Place the one main highlight by hand with the G-pen, then add the scattered small ones with the brush.'],
    avoid: ['Sparkles everywhere: they only read where the light is.'],
  },

  // ---- Manga pages ----------------------------------------------------------------------------------
  {
    id: 'manga-tools',
    name: 'Turnip pen + comic tools',
    slot: 'manga',
    where: 'Pen tool → Turnip pen; Comic tools: Frame border, Speed lines, Focus lines; Decoration → Hatching (built in)',
    asset: null,
    from: null,
    track: 'manga',
    use: 'Manga inking with strong, elastic tapers (Turnip pen), panels (Frame border), speed and focus lines, and hatching for black-and-white shading.',
    setup: ['Turnip pen 5–10 px for figures, stabilization 8–12. Comic → Frame border on a manga page canvas (File → New → Comic).'],
    how: ['Bold outer contours, fine inner lines, solid blacks for weight; speed lines in the direction of motion, focus lines centred on the point of attention.'],
    avoid: ['Screentone and effects before the panel reads in plain line art.'],
  },
];

// Which brushes each stage uses (in the order they matter). The kit is the
// same everywhere; a stage only shows the part of it you need.
const STAGE_KIT = {
  0: ['su-cream', 'g-pen', 'erasers'],
  1: ['su-cream', 'mech-pencil', 'g-pen', 'erasers'],
  2: ['su-cream', 'g-pen', 'erasers'],
  3: ['su-cream', 'g-pen', 'erasers'],
  4: ['su-cream', 'anime-gpen', 'mapping-pen', 'erasers'],
  5: ['su-cream', 'anime-gpen', 'mapping-pen', 'fills', 'erasers'],
  6: ['su-cream', 'gouache', 'soft-air', 'blend', 'fills', 'erasers'],
  7: ['su-cream', 'gouache', 'fills', 'soft-air', 'blend', 'anime-gpen'],
  8: ['su-cream', 'gouache', 'anime-gpen', 'fills', 'soft-air'],
  9: ['mech-pencil', 'su-cream', 'gouache', 'clouds', 'deco-bg', 'blend', 'soft-air'],
  10: ['anime-gpen', 'mapping-pen', 'dense-cream', 'spray', 'sparkle', 'soft-air', 'blend'],
  11: ['su-cream', 'anime-gpen', 'fills', 'gouache', 'dense-cream', 'soft-air'],
  12: ['anime-gpen', 'mapping-pen', 'dense-cream', 'blend', 'soft-air', 'sparkle', 'spray'],
  13: ['su-cream', 'anime-gpen', 'mapping-pen', 'fills', 'gouache', 'dense-cream', 'soft-air', 'blend'],
};
const TRACK_KIT = {
  design: ['su-cream', 'anime-gpen', 'fills', 'erasers'],
  manga: ['su-cream', 'mech-pencil', 'manga-tools', 'mapping-pen', 'erasers'],
  business: [],
  keyvisual: ['anime-gpen', 'dense-cream', 'soft-air', 'sparkle', 'spray', 'clouds'],
};

const BRUSH = new Map(BRUSHES.map((b) => [b.id, b]));
for (const ids of [...Object.values(STAGE_KIT), ...Object.values(TRACK_KIT)]) for (const id of ids) if (!BRUSH.has(id)) throw new Error(`Brush kit: unknown brush ${id}`);
for (const b of BRUSHES) if (!SLOTS.some((s) => s.id === b.slot)) throw new Error(`Brush ${b.id}: unknown slot ${b.slot}`);

// The brushes for a lesson: its stage's kit (track lessons: the track's kit;
// adult units: the kit of the stage they open with). `isNew` marks the ones
// that join the kit in this stage.
function kitFor(lesson, { stageOf } = {}) {
  if (lesson.id === 's0-brushes') return BRUSHES.map((b) => ({ ...b, isNew: b.from === 0 }));
  const stage = lesson.stage ?? stageOf ?? null;
  const ids = lesson.track ? TRACK_KIT[lesson.track] ?? [] : STAGE_KIT[stage] ?? [];
  return ids.map((id) => {
    const b = BRUSH.get(id);
    return { ...b, isNew: lesson.track ? b.track === lesson.track : b.from === stage };
  });
}

module.exports = { BRUSHES, BRUSH, SLOTS, STAGE_KIT, TRACK_KIT, kitFor, ASSETS_HOME };
