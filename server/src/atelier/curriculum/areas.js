// Skill areas: the spokes of your skill radar, the regions of your valley,
// and a scoring guide (rubric) per area used for self-rating and critiques.
// Each criterion is scored 1-5: 1 = not yet, 3 = working, 5 = confident.

const AREAS = [
  {
    id: 'line',
    name: 'Line',
    region: 'Riverbank',
    criteria: [
      { id: 'confidence', name: 'Confident strokes', hint: 'Lines drawn in one smooth motion, no hairy or chicken-scratch lines' },
      { id: 'accuracy', name: 'Hitting the target', hint: 'Lines start and end where you aimed' },
      { id: 'weight', name: 'Line weight', hint: 'Thicker where it matters (overlaps, shadow side), thinner where light hits' },
    ],
  },
  {
    id: 'form',
    name: 'Form',
    region: 'Stone fields',
    criteria: [
      { id: 'solidity', name: 'Feels 3D', hint: 'Shapes read as solid forms, not flat outlines' },
      { id: 'construction', name: 'Construction', hint: 'Built from simple forms that overlap believably' },
      { id: 'ellipses', name: 'Ellipses and cross-sections', hint: 'Contour lines and ellipses follow the form and match its angle' },
    ],
  },
  {
    id: 'perspective',
    name: 'Perspective',
    region: 'Old road',
    criteria: [
      { id: 'convergence', name: 'Convergence', hint: 'Lines meet at consistent vanishing points' },
      { id: 'horizon', name: 'Eye level', hint: 'Everything agrees on one horizon line' },
      { id: 'scale', name: 'Size in depth', hint: 'Things shrink believably with distance' },
    ],
  },
  {
    id: 'gesture',
    name: 'Gesture',
    region: 'Wind meadow',
    criteria: [
      { id: 'action', name: 'Line of action', hint: 'One clear main curve carries the whole pose' },
      { id: 'flow', name: 'Flow and rhythm', hint: 'Curves lead into each other; no stiff, disconnected parts' },
      { id: 'weight', name: 'Weight and balance', hint: 'The figure stands, leans or pushes believably' },
    ],
  },
  {
    id: 'anatomy',
    name: 'Anatomy',
    region: 'Deep woods',
    criteria: [
      { id: 'proportion', name: 'Proportions', hint: 'Lengths and sizes relate correctly (head counts, limb lengths)' },
      { id: 'landmarks', name: 'Landmarks', hint: 'Bony points and joints sit in the right places' },
      { id: 'mass', name: 'Masses', hint: 'Ribcage, pelvis and limbs read as connected masses' },
    ],
  },
  {
    id: 'face',
    name: 'Faces',
    region: 'Lantern hill',
    criteria: [
      { id: 'construction', name: 'Head construction', hint: 'The head is a turned 3D form; features follow its centre line' },
      { id: 'placement', name: 'Feature placement', hint: 'Eyes, nose, mouth and ears line up and are spaced consistently' },
      { id: 'expression', name: 'Expression', hint: 'The emotion reads clearly from eyes, brows and mouth together' },
    ],
  },
  {
    id: 'cloth',
    name: 'Clothing',
    region: 'Weavers’ terraces',
    criteria: [
      { id: 'folds', name: 'Fold logic', hint: 'Folds come from tension points and pull in the right direction' },
      { id: 'wrap', name: 'Wraps the body', hint: 'Fabric hugs and drapes over the forms underneath' },
      { id: 'material', name: 'Material', hint: 'Thick, thin, stiff or soft fabric reads differently' },
    ],
  },
  {
    id: 'value',
    name: 'Light & value',
    region: 'Sun clearing',
    criteria: [
      { id: 'light', name: 'Consistent light', hint: 'One clear light direction; shadows agree with it' },
      { id: 'grouping', name: 'Value grouping', hint: 'Lights and darks group into a few clear shapes' },
      { id: 'form', name: 'Shading shows form', hint: 'Core shadow, cast shadow and highlights describe the form' },
    ],
  },
  {
    id: 'color',
    name: 'Colour',
    region: 'Orchard',
    criteria: [
      { id: 'harmony', name: 'Harmony', hint: 'Colours belong together (limited, intentional palette)' },
      { id: 'temperature', name: 'Temperature', hint: 'Warm and cool shift between light and shadow' },
      { id: 'value', name: 'Values in colour', hint: 'Works in greyscale too; colours don’t flatten the values' },
    ],
  },
  {
    id: 'composition',
    name: 'Composition',
    region: 'Lake shore',
    criteria: [
      { id: 'focus', name: 'Focal point', hint: 'The eye goes where you want first' },
      { id: 'framing', name: 'Framing and crop', hint: 'The figure sits well in the frame; good negative space' },
      { id: 'story', name: 'Story and mood', hint: 'Pose, angle and setting say something together' },
    ],
  },
  {
    id: 'rendering',
    name: 'Rendering',
    region: 'Old town',
    criteria: [
      { id: 'lineart', name: 'Clean lineart', hint: 'Confident, tapered final lines with intentional weight' },
      { id: 'finish', name: 'Finish', hint: 'Shading, effects and details are consistent and purposeful' },
      { id: 'appeal', name: 'Appeal', hint: 'The piece is attractive and reads clearly at thumbnail size' },
    ],
  },
];

const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));

module.exports = { AREAS, AREA };
