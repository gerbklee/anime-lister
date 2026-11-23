// Detail for the adult track (A1–A8). Adult characters only. Example searches
// are kept to safe anatomy and figure drawing terms.

module.exports = {
  'a1-life': {
    method: ['Choose a timed session on a life-drawing site.', 'Line of action first in every pose.', 'Block the big masses: ribcage, pelvis, limbs.', 'Mark the landmarks: collarbones, ribcage bottom, navel, hip bones, kneecaps.', 'In longer poses: add soft forms and weight.'],
    more: ['Life drawing is how art schools teach the figure. The real body shows how masses and landmarks really sit, which no stylised reference can.'],
    ex: {
      'life-gestures': {
        sessions: 8,
        steps: ['20 poses at 1 minute.', 'Line of action first.', 'Masses next; no details.', 'Circle the three liveliest.'],
        success: ['Line of action in every pose', 'Weight clear'],
        example: 'Twenty one-minute figures, each an S or C curve with the ribcage and pelvis tilted against each other.',
        search: 'figure drawing gesture one minute',
      },
      'life-long': {
        sessions: 6,
        steps: ['3 poses at 5–10 minutes.', 'Gesture, masses, landmarks, then light contour.', 'Measure the head count.'],
        success: ['Proportions measured', 'Landmarks placed'],
        example: 'A seated figure in 10 minutes: gesture, masses, landmarks, a clear contour. The head count noted beside it.',
        search: 'figure drawing 10 minute pose construction',
      },
      'life-memory': {
        sessions: 4,
        steps: ['Redraw one long pose from memory.', 'Compare and note differences.'],
        success: ['Pose recognisable', 'One noted difference'],
        example: 'The seated pose from memory: the torso tilt came out weaker, the next thing to watch.',
        search: 'drawing figure from memory',
      },
    },
  },
  'a1-soft-forms': {
    method: ['Construct the skeleton masses.', 'Attach soft forms as volumes.', 'Ask what gravity and pose do to them.', 'Show compression and stretch with contour lines.'],
    more: ['Soft forms react to the pose: they compress, stretch and hang. Drawing them as weighted volumes makes figures believable.'],
    ex: {
      'soft-study': {
        sessions: 5,
        steps: ['8 poses: lying, seated, arms up, twisting.', 'Masses first, then soft forms.', 'Contour lines to show compression and stretch.'],
        success: ['Soft forms react to the pose', 'Contours consistent'],
        example: 'A seated pose where the thighs flatten on the seat and the belly folds slightly, shown with curved contour lines.',
        search: 'figure drawing soft forms gravity',
      },
    },
  },
  'a2-adult': {
    method: ['Set the head count (7–8).', 'Longer neck, broader shoulders and hips.', 'Defined waist.', 'Longer lower face, defined jaw and cheekbones.', 'Check: does it read as an adult without any context?'],
    more: ['In this genre, a character reading clearly as an adult is essential. Proportion is what carries age.'],
    ex: {
      'age-chart': {
        sessions: 3,
        steps: ['Draw the same adult character twice: your usual way, then with stronger adult cues.', 'Note every change.'],
        success: ['The second version reads clearly adult', 'Changes listed'],
        example: 'Second version: 8 heads instead of 7, a longer neck, a defined jaw, slightly smaller eyes set lower, broader shoulders and hips.',
        search: 'adult anime proportions comparison',
      },
      'adult-study': {
        sessions: 3,
        steps: ['4 references of adult characters.', 'Mark head count, eye position and jawline.'],
        success: ['Measurements noted', 'Adult cues identified'],
        example: 'Four adult characters with notes: 7.8 heads, eyes at the middle of the head, a long jaw.',
        search: 'adult anime character proportions',
      },
    },
  },
  'a3-curves': {
    method: ['One clear line of action.', 'Weight on one leg; hip out; shoulders the other way.', 'Add a twist between ribcage and pelvis.', 'Keep hands and feet relaxed.'],
    more: ['Pin-up appeal comes from gesture: an S-curve through the whole body and a confident weight shift.'],
    ex: {
      'pinup-gestures': {
        sessions: 6,
        steps: ['15 poses at 1 minute.', 'Line of action and contrapposto tilts.', 'Circle the most appealing curve.'],
        success: ['Clear S-curves', 'Opposite tilts of hips and shoulders'],
        example: 'Fifteen gestures with one flowing S-line each, the hips and shoulders tilted against each other.',
        search: 'pin-up pose gesture drawing contrapposto',
      },
      'pinup-memory': {
        sessions: 4,
        steps: ['3 invented poses from memory.', 'Gesture and plumb line first.'],
        success: ['Balanced and appealing', 'Clear line of action'],
        example: 'A leaning pose, a seated pose and a standing pose with a hand in the hair, each with a strong curve.',
        search: 'pin-up poses from imagination',
      },
    },
  },
  'a3-camera': {
    method: ['Choose the mood.', 'Pick the camera: low (confident), high (intimate), tilted (playful).', 'Show the pose’s best line.', 'Crop mid-limb.'],
    more: ['Camera and crop decide how a pin-up feels.'],
    ex: {
      'pinup-camera-study': {
        sessions: 4,
        steps: ['One pose from 3 camera angles.', 'Check with the 3D figure.', 'Note the mood.'],
        success: ['Correct foreshortening', 'Three moods'],
        example: 'One pose seen from below (confident), at eye level (relaxed) and from above (intimate).',
        search: 'character camera angle low high illustration',
      },
    },
  },
  'a4-expression': {
    method: ['Lids: half-closed or a glance.', 'Mouth: slight smile or parted lips.', 'Blush and hands support the mood.', 'Keep it adult and confident.'],
    more: ['Mood lives in small changes of the lids, mouth and hands.'],
    ex: {
      'sensual-face': {
        sessions: 4,
        steps: ['6 expressions on your character.', '4 hand gestures.', 'Note what changed in each.'],
        success: ['Expressions read clearly', 'Adult and confident'],
        example: 'A glance over the shoulder, half-closed eyes with a slight smile, a hand resting at the collarbone.',
        search: 'anime adult expressions half closed eyes',
      },
    },
  },
  'a5-skin': {
    method: ['Base skin flat.', 'Warm, saturated shadow edge.', 'Cooler deep shadow.', 'Soft highlights on the most curved planes.', 'Rim light for separation.'],
    more: ['Soft, glowing skin comes from warm shadow edges and soft transitions.'],
    ex: {
      'skin-study': {
        sessions: 4,
        steps: ['One figure, warm light and cool light.', 'Mark the terminator and warm it.', 'Soft highlights.'],
        success: ['Warm shadow edges', 'Two clear lighting versions'],
        example: 'Warm light: peach skin, rosy terminator, violet shadows. Cool light: pale skin, blue shadows, a warm rim from a second light.',
        search: 'skin rendering warm terminator anime',
      },
    },
  },
  'a6-swim': {
    method: ['Construct the body.', 'Fabric follows contours tightly.', 'Tension folds between high points.', 'Straps press slightly into soft forms.'],
    more: ['Tight clothes show the body’s forms, so construction has to be right.'],
    ex: {
      'swim-study': {
        sessions: 4,
        steps: ['3 figures, construction first.', 'Fabric edges as contour lines.', 'Tension folds and strap pressure.'],
        success: ['Edges wrap around forms', 'Construction visible'],
        example: 'A swimsuit edge curving around the hip as a contour, small tension folds at the side.',
        search: 'swimsuit fabric drawing contour lines',
      },
    },
  },
  'a6-sheer': {
    method: ['Paint what’s underneath.', 'Sheer layer at lower opacity.', 'Darker where fabric folds over itself.', 'Wet: darker, clinging, sharp highlights.'],
    more: ['Sheer and wet fabrics are technical showpieces: layering and highlights do the work.'],
    ex: {
      'sheer-study': {
        sessions: 4,
        steps: ['One sheer and one wet fabric study.', 'Layer opacity for sheerness.', 'Sharp highlights for wetness.'],
        success: ['Translucency reads', 'Wet fabric clings'],
        example: 'A sheer sleeve showing the arm faintly, darker at folds; a wet shirt clinging to the shoulders with sharp white highlights.',
        search: 'sheer fabric painting tutorial',
      },
    },
  },
  'a7-nude': {
    method: ['Thumbnails.', 'Focal point and light.', 'Decide what to show and what to imply.', 'Solid anatomy underneath.', 'Polish.'],
    more: ['Plan nude pieces like any illustration. Implication through light, hair, props and crop is often stronger than showing everything.'],
    ex: {
      'nude-piece': {
        sessions: 1,
        steps: ['Ten thumbnails.', 'Sketch with construction.', 'Lines, flats, shading.', 'Polish across several focus blocks.'],
        success: ['Adult character, solid anatomy', 'Clear focal point and light'],
        example: 'A finished, tasteful nude of an adult character, lit by a window, with careful use of shadow and crop.',
        search: 'figure painting window light composition',
      },
    },
  },
  'a8-portfolio': {
    method: ['Pick 6–10 adult pieces.', 'Cut weak pieces.', 'Polish.', 'Publish with age gating, separate from the main portfolio.'],
    more: ['Keep adult work separate, clearly age-gated, and consistent in quality.'],
    ex: {
      'adult-portfolio': {
        sessions: 2,
        steps: ['Select 6–10 pieces.', 'Polish two.', 'Order strongest first and last.'],
        success: ['Consistent quality', 'Adult characters only'],
        example: 'Eight pieces: four pin-ups, two nude illustrations, two studies.',
        search: 'illustration portfolio layout',
      },
    },
  },
};
