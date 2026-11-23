// The adult track: life drawing, pin-up and nude illustration of ADULTS.
// Opt-in (Atelier settings), needs Spicy or Explicit art in Anime Hub and an
// 18+ confirmation. References inside the app come only through the Art
// search's adults-only rules; real-model references link to life-drawing sites
// with professional adult models. Every exercise is about adult characters.
const { yt, site, drill, study, memory, project } = require('./helpers');

const LIFE = [
  site('Croquis Café', 'Timed nude model sessions (video)', 'https://www.youtube.com/results?search_query=croquis+cafe+figure+drawing'),
  site('Line of Action', 'Timed poses (enable nudity in its settings)', 'https://line-of-action.com/'),
  site('Quickposes', 'Timed figure poses', 'https://quickposes.com/'),
];

module.exports = [
  // ---- A1 Life drawing ------------------------------------------------------------------------
  {
    id: 'a1-life',
    unit: 'A1',
    title: 'Life drawing: the nude figure',
    area: 'anatomy',
    skills: ['life-drawing'],
    minutes: 45,
    why: 'Drawing the nude figure is the foundation of every art school: clothes hide what you need to understand.',
    theory: [
      'Life drawing means drawing real models, usually nude, in timed poses. It’s the most direct way to learn how the body’s masses, landmarks and weight really look, without clothes hiding them. Use the timed sessions linked below: professional adult models, poses from 30 seconds to 20 minutes.',
      'Work exactly as in Stage 2: line of action first, then the big masses of ribcage and pelvis, then limbs. Observe how soft forms (chest, belly, thighs) respond to gravity and pose – they squash, stretch and rest on other forms.',
    ],
    points: ['Gesture first, every pose', 'Ribcage and pelvis as masses', 'Soft forms follow gravity and pose', 'Landmarks: collarbones, rib cage, hip bones, kneecaps'],
    mistakes: ['Drawing outlines instead of masses', 'Ignoring how soft forms rest and fold', 'Skipping short poses'],
    csp: null,
    watch: [...LIFE, yt('Proko', 'figure drawing fundamentals')],
    exercises: [
      drill('life-gestures', 'Timed life gestures', '20 poses at 1 minute from one of the life-drawing sites, line of action first.', 25, { count: 20 }),
      drill('life-long', 'Longer poses', '3 poses at 5–10 minutes: gesture, masses, then landmarks.', 30),
      memory('life-memory', 'From memory', 'Redraw one of the long poses from memory, then compare.', 10),
    ],
  },
  {
    id: 'a1-soft-forms',
    unit: 'A1',
    title: 'Soft forms and gravity',
    area: 'anatomy',
    skills: ['soft-forms'],
    minutes: 40,
    why: 'Believable bodies come from soft forms that react to pose and gravity.',
    theory: ['Chest, belly, buttocks and thighs are soft masses attached to the skeleton. When the body leans, they shift; when compressed, they flatten and bulge; when the arms rise, the chest lifts and stretches. Study them as volumes with weight, not as outlines.'],
    points: ['Soft masses have weight', 'Compression flattens and bulges', 'Raised arms lift and stretch the chest', 'Overlaps show where forms rest on each other'],
    mistakes: ['Soft forms drawn as rigid spheres', 'Same shapes in every pose'],
    csp: null,
    watch: [...LIFE.slice(0, 2), yt('Proko', 'figure drawing soft forms')],
    exercises: [drill('soft-study', 'Soft-form studies', '8 life-drawing poses focusing on how soft forms react: lying, seated, arms up, twisting.', 35)],
  },

  // ---- A2 Adult proportions --------------------------------------------------------------------
  {
    id: 'a2-adult',
    unit: 'A2',
    title: 'Drawing characters who read as adults',
    area: 'anatomy',
    skills: ['adult-proportions'],
    minutes: 45,
    why: 'Anime styles can make adults look young. In this genre, clearly adult proportions are essential.',
    theory: [
      'Age reads from proportion. Adult bodies are 7–8 heads tall, with a longer neck, broader shoulders and hips relative to the head, and a defined waist. Faces of adults have a longer lower face, a more defined jaw and cheekbones, and eyes that sit at or slightly above the middle of the head – large heads and very big, low eyes read as younger.',
      'Keep the anime look but push adult cues: slightly smaller, narrower eyes, a visible jawline and cheekbones, a longer neck and torso, mature body landmarks (collarbones, defined waist and hips). Always draw characters who are adults in their source, and make them read that way.',
    ],
    points: ['7–8 heads tall', 'Longer neck and lower face', 'Defined jaw and cheekbones', 'Eyes not oversized; at mid-head', 'Adult body landmarks and waist'],
    mistakes: ['Large head on a small body', 'Very large, low-set eyes', 'Childlike faces on adult bodies'],
    csp: null,
    watch: [yt('Proko', 'proportions age head size'), yt('Marc Brunet', 'drawing adult characters anime')],
    exercises: [
      drill('age-chart', 'Proportion comparison', 'Draw the same adult character twice: once with your usual proportions, once with stronger adult cues. Note the differences.', 25),
      study('adult-study', 'Adult character studies', 'Study 4 references of adult characters; mark head count, eye position and jawline.', 25, { tags: ['$character', 'mature_female'], note: 'Only characters known to be adults appear here.' }),
    ],
  },

  // ---- A3 Pin-up posing ------------------------------------------------------------------------
  {
    id: 'a3-curves',
    unit: 'A3',
    title: 'S-curves and contrapposto',
    area: 'gesture',
    skills: ['pinup-gesture'],
    minutes: 40,
    why: 'Pin-up appeal comes from gesture: flowing curves and confident weight shifts.',
    theory: ['Classic pin-up poses exaggerate contrapposto: weight on one leg, hip pushed out, shoulders tilted the other way, creating an S-curve through the whole figure. Twisting the torso against the hips adds more rhythm. Keep one clear line of action; everything else flows from it.'],
    points: ['Strong S-curve line of action', 'Hip out on the weight leg', 'Shoulders tilt opposite', 'Twist torso against hips'],
    mistakes: ['Stiff, symmetrical poses', 'Curves that break the flow'],
    csp: null,
    watch: [yt('Proko', 'pin up pose drawing'), yt('Marc Brunet', 'appealing poses')],
    exercises: [drill('pinup-gestures', 'Pin-up gestures', '15 gesture drawings of pin-up poses, 1 minute each.', 20, { refs: { tags: ['$character', 'contrapposto'] } }), memory('pinup-memory', 'Pose from memory', 'Invent 3 pin-up poses from memory.', 15)],
  },
  {
    id: 'a3-camera',
    unit: 'A3',
    title: 'Camera and presentation',
    area: 'composition',
    skills: ['pinup-camera'],
    minutes: 40,
    why: 'Angle and crop decide how a pin-up feels: confident, playful or intimate.',
    theory: ['A low camera makes a character powerful and confident; a high camera intimate; a slight Dutch angle playful. Show the pose’s best line – often a three-quarter view. Crops should feel intentional and frame the figure’s curves, never cut at the joints.'],
    points: ['Low = confident, high = intimate', 'Three-quarter views show the curves best', 'Intentional crops'],
    mistakes: ['Flat front views', 'Awkward crops at joints'],
    csp: null,
    watch: [yt('Marc Brunet', 'camera angles pin up')],
    exercises: [study('pinup-camera-study', 'Camera study', 'One pin-up pose drawn from 3 camera angles.', 35, { tags: ['$character', 'from_below'] })],
  },

  // ---- A4 Sensual expression -------------------------------------------------------------------
  {
    id: 'a4-expression',
    unit: 'A4',
    title: 'Sensual expression',
    area: 'face',
    skills: ['sensual-expression'],
    minutes: 40,
    why: 'Mood lives in the face and hands as much as in the pose.',
    theory: ['Half-lidded eyes, a glance over the shoulder, a slight smile or parted lips, a blush – small changes in lids and mouth create mood. Hands add a lot: resting on the body, touching the hair or collar. Keep expressions adult and confident rather than shy and young.'],
    points: ['Half-lidded eyes and looking back', 'Subtle mouth changes', 'Hands that touch and rest', 'Confident, adult expressions'],
    mistakes: ['Overdone, cartoon expressions', 'Stiff hands'],
    csp: null,
    watch: [yt('Marc Brunet', 'expressions mood')],
    exercises: [study('sensual-face', 'Expression study', '6 sensual expressions on your character’s face, plus 4 hand gestures.', 35, { tags: ['$character', 'half-closed_eyes'] })],
  },

  // ---- A5 Skin & light -------------------------------------------------------------------------
  {
    id: 'a5-skin',
    unit: 'A5',
    title: 'Rendering skin',
    area: 'value',
    skills: ['skin'],
    minutes: 45,
    why: 'Soft, glowing skin is the signature of the genre.',
    theory: ['Skin scatters light: shadow edges are soft and slightly reddish where light passes through. Use warm, saturated tones at the shadow edge (the terminator), cooler tones deeper in shadow, and soft highlights on the most curved planes. Rim light separates the figure and adds glow.'],
    points: ['Soft shadow edges', 'Warm, saturated terminator', 'Cooler deep shadows', 'Soft highlights on curves', 'Rim light for glow'],
    mistakes: ['Grey, muddy skin shadows', 'Hard highlights everywhere'],
    csp: null,
    watch: [yt('Marc Brunet', 'how to render skin'), yt('Sinix Design', 'skin rendering')],
    exercises: [study('skin-study', 'Skin study', 'Render a figure’s skin in warm and in cool light.', 40, { tags: ['$character', 'backlighting'] })],
  },

  // ---- A6 Clothing & reveal --------------------------------------------------------------------
  {
    id: 'a6-swim',
    unit: 'A6',
    title: 'Swimwear and lingerie',
    area: 'cloth',
    skills: ['lingerie'],
    minutes: 40,
    why: 'Tight clothes show the body’s forms, so construction has to be right.',
    theory: ['Tight fabric follows the body’s contours exactly and pulls between high points, making small tension folds. Straps press slightly into soft forms. Lace and patterns must follow the curved surface – use contour lines to place them.'],
    points: ['Fabric follows contours', 'Tension between high points', 'Straps press into soft forms', 'Patterns follow the surface'],
    mistakes: ['Fabric flat over curves', 'Patterns that ignore the form'],
    csp: null,
    watch: [yt('Marc Brunet', 'drawing tight clothing')],
    exercises: [study('swim-study', 'Swimwear study', 'Draw 3 figures in swimwear or lingerie, construction first.', 35, { tags: ['$character', 'swimsuit'] })],
  },
  {
    id: 'a6-sheer',
    unit: 'A6',
    title: 'Sheer, wet and loose fabric',
    area: 'cloth',
    skills: ['sheer'],
    minutes: 40,
    why: 'Sheer and wet fabric are technical showpieces of rendering.',
    theory: ['Sheer fabric is a translucent layer: lower its opacity and let the colour underneath show, darker where it folds over itself. Wet fabric clings, becomes darker and more transparent, with sharp highlights. Loose fabric hangs from contact points and reveals forms through its folds.'],
    points: ['Sheer: overlapping layers darker', 'Wet: clings, darker, sharp highlights', 'Loose: hangs from contact points'],
    mistakes: ['Uniform transparency', 'Wet fabric without highlights'],
    csp: null,
    watch: [yt('Marc Brunet', 'transparent fabric'), yt('Sinix Design', 'wet clothes')],
    exercises: [study('sheer-study', 'Sheer and wet study', 'One sheer and one wet fabric study.', 35, { tags: ['$character', 'see-through'] })],
  },

  // ---- A7 Nude illustration --------------------------------------------------------------------
  {
    id: 'a7-nude',
    unit: 'A7',
    title: 'Nude illustration',
    area: 'composition',
    skills: ['nude-illustration'],
    minutes: 60,
    why: 'A finished nude piece combines anatomy, light and composition at their most demanding.',
    theory: [
      'Plan nude pieces like any illustration: thumbnails, a focal point, a clear light. Decide what to show and what to imply – shadows, hair, props and crops can conceal as effectively as they reveal, and implication often reads as more appealing.',
      'Anatomy must be right because nothing hides it: return to your life-drawing studies. Characters are always adults, drawn with adult proportions.',
    ],
    points: ['Thumbnails and focal point first', 'Implied vs shown: choose deliberately', 'Light shapes the forms', 'Adult characters, adult proportions'],
    mistakes: ['Skipping planning', 'Anatomy shortcuts'],
    csp: null,
    watch: [...LIFE.slice(0, 1), yt('Proko', 'figure drawing light and shadow')],
    exercises: [project('nude-piece', 'Nude illustration', 'One finished nude illustration of an adult character, from thumbnails.', 180, { tags: ['$character', 'nude'], note: 'Needs Explicit art in Anime Hub; only adult characters appear.' })],
  },

  // ---- A8 Adult portfolio ----------------------------------------------------------------------
  {
    id: 'a8-portfolio',
    unit: 'A8',
    title: 'Adult portfolio',
    area: 'rendering',
    skills: ['adult-portfolio'],
    minutes: 60,
    why: 'A separate portfolio for adult work is standard for commissions.',
    theory: ['Keep adult work separate from your main portfolio, with clear age gating where you post it. 6–10 finished pin-up and nude pieces of adult characters, consistent quality, is a strong set.'],
    points: ['Separate from the main portfolio', 'Age-gated where posted', '6–10 finished pieces'],
    mistakes: ['Mixing adult work into the main portfolio'],
    csp: null,
    watch: [],
    exercises: [project('adult-portfolio', 'Adult portfolio', 'Select and polish 6–10 pieces.', 240, null)],
  },
];
