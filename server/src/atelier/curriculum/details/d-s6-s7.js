// Detail for Stages 6–7 (light & value, colour).

module.exports = {
  's6-values': {
    method: ['Squint at the reference until details disappear.', 'Group everything into 3 values: light, middle, dark.', 'Paint those 3 flat shapes, no gradients.', 'Check that the picture reads at thumbnail size.', 'Only then split into 5 values if needed.'],
    more: ['Value, how light or dark something is, carries the readability of a picture. Anime key visuals and screenshots usually have very clear value groups: a bright character against a darker background, or a dark silhouette against a bright sky.', 'Always plan values before colour. Use CSP’s greyscale check constantly: a picture that works in grey works in colour.'],
    ex: {
      'value-scale': {
        sessions: 3,
        steps: ['Draw a row of 5 boxes and a row of 9 boxes.', 'Fill the first box white and the last black.', 'Fill the middle box with a middle grey, then the steps between, by eye (no sliders).', 'Check with the eyedropper: are the steps even?'],
        success: ['Steps look evenly spaced', 'No two neighbours look the same'],
        example: 'Two strips: 5 steps from white to black and 9 steps with finer gradations. Typical first try: the dark end is bunched together (steps 7–9 look the same).',
        search: 'value scale 9 step exercise',
      },
      'value-study': {
        sessions: 6,
        steps: ['Four references with clear light.', 'Small canvas (about 600 px wide).', 'Paint only 3 flat values per study, 10 minutes each.', 'Compare with the reference in greyscale.'],
        success: ['Exactly 3 values', 'The picture reads as the reference at a glance'],
        example: 'A backlit character reduced to 3 values: the bright sky, the mid-grey lit edges, the dark figure. It reads instantly even as a tiny square.',
        search: 'three value study notan',
      },
    },
  },
  's6-form-shading': {
    method: ['Decide the light direction and draw an arrow.', 'Find the terminator: where the form turns away from the light.', 'Paint the core shadow along the terminator.', 'Add a cast shadow away from the light.', 'Add a little reflected light inside the shadow.', 'Highlight on the plane facing the light most directly.'],
    more: ['Every shaded form has the same parts: highlight, light side, core shadow, reflected light and cast shadow. Learn them on spheres and boxes, and you can shade anything, from a face to a sword.', 'Cast shadows are what place objects in space: a character standing on the ground needs one under the feet, a hat throws one onto the forehead. Hard near the object, softer further away.'],
    ex: {
      'spheres-lit': {
        sessions: 4,
        steps: ['A sphere, cylinder and box with light from the top left.', 'The same three with light from below.', 'Label the parts (highlight, core shadow, reflected light, cast shadow) on one of them.'],
        success: ['Shadows agree with the light direction', 'Cast shadows land on the ground plane'],
        example: 'Six forms in two rows. Lit from below, the sphere’s highlight is at the bottom, its core shadow curves near the top and the cast shadow falls up and behind, giving the eerie under-light look.',
        search: 'shading sphere cylinder cube light source',
      },
      'shadow-study': {
        sessions: 5,
        steps: ['A character reference with dramatic light.', 'Line drawing first, then one flat shadow layer (Multiply).', 'Mark core shadows on the face, neck, arms and folds.', 'Add cast shadows: hair onto forehead, chin onto neck, arms onto body.'],
        success: ['Shadows follow the forms', 'Cast shadows from hair and chin present'],
        example: 'A face lit from the upper right: shadow down the left side of the nose, under the chin onto the neck, under the fringe onto the forehead in a jagged shape matching the hair.',
        search: 'anime character shadow placement light source',
      },
    },
  },
  's6-light-sources': {
    method: ['Choose a key light (main) and its direction.', 'Add a weaker fill light so shadows stay readable.', 'Add a rim light from behind if you want separation.', 'Keep shadow shapes consistent with the key light.'],
    more: ['Light sets the mood of a piece more than anything else: the same character reads heroic under strong side light, cosy under warm front light, eerie from below and dreamy with backlight. Anime films use rim light everywhere to separate characters from busy backgrounds.'],
    ex: {
      'light-series': {
        sessions: 5,
        steps: ['One head drawing, copied 4 times.', 'Light it from the front, the side, behind (rim) and below.', 'Two values per version: light and shadow.', 'Write the mood each one creates.'],
        success: ['Four clearly different lightings', 'Shadows consistent within each version'],
        example: 'Front light: almost no shadow, flat and friendly. Side light: half the face in shadow, dramatic. Back light: a thin bright rim around the hair and cheek, the face in shadow. Under light: shadows above the eyes and nose, horror mood.',
        search: 'portrait lighting setups front side back under',
      },
    },
  },
  's6-cel': {
    method: ['Flat colours first.', 'One shadow layer (clipped, Multiply) with a hard brush or lasso.', 'Design the shadow shapes: simplify, follow the form, avoid tiny bits.', 'Second, darker shadow only where things touch (occlusion).', 'Highlights on hair, eyes and shiny materials.'],
    more: ['Cel shading is the TV-anime look: two or three hard-edged tones per material. The skill is designing the shadow shapes: they follow the light, but they’re simplified into pleasing, graphic shapes. Look at how anime studios draw a shadow under the fringe: always a clean zigzag, never a mess of dots.'],
    ex: {
      'cel-study': {
        sessions: 6,
        steps: ['Pick 2 official art pieces or anime screenshots with clear cel shading.', 'Copy the line art loosely, then the flats.', 'Copy the shadow shapes exactly, noticing where they simplify.', 'Write 3 rules you noticed (e.g. “shadow always under the fringe”).'],
        success: ['Shadow shapes match the original', 'Your notes name the patterns'],
        example: 'An anime screenshot copied: a zigzag shadow under the fringe, a band under the chin, a shadow on one side of the neck and in the clothing folds, a second dark tone only in the armpit and under the collar.',
        search: 'anime cel shading screenshot study',
      },
      'cel-memory': {
        sessions: 4,
        steps: ['Take one of your earlier line drawings.', 'Light from the top right, decided before you start.', 'Cel shade it with your rules, without references.'],
        success: ['Consistent light direction', 'Shadow shapes are clean and designed'],
        example: 'Your Stage 5 outfit drawing cel shaded: shadows on the left of every form, under the hair, chin and coat edges, clean graphic shapes.',
        search: 'anime cel shading tutorial clip studio',
      },
    },
  },
  's6-soft': {
    method: ['Start with a cel-shaded version (light and shadow shapes).', 'Decide which edges are hard (sharp turns: jaw, nose bridge) and which are soft (cheeks, arms).', 'Blend the soft edges; keep hard ones hard.', 'Add a few lost edges where shapes melt into the background.', 'Add soft highlights and bounce light last.'],
    more: ['Soft rendering is the illustration look of many light novel covers and gacha game art. It’s not “blur everything”: the beauty comes from the contrast between a few crisp edges and soft transitions. Edge control is the skill.'],
    ex: {
      'soft-study': {
        sessions: 5,
        steps: ['A portrait reference with clear light.', 'Block light and shadow as hard shapes first.', 'Mark hard edges with a dot, then blend only the rest.', 'Compare edges with the reference.'],
        success: ['Hard edges stay sharp', 'Soft edges blend smoothly', 'Values still read in greyscale'],
        example: 'A portrait: a sharp shadow edge along the nose bridge and jawline, a soft gradient across the cheek, the hair edge melting into a dark background on the shadow side.',
        search: 'soft shading anime illustration hard soft edges',
      },
    },
  },
  's6-project': {
    method: ['One character drawing, three copies.', 'Daylight, sunset backlight, night with a lamp.', 'Greyscale first; colour optional.'],
    more: ['Painting one figure in several lights is a classic illustrator exercise: it separates the drawing from the light so you see only what light does.'],
    ex: {
      'light-series-project': {
        sessions: 1,
        steps: ['Draw your character once and duplicate the line art three times.', 'Plan each lighting as a small thumbnail.', 'Shade each in greyscale with key and fill light.', 'Optional: a colour pass using gradient maps.'],
        success: ['Three readable, clearly different lightings', 'Consistent light inside each'],
        example: 'Daylight: soft top light, small shadows. Sunset: strong backlight, a warm rim, the front in shadow. Night: a lamp below and to the left, the rest dark.',
        search: 'character lighting study series',
      },
    },
  },
  's7-hsv': {
    method: ['Pick a hue.', 'Choose its value from your greyscale plan.', 'Choose the saturation last: lower than you think.', 'Keep high saturation for small accents and the focal point.'],
    more: ['Most colour problems are value or saturation problems. Pick colours in HSV: hue for the colour family, saturation for intensity, value for lightness, and change them one at a time.'],
    ex: {
      'hsv-swatches': {
        sessions: 3,
        steps: ['Row 1: one hue at 5 saturations.', 'Row 2: the same hue at 5 values.', 'Row 3: 5 different hues at the same value (check in greyscale).'],
        success: ['Row 3 looks the same in greyscale', 'Steps are even'],
        example: 'Row 3 is the surprising one: a yellow and a blue at the “same value” look wildly different in colour, but identical in greyscale. That’s how you pick colours that don’t break your value plan.',
        search: 'hue saturation value swatch exercise',
      },
      'colour-pick-study': {
        sessions: 4,
        steps: ['A line drawing of your character.', 'A reference illustration with colours you love.', 'Colour your drawing using only colours picked from the reference.', 'Note where the reference uses low saturation.'],
        success: ['Only picked colours used', 'Palette feels like the reference'],
        example: 'Your character recoloured with a colour palette from a Makoto Shinkai-style still: skin in soft warm pinks, deep blue shadows, one saturated orange accent.',
        search: 'anime colour palette study',
      },
    },
  },
  's7-temperature': {
    method: ['Decide the light’s temperature (warm sun, cool moon).', 'Shadows go the opposite way: warm light → cooler shadows.', 'Shift hue in shadows, don’t just darken.', 'Warm up the edge between light and shadow slightly (skin).'],
    more: ['Shifting the hue in shadows is what makes anime colour feel alive. Skin in warm light gets purplish or rosy shadows; under cool light, shadows can be warmer. Pure darker versions of the base colour look muddy.'],
    ex: {
      'temp-study': {
        sessions: 4,
        steps: ['One head, two versions: warm sunlight and cool moonlight.', 'Pick light and shadow colours for skin, hair and clothes in each.', 'Compare the two side by side.'],
        success: ['Shadows shift hue, not just value', 'The two moods are clearly different'],
        example: 'Sunlight: warm peach skin, rosy-violet shadows, golden hair highlights. Moonlight: pale blue skin light, deeper blue-violet shadows, cool white hair highlights.',
        search: 'warm light cool shadow skin painting',
      },
    },
  },
  's7-palettes': {
    method: ['Choose a harmony: analogous, complementary or limited.', 'Pick one dominant colour (about 60%), a secondary (30%) and an accent (10%).', 'Test it as tiny thumbnails before committing.'],
    more: ['A deliberate palette makes a picture feel designed. Character designs use the same principle: one main colour, a secondary and a small accent make a character instantly recognisable.'],
    ex: {
      'palette-study': {
        sessions: 4,
        steps: ['Three thumbnails of the same character in a simple scene.', 'Version A: analogous. B: complementary. C: limited (3 colours).', 'Save each palette as a CSP colour set.'],
        success: ['Three distinct moods', 'Each follows its harmony'],
        example: 'A: blues and teals (calm). B: blue character, orange sunset (contrast). C: only cream, red and black (graphic, poster-like).',
        search: 'colour harmony thumbnails character',
      },
    },
  },
  's7-anime-colour': {
    method: ['Flats per material on separate layers.', 'Shadow layer clipped, Multiply.', 'Second shadow for occlusion.', 'Highlights in Add (Glow) or Screen.', 'Correction layer on top to unify.'],
    more: ['This is the workflow used in most anime illustration: it’s fast, clean and easy to change. Each step is its own layer, so you can recolour hair without touching shadows.'],
    ex: {
      'colour-study': {
        sessions: 4,
        steps: ['A clean line drawing of your character.', 'Flats with the fill tool (Refer other layers).', 'Shadow, second shadow and highlight layers clipped to each flat.', 'A colour balance or gradient map layer on top.', 'Name every layer.'],
        success: ['Clean flats, no gaps', 'Shadows clipped and consistent', 'A clear light direction'],
        example: 'Your character with skin, hair, eyes and outfit on separate flats; purple-tinted Multiply shadows; a glossy hair highlight band; a warm colour balance layer on top.',
        search: 'anime colouring process clip studio layers',
      },
    },
  },
  's7-project': {
    method: ['One simple scene, six times.', 'Morning, noon, sunset, night, rain, battle.', 'Small and fast: colour and light only.'],
    more: ['Colour scripts plan the emotional arc of a film. Doing one teaches you how much mood is in colour alone.'],
    ex: {
      'colour-script': {
        sessions: 1,
        steps: ['Draw one simple scene composition as a small thumbnail.', 'Duplicate it six times.', 'Paint each mood with a different palette and light.', 'Present them in a row.'],
        success: ['Six distinct moods', 'Each reads at thumbnail size'],
        example: 'Your character on a rooftop: pale gold morning, bright blue noon, orange-violet sunset, deep blue night with lit windows, grey-green rain, red and black battle.',
        search: 'colour script anime moods',
      },
    },
  },
};
