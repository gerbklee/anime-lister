// Detail for Stages 4–5 (faces, hair, clothing).

module.exports = {
  's4-head': {
    method: [
      'Draw a sphere for the cranium.',
      'Cut a slice off the side (an ellipse) to show which way the head faces.',
      'Draw the centre line down the front and the brow line around the sphere.',
      'Hang the jaw from the slice down to the chin; the chin sits on the centre line.',
      'Divide the face: brow line, nose line, chin; in anime the eyes sit near the middle of the head.',
      'Place the ears behind the slice, between brow and nose lines.',
    ],
    more: [
      'The Loomis method looks technical, but it’s the reason professional anime artists can draw a character’s head from any angle and keep it on-model. Anime faces simplify the features, not the skull: the eyes, nose and mouth still sit on a curved front that turns with the head.',
      'Anime proportions differ from realism mostly in the lower face: a smaller chin, a shorter nose-to-mouth distance and bigger eyes set a little lower. Choose your proportions once per character and keep them.',
    ],
    ex: {
      'heads-angles': {
        sessions: 6,
        steps: ['Make a 3 × 3 grid.', 'Columns: front, 3/4, profile. Rows: looking up, level, looking down.', 'In each cell: sphere, side slice, centre line, brow line, jaw.', 'No features; just mark eye, nose and mouth positions with small lines.'],
        success: ['Centre and brow lines curve consistently with each angle', 'Looking up: brow line curves up, chin shows from below', 'The jaw stays the same size across angles'],
        example: 'Nine construction heads like a turnaround chart. In the “3/4 looking down” cell, the brow line curves down like a frown, the centre line is pushed to one side, the chin almost hidden. If all rows look the same, you aren’t tilting the brow line enough.',
        search: 'loomis head construction angles grid',
      },
      'head-study': {
        sessions: 5,
        steps: ['Six references at different angles.', 'For each: find the angle, then draw the Loomis construction over where the head is.', 'Check: do your centre and brow lines match the reference’s features?', 'Add simple features on the construction.'],
        success: ['Construction matches the reference angle (overlay)', 'Features sit on the construction lines'],
        example: 'A character looking up and to the left: the sphere with the slice on the right side, the brow line curving up, the eyes on a curve that bends upward. Overlay shows the jaw drawn slightly too long, a common correction.',
        search: 'anime head construction study',
      },
      'head-memory': {
        sessions: 4,
        steps: ['From memory: your character’s head turned 3/4 and looking down.', 'Construction first, then features and hair.', 'Find a reference at a similar angle afterwards and compare.'],
        success: ['The angle reads clearly', 'The character is recognisable'],
        example: 'Head turned 3/4 left, looking down: the far eye narrower and closer to the edge, the brow line curving down, the nose pointing down. The hair hangs forward slightly.',
        search: 'anime face three quarter looking down',
      },
    },
  },
  's4-eyes': {
    method: [
      'Place the eye line on the head construction (curving with the head).',
      'Draw the upper lid as a strong, thick curve; the lower lid lighter and shorter.',
      'Draw the iris as an ellipse, partly hidden under the upper lid.',
      'Add the pupil and highlights that match your light source.',
      'Add eyelashes from the lid edge, clumped, longer at the outer corner.',
      'In 3/4 view: the far eye is narrower and slightly shorter.',
    ],
    more: [
      'Every anime style has its own eye shape, but they share rules: the upper lid carries the weight and the expression, the iris is a big ellipse that tilts with the head, and highlights are bold design shapes. The eye must still sit in a socket, under a brow, on a curved surface.',
      'Studying several styles side by side (interleaving) is the fastest way to understand which choices make a style: how much white shows, where the lashes thicken, how many highlights, how the lower lid is drawn.',
    ],
    ex: {
      'eye-study': {
        sessions: 6,
        steps: ['Collect references from 4 different artists or anime.', 'Copy 3 eyes from each, mixing the order (A, B, C, D, A, B…).', 'Next to each, write one thing that style simplifies or exaggerates.', 'Compare the four styles at the end.'],
        success: ['Upper lids stronger than lower lids', 'Iris partly covered by the upper lid', 'Notes for each style'],
        example: 'Twelve eyes in a grid with notes: “Style A: thick upper lid, no lower lashes, two highlights”, “Style B: round iris, lots of white, star highlight”, “Style C: sharp angular lid, small iris”, “Style D: painterly, gradient iris”.',
        search: 'anime eye styles comparison chart',
      },
      'eye-memory': {
        sessions: 4,
        steps: ['From memory: a pair of eyes in front view and 3/4 view.', 'Use the eye line on a quick head construction.', 'Compare with your study page.'],
        success: ['Both eyes on one curve', 'Far eye narrower in 3/4'],
        example: 'Front: two eyes one eye-width apart, mirrored. 3/4: the near eye full size, the far one narrower and partly behind the nose bridge. If both 3/4 eyes look identical, the face looks flat.',
        search: 'anime eyes three quarter view',
      },
    },
  },
  's4-features': {
    method: ['Nose: place it on the nose line, on the centre line; in anime often a small tick or shadow.', 'In 3/4 the nose shifts towards the near side and its tip can break the far cheek line.', 'Mouth: on the curved muzzle, about a third of the way from nose to chin.', 'Ears: behind the side slice, between the brow line and nose line.', 'In profile: nose pointing out, lips stepped back, chin under the lower lip.'],
    more: ['Small features, wrongly placed, ruin a face faster than anything. In anime the nose may be a single line, but its position still follows the 3D nose: that one line moves across the face as the head turns.', 'Profiles are the best training: the silhouette of brow, nose, lips and chin shows the face’s structure clearly.'],
    ex: {
      'feature-study': {
        sessions: 5,
        steps: ['Ten references in profile and 3/4.', 'Construct the head first.', 'Place the nose, mouth and ear on the construction lines.', 'Compare positions with the overlay.'],
        success: ['Ears line up between brow and nose lines', 'Nose and mouth move with the centre line'],
        example: 'A row of profiles: a small pointed nose, a short gap to the lips, the ear well behind the middle of the head. A 3/4 face: the nose tip just touching the far cheek line, the mouth shifted to the near side.',
        search: 'anime face profile nose mouth placement',
      },
    },
  },
  's4-expressions': {
    method: ['Decide the emotion and its strength (1–5).', 'Brows first: angle and position.', 'Lids: wide, relaxed, narrowed, closed.', 'Mouth: shape and openness.', 'Add secondary signs: blush, sweat drop, tears, clenched teeth.', 'Push it further than feels natural, then check if it reads.'],
    more: ['Expressions work as a system: brows, lids and mouth must agree. A smiling mouth with neutral eyes reads as fake; adding raised cheeks that push the lower lids up makes it real. Anime adds a symbol vocabulary (blush lines, sweat drops, anger marks) that supports, but shouldn’t replace, the face itself.'],
    ex: {
      'expression-study': {
        sessions: 4,
        steps: ['Copy 8 expressions from references.', 'For each, write which features carry the emotion.', 'Note the anime symbols used.'],
        success: ['Brows, lids and mouth agree in each', 'Notes explain the key change'],
        example: 'Anger: brows pulled down and together, lids narrowed, mouth wide with teeth, a vein mark. Embarrassment: brows up and in, eyes looking away, mouth a small wavy line, blush lines across the nose.',
        search: 'anime expression chart',
      },
      'expression-memory': {
        sessions: 4,
        steps: ['Your character, six expressions: happy, angry, sad, shocked, embarrassed, smug.', 'Same head angle for all, so only the face changes.', 'Check them against your study notes.'],
        success: ['Each emotion reads without labels', 'The character stays on-model'],
        example: 'A 2 × 3 grid of your character’s face. Smug: one brow raised, lids half-closed, a lopsided smile. Shocked: tiny pupils, raised brows, mouth open in a small oval.',
        search: 'character expression sheet anime',
      },
    },
  },
  's4-hair': {
    method: ['Draw the skull, then the hairline.', 'Mark the parting and the direction hair flows from it.', 'Block the hair as 5–8 big clumps with volume above the skull.', 'Overlap clumps; let them split into smaller clumps at the ends.', 'Add a few strands breaking the silhouette.', 'Shade between clumps, not along every strand.'],
    more: ['Hair is one of the most recognisable parts of an anime character, and one of the easiest to make look good once you think in clumps. Draw it as ribbon-like shapes with volume, not as lines.', 'Hair always sits above the skull (it has thickness) and moves as one mass: if the head tilts or the wind blows, every clump follows.'],
    ex: {
      'hair-study': {
        sessions: 5,
        steps: ['Six hairstyles from references.', 'First pass: 5–8 big clumps only.', 'Second pass on a new layer: split the clumps, add strands.', 'Compare the two passes.'],
        success: ['First pass reads as the hairstyle', 'Hair has volume above the skull', 'Clumps overlap'],
        example: 'Twin tails: the first pass is a cap over the skull plus two big ribbons; the second adds three or four sub-clumps per tail, a few loose strands and the ties. It looks good after the first pass already.',
        search: 'anime hair clumps tutorial',
      },
      'hair-memory': {
        sessions: 3,
        steps: ['Your character’s hair from the back and 3/4.', 'Skull and parting first.', 'Compare with references of the character.'],
        success: ['Back view shows where clumps start', 'Consistent with the front design'],
        example: 'The back of a long hairstyle: clumps fanning from the crown, gathering at the neck, ending in tapered points.',
        search: 'anime hair back view drawing',
      },
    },
  },
  's4-project': {
    method: ['Choose 9 expressions and 4 angles.', 'Construct all heads with the same proportions.', 'Add features, then expressions, then hair.', 'Clean lines on vector layers.'],
    more: ['Expression sheets are how studios keep characters consistent between animators. Yours is the test of this stage: construction, features, expressions and hair, all on-model.'],
    ex: {
      'expression-sheet': {
        sessions: 1,
        steps: ['Lay out a 3 × 3 grid.', 'Plan angles: at least front, 3/4, profile and one looking up or down.', 'Construct every head; keep the same proportions (check by overlaying two).', 'Expressions, hair, then clean lines.', 'Upload with construction visible at low opacity.'],
        success: ['Nine readable expressions', 'Character recognisable in every panel', 'At least four angles'],
        example: 'A sheet of your character: neutral front, happy 3/4, angry 3/4 looking down, sad profile, surprised looking up, embarrassed, smug, crying and determined. Same hair shapes in every panel.',
        search: 'anime character expression sheet multiple angles',
      },
    },
  },
  's5-folds': {
    method: ['Find the tension points: where fabric is held or pulled (shoulders, elbows, knees, belt).', 'Folds radiate from tension points.', 'Pick the fold type: pipe, zigzag, spiral, half-lock, diaper, drop, inert.', 'Draw the big folds first; add small ones last.', 'Use line weight: deeper folds get darker lines.'],
    more: ['Folds look chaotic until you know the seven types. Each comes from a specific situation: fabric hanging from one point makes pipe folds, fabric bent in a sleeve makes zigzags. Identifying the situation tells you what to draw.', 'Anime simplifies folds a lot, but the right fold type in the right place is what makes clothes believable even with three lines.'],
    ex: {
      'fold-study': {
        sessions: 6,
        steps: ['Find all seven fold types in references (dresses, coats, sleeves, trousers).', 'Draw each one and label it.', 'Mark the tension points with dots.'],
        success: ['All seven types found and labelled', 'Folds radiate from tension points'],
        example: 'A page with seven labelled studies: pipe folds on a hanging skirt, zigzags in a bent sleeve, a spiral around a raised arm, a half-lock at the back of the knee, a diaper fold between two pinned points of a cape, a drop fold of a falling scarf, inert folds of a cloth on the floor.',
        search: 'seven types of folds drawing',
      },
      'fold-memory': {
        sessions: 3,
        steps: ['From memory: a bent sleeve and a hanging skirt.', 'Mark tension points first.', 'Compare with your fold study.'],
        success: ['Zigzag folds in the bent sleeve', 'Pipe folds in the skirt'],
        example: 'A sleeve bent at the elbow with three zigzag folds on the inside; a skirt hanging from the waist with pipe folds that widen towards the hem.',
        search: 'sleeve folds bent elbow drawing',
      },
    },
  },
  's5-weight': {
    method: ['Name the material: silk, cotton, denim, wool, leather.', 'Thin: many small sharp folds, clinging.', 'Thick: few large rounded folds, holding shape.', 'Stiff: hard creases, barely bending.', 'Show thickness at hems and edges.'],
    more: ['The same pose in different materials is one of the best studies there is: it isolates the fabric so you see how weight changes folds.'],
    ex: {
      'fabric-study': {
        sessions: 4,
        steps: ['One pose, three times: silk dress, denim jacket and jeans, thick winter coat.', 'Same body underneath (copy the mannequin layer).', 'Change only the folds and edge thickness.'],
        success: ['Three materials recognisably different', 'Hems show thickness'],
        example: 'Silk: thin flowing folds that cling to the hips. Denim: chunky folds at the knees and elbows. Coat: big, soft, rounded shapes, thick collar and cuffs.',
        search: 'fabric weight folds comparison drawing',
      },
    },
  },
  's5-wrap': {
    method: ['Draw the body (mannequin or light anatomy).', 'Draw seams, collars, cuffs and hems as contour lines around the body.', 'Where clothes touch the body: follow it.', 'Where they hang free: gravity.', 'Add folds at tension points last.'],
    more: ['Clothes are the third layer of construction: forms, then body, then fabric. A hem that goes straight across a leg instead of curving around it instantly flattens the figure; drawing it as a contour line gives it depth for free.'],
    ex: {
      'outfit-study': {
        sessions: 5,
        steps: ['Copy 3 full outfits from references.', 'Draw the mannequin underneath first.', 'Draw every seam and hem as a contour around the body.', 'Add folds at joints and the waist.'],
        success: ['Hems and cuffs curve around the body', 'The body can be felt under the clothes'],
        example: 'A school uniform: the skirt hem curving around the thighs, the sailor collar lying over the shoulders like a contour, sleeves with curved cuffs. A mannequin shows faintly underneath.',
        search: 'anime school uniform drawing reference body underneath',
      },
      'outfit-memory': {
        sessions: 3,
        steps: ['Take a mannequin pose from Stage 2.', 'Dress it in an outfit from memory.', 'Compare with outfit references.'],
        success: ['The outfit follows the pose', 'Folds at the joints'],
        example: 'The running mannequin from Stage 2, now in a hoodie and shorts: the hoodie stretching across the back, zigzag folds at the bent elbow, shorts riding up on the lifted leg.',
        search: 'clothes on figure from imagination',
      },
    },
  },
  's5-costume': {
    method: ['Treat armour as rigid boxes and cylinders strapped to the body.', 'Let joints stay free of rigid plates.', 'Place buttons, pleats, ties and ribbons on contour lines.', 'Show weight: where accessories hang and press.', 'Design in silhouette first: is it recognisable in black?'],
    more: ['Anime character designs are often defined by costume details: a coat with a specific collar, armour with layered plates, a bag with charms. Construct them like the objects in Stage 1, then fit them to the body.'],
    ex: {
      'costume-study': {
        sessions: 4,
        steps: ['A character with armour or a detailed uniform.', 'Body first, then rigid parts as forms, then soft parts.', 'Place details on contour lines.', 'Check the silhouette by filling it black on a copy.'],
        success: ['Rigid parts look rigid; joints can move', 'Details wrap around the body'],
        example: 'A knight: the chest plate as a curved box, shoulder pads as half-spheres, cloth tabard between the plates showing folds at the waist. The silhouette is recognisable in black alone.',
        search: 'anime armor design construction',
      },
    },
  },
  's5-project': {
    method: ['Pick a dynamic pose and an outfit with at least two materials.', 'Gesture, mannequin, body, then clothes.', 'Folds from tension points; material weight visible.', 'Clean lines with weight; work across focus blocks.'],
    more: ['Clothing on a moving figure is the real test: fabric reacts to the pose, flies in the wind and wraps around the twisting body.'],
    ex: {
      'outfit-project': {
        sessions: 1,
        steps: ['Thumbnail 3 poses; pick the most dynamic.', 'Construct the body.', 'Layer the outfit: inner (shirt), outer (coat or jacket), accessories.', 'At least two fabric weights.', 'Clean lines; upload with construction at low opacity.'],
        success: ['Fabric follows the movement', 'Two materials clearly different', 'Body felt under the clothes'],
        example: 'Your character leaping, a long coat flaring behind (thick fabric, big folds) over a thin shirt pulled tight across the chest, a scarf trailing in drop folds.',
        search: 'anime character dynamic pose coat flowing',
      },
    },
  },
};
