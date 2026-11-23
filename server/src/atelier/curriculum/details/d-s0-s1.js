// Detail for Stages 0–1: a step-by-step method per lesson, a deeper
// explanation, and for every exercise: how many sessions (on separate days),
// exact steps, what success looks like, and a worked example.
// `search` is an image search for example pictures.

module.exports = {
  's0-how': {
    method: [
      'Before each session, read “Today’s one thing” and say it out loud.',
      'Start a focus block for each exercise; put the phone away.',
      'Do the exercise slightly faster or harder than feels comfortable.',
      'Check your result (flip, zoom out, overlay) and fix the biggest error once.',
      'Upload it, even when it’s bad, and rate yourself before reading any critique.',
      'Do your reviews even on easy days: they’re what makes old lessons stay.',
    ],
    more: [
      'Expect plateaus. Skill grows in steps: weeks where nothing seems to change, then a sudden jump when something clicks. The heatmap and skill checks exist so you can see the slow part of that curve too.',
      'Atelier asks you to repeat every exercise on several different days and to put real hours into each stage before the next opens. That isn’t padding: one session teaches you what to do, the repetitions spread over days are what make your hand and eye actually do it without thinking.',
    ],
    ex: {},
  },
  's0-csp': {
    method: [
      'Create the canvas and save it as a template (File → Save as template).',
      'Pick exactly two brushes: Real pencil for sketching, G-pen for lines.',
      'Set the Flip horizontally shortcut and test it.',
      'Make three layers: Sketch (30% opacity, blue), Lines, Colour.',
      'Practise the sketch-then-clean-lines workflow once on something simple.',
    ],
    more: [
      'The goal of this lesson is to make the software disappear: when you sit down to draw, everything should already be where your hand expects it. A fixed template, two brushes and a few shortcuts take away almost every decision that isn’t about drawing.',
      'Resist installing brush packs and watching every CSP feature video. You’ll meet each tool in the lesson that needs it, with the Clip Studio guide right there.',
    ],
    ex: {
      setup: {
        sessions: 1,
        steps: [
          'File → New → Illustration: 3000 × 2000 px, 300 dpi. Save it as your practice template.',
          'In the Tool palette choose Pencil → Real pencil and Pen → G-pen; drag both into Quick Access.',
          'File → Shortcut settings → View menu → Flip horizontally: assign H.',
          'Create layers “Sketch”, “Lines”, “Colour”; set Sketch to 30% opacity and blue layer colour.',
          'Sketch a simple object (a mug) for 2 minutes on Sketch, then draw clean lines over it on Lines.',
        ],
        success: ['You can switch between the two brushes without searching', 'H flips the canvas', 'Your clean lines are on their own layer above a faint blue sketch'],
        example: 'A finished setup page: a loose blue pencil sketch of a mug at low opacity, and on top a single clean G-pen outline of the mug with a handle. Three layers named Sketch, Lines, Colour in the Layer palette.',
        search: 'clip studio paint sketch layer blue lineart layer',
      },
    },
  },
  's0-tablet': {
    method: [
      'Adjust pen pressure so a light touch gives a thin line.',
      'Sit upright, tablet close, elbow free to move.',
      'For long lines, lock the wrist and move from the shoulder.',
      'Rotate the canvas (not your hand) so every stroke is a comfortable direction.',
      'Take a break at every bell; shake out your hand.',
    ],
    more: [
      'Hand–eye coordination on a screenless tablet takes a few weeks to feel natural; on a screen tablet it’s faster but you’ll hide part of the drawing with your hand. Either way, the fix is the same: lots of simple strokes, done calmly, every day.',
      'Pressure control is what gives anime line art its life: thin, tapering ends and thicker strokes where lines overlap or turn into shadow. Practise it now, while the strokes are simple.',
    ],
    ex: {
      pressure: {
        sessions: 4,
        steps: ['Use the G-pen at about 15 px on a blank layer.', 'Draw a row of 10 horizontal strokes, each a little thicker than the last, from hair-thin to full.', 'Below it, draw 10 strokes that start thin, swell in the middle and taper out again.', 'Repeat both rows with vertical strokes.'],
        success: ['The 10 thicknesses step up evenly, no jumps', 'Tapered strokes fade to a point at both ends', 'No blobs where you start or stop'],
        example: 'A good ladder looks like a staircase of lines from a hairline to a thick bar, evenly spaced. A good taper looks like a long grain of rice drawn in one motion. Typical first try: the first five lines look the same and the last one jumps to thick; that means the pressure curve needs adjusting.',
        search: 'pen pressure control exercise tapered lines',
      },
      arm: {
        sessions: 6,
        steps: ['Zoom out so the canvas fits the screen.', 'Lock your wrist and draw long lines across the whole canvas from the shoulder.', 'Vary directions: horizontal, vertical, diagonal both ways.', 'Don’t correct anything; keep a steady speed.', 'Fill the page, then flip it and look for wobbles.'],
        success: ['Lines are straight across most of their length', 'Ends don’t hook or curl', 'You feel the motion in your shoulder, not your fingers'],
        example: 'A full page of long, mostly straight strokes in all directions, like a loose weave. Early pages show a curve at the end of each stroke (the wrist taking over); later ones stay straight to the end.',
        search: 'drawing from the shoulder long straight lines exercise',
      },
    },
  },
  's0-routine': {
    method: ['Write your “When …, I …” plan in Settings.', 'Set a weekly target you’d hit even in a busy week.', 'Choose a reminder time.', 'Do the first skill check now, without preparation.'],
    more: [
      'The skill check is a snapshot, not an exam. Draw it quickly and honestly; it’s your “before” picture. Every four weeks you’ll draw the same four prompts again, and Progress shows them side by side.',
    ],
    ex: {
      'first-check': {
        sessions: 1,
        steps: ['Open Today → Skill check, or the Check page.', 'Start each prompt’s timer and stop when it rings.', 'Draw from imagination where the prompt says so: no looking things up.', 'Upload each drawing straight away; don’t redo any.'],
        success: ['All four prompts uploaded', 'Each drawn within its time limit'],
        example: 'A typical first round: a box whose sides don’t converge, a head with features too low, a stiff 2-minute figure, a hand like a mitten. All normal. That’s exactly what the next rounds will be compared against.',
        search: 'beginner drawing before and after one year',
      },
    },
  },

  // ---- Stage 1 -------------------------------------------------------------------------------
  's1-lines': {
    method: [
      'Place a start dot and an end dot.',
      'Rotate the canvas so the stroke goes in your most comfortable direction.',
      'Ghost: move the pen just above the surface along the path 2–3 times.',
      'Draw in one confident stroke, slightly faster than feels safe.',
      'Don’t fix it. Judge it, then draw the next one better.',
    ],
    more: [
      'Line confidence is mostly a decision, not a talent. A wobbly line almost always comes from drawing slowly while trying to steer. Ghosting moves the steering to before the stroke, so the stroke itself can be fast and smooth.',
      'Anime line art depends on this skill more than any other style: clean, long, tapering lines with no hairy edges. These drills look boring, but you’ll do them as warm-ups for months, and every line you draw afterwards benefits.',
    ],
    ex: {
      superimposed: {
        sessions: 5,
        steps: ['Draw one straight line about a hand long.', 'Place the pen on its start, ghost along it, and draw a second line exactly on top.', 'Repeat 8 times, so 9 lines in total sit on one path.', 'Do 10 such stacks in different directions and lengths, including one across the whole page.'],
        success: ['Each stack looks like one slightly thicker line, not a fan', 'Line ends stay together (no spread at the end)', 'No line is drawn in pieces'],
        example: 'Good: 10 stacks that look like slightly fuzzy single lines, with a tiny spread only at the far end. Beginner pages often show the lines fanning out at the end like a broom: that means you aimed at the start but not the finish. Ghost towards the end point.',
        search: 'drawabox superimposed lines',
      },
      ghosted: {
        sessions: 6,
        steps: ['Scatter pairs of dots across the page at different distances.', 'For each pair: rotate if needed, ghost 2–3 times, draw in one stroke.', 'Mix lengths from 3 cm to the full page.', 'Fill the page with 30 lines.', 'Circle the 3 worst lines and look at why (slow? wrist? aimed badly?).'],
        success: ['Lines start and end on the dots (or within a dot’s width)', 'They are straight, without a curve at the end', 'Long lines are as smooth as short ones'],
        example: 'A page of 30 lines crisscrossing like a star chart, each sitting on its two dots. Common in week one: the long lines bow slightly in the middle; by week three they straighten as the shoulder takes over.',
        search: 'drawabox ghosted lines exercise',
      },
      curves: {
        sessions: 4,
        steps: ['Place three dots that suggest a gentle curve.', 'Ghost the curve through all three, then draw it in one go.', 'Do 10 C-curves and 10 S-curves (place four dots for S-curves).', 'Draw some large enough to need your whole arm.'],
        success: ['The curve passes through all dots', 'It bends smoothly, without flat spots or kinks', 'S-curves have an even change of direction'],
        example: 'Twenty smooth arcs, like the edges of leaves and ribbons. These are the curves you’ll later use for hair, cheeks and fabric. A kink usually means you slowed down in the middle.',
        search: 'drawing curves through points exercise',
      },
    },
  },
  's1-ellipses': {
    method: [
      'Decide the ellipse’s angle and how open it is (its degree).',
      'Ghost the ellipse shape above the surface, circling the motion.',
      'Draw it by going around 2–3 times in one continuous movement.',
      'Check: are both ends equally round? Is the minor axis where you wanted it?',
      'For cylinders and eyes later: draw the minor axis first, then the ellipse around it.',
    ],
    more: [
      'An ellipse has two axes at right angles: the long major axis and the short minor axis. The minor axis is the important one: on a cylinder it runs along the cylinder’s centre line, on a wheel it is the axle. If the minor axis doesn’t match the form, the object looks broken even when the ellipse itself is perfect.',
      'In anime drawing you’ll use ellipses constantly without seeing them: the eyes sit on an ellipse around the head, sleeves and skirts end in ellipses, a turned head is built on an ellipse for the brow line. These two drills are the training ground for all of that.',
    ],
    ex: {
      tables: {
        sessions: 5,
        steps: ['Draw a rectangle (“table”) about half a page wide.', 'Fill it with ellipses of different sizes and degrees that just touch each other and the edges.', 'Draw each ellipse around 2–3 times, quickly.', 'Make 3 tables per session; vary the angles of the ellipses.'],
        success: ['Ellipses touch their neighbours and the table edges without big gaps or overlaps', 'Both ends of each ellipse are equally round', 'Lines go around 2–3 times, staying close together'],
        example: 'A table packed like a box of eggs and pebbles: big and small ellipses, some tilted, all touching. Beginners often leave gaps (aiming too carefully) or draw lemons with pointed ends (moving too slowly at the turns).',
        search: 'drawabox ellipses in tables',
      },
      funnels: {
        sessions: 4,
        steps: ['Draw a long, gently curved line: the minor axis.', 'Draw two lines on either side that widen and narrow, like a funnel.', 'Stack ellipses between them, each one centred on the axis and at right angles to it.', 'Do 4 funnels with different curves.'],
        success: ['Every ellipse is cut in half by the axis line', 'Ellipses fill the width of the funnel at their spot', 'They get rounder or thinner smoothly, not randomly'],
        example: 'A funnel looks like a curved stack of rings, like a slinky bent in an arc. The most common error is ellipses tilted against the axis, which looks like a crooked stack of plates.',
        search: 'drawabox ellipse funnels',
      },
    },
  },
  's1-forms': {
    method: [
      'Draw the form’s axis (its centre line in 3D).',
      'Draw the outline loosely around it.',
      'Draw through: add the edges and ellipses on the hidden side.',
      'Add 3–5 contour lines that wrap around the surface.',
      'Check that all contours agree with each other and with the axis.',
    ],
    more: [
      'Contour lines are the single most useful idea in construction drawing. They are the lines you’d see if the form were cut into slices: on a cylinder they’re ellipses, on a sausage they curve around the bend, on a face they show the cheek turning away. Later you’ll draw them lightly for shading, clothing seams and hair.',
      'A form that looks flat almost always has contour lines that go straight across, or ellipses that don’t match. Fix those, and the same outline suddenly reads as 3D.',
    ],
    ex: {
      arrows: {
        sessions: 4,
        steps: ['Draw a single flowing line through the page in depth, like a ribbon thrown in the air.', 'Draw a second line parallel to it, so the ribbon gets width.', 'Where the ribbon turns over, show the twist with overlapping edges.', 'Make it bigger where it comes towards you and smaller as it goes back.', 'Add an arrow head at the end; 10 arrows per session.'],
        success: ['The ribbon width shrinks with distance', 'Turns overlap correctly (the front edge covers the back)', 'You can see which side of the ribbon faces you'],
        example: 'Ten ribbons swooping through the page like streamers, wide in front and thin in the distance, with clean overlaps where they twist. Shade the underside lightly to make the twist obvious.',
        search: 'drawabox arrows exercise',
      },
      organic: {
        sessions: 5,
        steps: ['Draw a sausage form: two circles connected by smooth tube lines.', 'Draw its axis through the middle.', 'Add 3–5 contour lines that wrap around the tube, at right angles to the axis.', 'Vary forms: straight, bent, thick, thin; 10 per session.'],
        success: ['Contour lines curve around the form (never straight across)', 'The curve direction is consistent: all contours bend the same way', 'Ellipses near the ends get rounder as the surface turns toward you'],
        example: 'A page of sausages and bent tubes like balloon animals, each wrapped with 3–5 rings. A good one makes you feel which end is closer. Typical error: rings that flip direction halfway down, which makes the tube look twisted.',
        search: 'drawabox organic forms with contour lines',
      },
      'forms-memory': {
        sessions: 3,
        steps: ['No reference. Draw a box in 2-point perspective, drawn through.', 'Draw a cylinder lying at an angle, with both ellipses and its axis.', 'Draw a sphere with an equator contour and one vertical contour.', 'Compare with your drills: what did you forget?'],
        success: ['Hidden edges and ellipses are drawn', 'The far ellipse of the cylinder is rounder than the near one', 'The sphere’s contours agree on one tilt'],
        example: 'One box, one cylinder, one sphere on a page, each transparent. If your cylinder’s two ellipses look identical, it lies flat to the page: make the far one slightly rounder.',
        search: 'box cylinder sphere drawn through',
      },
    },
  },
  's1-persp1': {
    method: [
      'Draw the horizon line: this is your eye level.',
      'Place one vanishing point on it.',
      'Draw the front face of a box as a plain rectangle.',
      'Pull lines from its corners to the vanishing point.',
      'Decide the depth and close the back face with lines parallel to the front.',
      'Draw through to check the hidden corner.',
    ],
    more: [
      'In one-point perspective the front of every box faces you flat. That’s why it’s used for rooms, corridors and streets seen straight on, which are some of the most common backgrounds in anime: classrooms, hallways, train interiors.',
      'Depth is the hardest part: boxes get shorter (not just smaller) as they go back. Judge it by eye and check it later with the perspective ruler; don’t look for a formula yet.',
    ],
    ex: {
      'boxes-1pt': {
        sessions: 4,
        steps: ['Horizon across the middle, one vanishing point near the centre.', 'Draw 5 boxes above the horizon, 5 below, 5 crossing it, spread left and right.', 'For each: front rectangle, lines to the VP, back face, then draw through.', 'Afterwards, extend a few depth lines with a ruler to check they hit the VP.'],
        success: ['Every depth line points at the vanishing point', 'Boxes above show their bottom, below show their top', 'Back faces are parallel to the front faces'],
        example: 'A page like a cloud of floating cubes around one point: those above you show their undersides, those below their tops, those at eye level just a sliver. If the boxes look stretched like long tunnels, the depth is too long; shorten it.',
        search: 'one point perspective boxes above and below horizon',
      },
      'room-1pt': {
        sessions: 3,
        steps: ['Look at the reference: where is the eye level? Draw your horizon there.', 'Place the vanishing point where the reference’s depth lines meet.', 'Draw the back wall as a rectangle, then the floor, ceiling and side walls toward the VP.', 'Add a door and a table as boxes, checking their lines to the VP.', 'Overlay the reference at the end and compare.'],
        success: ['Horizon and VP match the reference', 'Door and table sit on the floor (their bottoms follow floor lines)', 'Nothing floats or tilts'],
        example: 'A classroom or bedroom seen from the doorway: a back wall rectangle, floor boards running to the VP, a door on the side wall shrinking towards the back, a table as a box. The test: the table legs hit the floor where the floor lines say they should.',
        search: 'anime classroom one point perspective background',
      },
    },
  },
  's1-persp23': {
    method: [
      'Draw the horizon; place two vanishing points far apart (often off the canvas).',
      'Draw the nearest vertical edge of the box.',
      'Pull lines from its top and bottom to both vanishing points.',
      'Close the two side edges as verticals.',
      'Draw the back edges to the opposite vanishing points and draw through.',
      'For 3-point: verticals converge to a third point above or below.',
    ],
    more: [
      'Two-point perspective is the default for anything seen at a corner, which is most things. Vanishing points that are too close together are the most common mistake: boxes look stretched and sharp-cornered. Push them far apart, even off the canvas, and the box calms down.',
      'The box challenge is a classic for a reason: drawing many boxes from imagination, then checking each one by extending its lines, trains your perspective intuition faster than anything else. It’s repetitive by design, so spread it over many days.',
    ],
    ex: {
      'box-challenge': {
        sessions: 8,
        steps: ['Draw 10 boxes per session from imagination, each rotated differently.', 'Draw every box through: all 12 edges.', 'Extend each set of parallel edges in a different colour, beyond the box, to see if they converge.', 'Number your boxes; over the 8 sessions you’ll reach 80.', 'Each session, pick your worst box and draw a corrected version next to it.'],
        success: ['Extended lines of each set converge (not diverge)', 'No box looks stretched or warped', 'Later boxes converge better than early ones'],
        example: 'A page of 10 boxes with coloured lines shooting off each: red, blue and green sets. In early pages some sets spread apart toward the back (reverse perspective); by box 50 most sets narrow gently towards a far point. That trend is your progress.',
        search: 'drawabox 250 box challenge line extensions',
      },
      'box-memory': {
        sessions: 4,
        steps: ['No references or rulers. Imagine looking up at a tall box.', 'Draw it with three vanishing points: two on the horizon, one far above.', 'Draw it through and extend the lines to check.'],
        success: ['Verticals converge upwards', 'The box feels tall and seen from below'],
        example: 'A single tall box, like a skyscraper seen from the street: its verticals lean slightly towards each other at the top. If they stay parallel, you drew 2-point.',
        search: 'three point perspective box looking up',
      },
    },
  },
  's1-objects': {
    method: [
      'Look at the object and name its simple forms (box, cylinder, sphere, wedge).',
      'Draw the biggest form first, in perspective, drawn through.',
      'Attach the next forms, checking their alignment with the first.',
      'Cut and carve: chamfer edges, cut holes, round corners.',
      'Add details only at the end; then draw the clean lines on a new layer.',
    ],
    more: [
      'Constructing objects is where the forms and perspective of this stage pay off. Your characters will hold swords, phones, umbrellas and bags; these props need to sit in the same perspective as the hand that holds them.',
      'Every object has a “big form” that sets its proportions: the blade of a sword, the body of a phone, the main box of a bag. Get its length, width and angle right, and the details fall into place.',
    ],
    ex: {
      'object-study': {
        sessions: 4,
        steps: ['Choose an object in the reference: a weapon, a phone, a bag, a cup.', 'List its simple forms in one sentence (“a sword is a long thin box with a cylinder handle and a flat box guard”).', 'Construct it from those forms in the reference’s angle, drawn through.', 'Draw it again from a second angle you invent.', 'Clean lines on a layer above.'],
        success: ['The construction is visible and in perspective', 'Proportions match the reference (check with the overlay)', 'The invented angle still looks like the same object'],
        example: 'A katana from a character reference: a long, slightly curved thin box for the blade, a flat oval box for the guard, a cylinder wrapped with diamond contours for the handle. Second angle: the same katana pointing towards you, the blade foreshortened.',
        search: 'construction drawing objects simple forms',
      },
      'object-memory': {
        sessions: 3,
        steps: ['Without looking, draw the object you studied from a new angle.', 'Start from the same simple forms.', 'Afterwards, compare with the study and note one thing you forgot.'],
        success: ['It’s recognisably the same object', 'Forms are in consistent perspective'],
        example: 'The katana again, now held upright, seen slightly from below. Forgot the guard’s thickness? Note it, then add it in the next session.',
        search: 'drawing objects from imagination construction',
      },
    },
  },
  's1-observe': {
    method: [
      'Choose a unit (often the head) and measure the total size in units.',
      'Mark the top, bottom and big landmarks before drawing any outline.',
      'Check every main angle against a vertical or horizontal.',
      'Look for alignments: what sits directly above or beside what?',
      'Draw the negative shapes (the gaps) and compare them with the reference.',
      'Overlay at the end and note where you drifted.',
    ],
    more: [
      'Your brain stores simplified symbols for things: an eye is an almond, a hand is five sticks. When you draw while looking at a reference, those symbols sneak in and replace what you actually see. Measuring and comparing interrupts the symbols, so you draw the real shape.',
      'Negative space works because the gap between an arm and a body has no symbol in your head, so you see it as it is. Research on drawing errors finds that most of them come from attention and memory rather than from seeing wrong, which is why these deliberate checks work.',
    ],
    ex: {
      'measure-study': {
        sessions: 5,
        steps: ['Mark the top and bottom of the figure on your canvas.', 'Measure the head and count how many heads tall the figure is; mark each head length.', 'Place the key points: chin, shoulders, waist, crotch, knees, feet.', 'Check angles of the shoulders, hips and limbs against verticals.', 'Draw the outline using negative shapes between limbs and body.', 'Overlay the reference, note the biggest error in the upload title.'],
        success: ['Head count matches within half a head', 'The overlay shows no big drift in the main landmarks', 'Negative shapes match the reference'],
        example: 'A standing character, 7½ heads, with little tick marks at each head length on the side, light angle lines across the shoulders and hips, and the gap between the arm and the waist clearly drawn. Overlay: the legs came out slightly short, a typical first result.',
        search: 'sight size measuring drawing proportions head units',
      },
      'stage1-project': {
        sessions: 1,
        steps: ['Pick 3–5 objects from your room or references: a mug, books, a lamp, a phone.', 'Draw 3 small thumbnails of the arrangement and pick one.', 'Set up a 2-point perspective (perspective ruler for checking only).', 'Construct every object from simple forms on the table plane.', 'Clean lines with line weight: thicker outlines, thinner details.', 'Work across 2–3 focus blocks; upload the final and the construction layer.'],
        success: ['All objects share one perspective and sit on the table', 'Construction is visible on the lower layer', 'Clean lines with deliberate weight'],
        example: 'A desk still life: a stack of two books, a mug with a pencil in it, a phone lying at an angle, a small lamp. Every object sits on the same table surface; the stack of books shows both vanishing points clearly.',
        search: 'still life drawing perspective construction lines',
      },
    },
  },
};
