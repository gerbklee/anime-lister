// The Clip Studio Paint handbook: short, practical guides for drawing anime in
// CSP (written for Ver. 5.0; older versions noted). Lessons link the guides
// they need (LESSON_GUIDES in index.js), and Atelier shows them all on one
// page. Each guide: what it's for, the steps, and the traps.

const tips = (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:tips.clip-studio.com ${q}`)}`;
const help = (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:help.clip-studio.com ${q}`)}`;

const G = (id, group, title, why, steps, traps, links, since) => ({ id, group, title, why, steps, traps, links, since: since ?? null });

const GUIDES = [
  // ---- Set up ---------------------------------------------------------------------------------
  G(
    'setup-canvas',
    'Set up',
    'Canvas for anime illustration',
    'The right canvas size keeps lines crisp without slowing the app down.',
    [
      'File → New → Illustration. Portrait pieces: 2480 × 3508 px (A4 at 300 dpi); landscape: 3508 × 2480; practice pages: 3000 × 2000.',
      'Leave “Paper colour” on (white). Keep the default 300 dpi: the pixel count is what matters for screens.',
      'Turn on the Timelapse checkbox in the New dialog for pieces you want to look back on.',
      'Save as .clip (keeps layers). Export copies for Atelier with File → Export (single layer) → .png or .jpg.',
    ],
    ['Tiny canvases (1000 px): lines go blurry when you zoom.', 'Huge canvases (8000 px+) for practice: brushes lag and you start detailing too early.'],
    [{ title: 'Canvas setup tutorials', url: tips('canvas size illustration settings') }],
  ),
  G(
    'pressure',
    'Set up',
    'Pen pressure and stabilization',
    'Your lines can only be as controlled as your pressure curve allows.',
    [
      'File → Adjust pen pressure settings (on macOS: Clip Studio Paint menu). Draw strokes from very light to firm; CSP fits the curve to your hand.',
      'Per brush: the Tool property palette → “Stabilization”. For learning line control, keep it low (0–6) so your hand does the work; for final line art, 8–15 is fine.',
      'Tool property → the wrench icon opens the full Sub tool detail (pressure for size, opacity, taper “Starting and ending”).',
      'If strokes are jittery only at the start, raise “Starting and ending” fade-in slightly instead of stabilization.',
    ],
    ['Cranking stabilization to 30+ while learning: lines look smooth but your hand never learns.', 'Pressing hard all the time: you lose line weight and tire your hand.'],
    [{ title: 'Pen pressure guides', url: tips('adjust pen pressure settings') }],
  ),
  G(
    'smart-shape',
    'Set up',
    'Smart Shape: clean lines and shapes',
    'Hold at the end of a stroke and CSP turns it into a clean line, curve or shape: great for boxes, panels and ellipses in later work.',
    [
      'Draw a line, ellipse or rectangle and keep the pen down at the end: it snaps to a clean shape you can still adjust.',
      'Preferences → Tools → Smart Shape: choose which shapes are recognised and how long you hold.',
      'Use it for construction (boxes, cylinders, ellipses) and backgrounds once you can already draw them freehand.',
    ],
    ['Using it during line-control drills: those drills train your hand, so turn it off there.'],
    [{ title: 'Ver. 5.0 updates', url: 'https://help.clip-studio.com/en-us/manual_en/030_new/030_new.htm' }],
    '5.0',
  ),
  G(
    'shortcuts',
    'Set up',
    'Shortcuts and a calm workspace',
    'Fewer clicks means more attention on the drawing.',
    [
      'File → Shortcut settings (Ctrl+Shift+Alt+K). Give these keys: Flip horizontally (H), Rotate left/right (- and =), Reset rotation, Brush size up/down ([ and ]).',
      'Built-in keys worth learning: B brush, E eraser, P pen, G fill, M selection, Ctrl+T transform, Space to pan, Ctrl+Space zoom, Shift+Space rotate, Ctrl+Z undo.',
      'Window → Quick Access: drag your sketch brush, ink brush, eraser and colours there.',
      'Window → Workspace → Register workspace to save the layout; hide palettes you don’t use yet.',
      'Tablet buttons: set one to undo and one to the eyedropper (Alt) or eraser.',
    ],
    ['Hunting through menus mid-stroke.', 'Working with the canvas rotated and forgetting to reset before judging proportions.'],
    [{ title: 'Shortcut customisation', url: tips('shortcut settings customize') }],
  ),
  G(
    'brushes',
    'Set up',
    'Few brushes, chosen well',
    'Anime work needs maybe five brushes; more is a distraction while learning.',
    [
      'Sketch: Pencil → Real pencil (or Darker pencil).',
      'Line art: Pen → G-pen (bold, pressure taper) or Mapping pen (thin details, eyelashes).',
      'Flats: Fill → Refer other layers, and Pen → Marker for edges.',
      'Shading: Pen → G-pen or Brush → Watercolor → Opaque watercolor for hard cel edges; Airbrush → Soft for gentle gradients.',
      'Blending: Blend → Blur or Color mixing. New brushes: Clip Studio Assets (search “anime brush”), downloaded into the Material palette and dragged into a tool group.',
    ],
    ['Downloading 50 brush packs before you can draw a box.', 'Using a textured brush for line art (lines look fuzzy at small sizes).'],
    [{ title: 'Brush basics', url: tips('beginner brushes which pen to use') }, { title: 'Clip Studio Assets', url: 'https://assets.clip-studio.com/en-us/' }],
  ),
  G(
    'layers',
    'Set up',
    'Layers: sketch, lines, colour',
    'Separating steps lets you fix one thing without breaking another.',
    [
      'Layer palette → new raster layer per step: Rough, Sketch, Lines, Colour folders.',
      'Sketch layer: lower opacity to 20–30% and set Layer colour (the button in Layer property) to blue, so your lines above stay readable.',
      'Layer → Layer settings → Set as draft layer: draft layers are ignored by fills and exports.',
      'Lock transparent pixels (the lock icon in the Layer palette) to recolour lines or shapes without going outside them.',
      'Name layers and use folders; Ctrl+click a layer thumbnail to select its contents.',
    ],
    ['Inking on the sketch layer.', 'Dozens of unnamed layers: you won’t find the hair shadow later.'],
    [{ title: 'Layer basics', url: tips('layers basics raster vector folder') }],
  ),
  G(
    'timelapse',
    'Set up',
    'Timelapse and exporting your work',
    'A timelapse shows your process back to you: where you hesitated, where you redrew. It’s also your best progress record.',
    [
      'File → New → tick “Timelapse” (or File → Timelapse → Record timelapse on an open canvas).',
      'File → Timelapse → Export timelapse: pick a length (30 s is plenty) and size.',
      'For Atelier: File → Export (single layer) → .jpg, longest side about 2000–2500 px. Upload it to the exercise.',
      'File → Export → .psd keeps layers for other apps; .clip is best for CSP.',
    ],
    ['Forgetting to start recording before you draw (it can’t be added afterwards).'],
    [{ title: 'Timelapse guides', url: tips('timelapse record export') }],
  ),

  // ---- Lines ----------------------------------------------------------------------------------
  G(
    'vector-lines',
    'Lines',
    'Vector layers for clean line art',
    'Vector lines can be thickened, thinned and trimmed after drawing, the standard way to ink anime line art in CSP.',
    [
      'Layer → New layer → Vector layer. Draw with G-pen or Mapping pen as usual.',
      'Eraser → Vector: in Tool property choose “Erase up to intersection” to delete overshoots at crossings in one tap.',
      'Correct line → Correct line width: thicken outer contours and overlaps, thin out lines in light.',
      'Correct line → Simplify vector line removes wobbles from long strokes; the Object tool moves and reshapes a whole stroke.',
      'Draw hair in long confident strokes on a vector layer, then trim the crossings.',
    ],
    ['Filling straight on a vector layer (fills need a raster layer).', 'Patching lines with dozens of tiny strokes instead of redrawing one.'],
    [{ title: 'Vector line art', url: tips('vector layer line art erase up to intersection') }],
  ),
  G(
    'line-extraction',
    'Lines',
    'From paper: scan and extract lines',
    'If you sketch on paper, CSP can turn a photo of it into clean lines on a transparent layer.',
    [
      'Photograph or scan the page in good light; File → Import → Image.',
      'Filter → Line extraction (Ver. 4.0+): adjust the threshold until only your lines remain.',
      'Older versions: Edit → Convert brightness to opacity.',
      'Lower the result’s opacity and ink on a new layer above.',
    ],
    ['Photos in dim light: shadows become lines.'],
    [{ title: 'Line extraction', url: tips('line extraction filter') }],
    '4.0',
  ),

  // ---- Structure & reference ---------------------------------------------------------------------
  G(
    'rulers',
    'Structure & reference',
    'Perspective ruler and figure rulers',
    'Rulers check your perspective; they don’t replace understanding it.',
    [
      'Layer → Ruler/Frame → Perspective ruler: choose 1, 2 or 3 points. Drag the guide lines onto edges in your sketch to fit it.',
      'The ruler snaps strokes when “Snap to special ruler” is on (the magnet in the command bar); toggle it off to sketch freely.',
      'Figure → Direct draw → Ellipse for perfect ellipses to compare with your freehand ones.',
      'Ruler → Concentric circle ruler: ellipses that follow the same axis, for wheels and cylinders.',
      'Show the ruler on all layers: Layer property → the ruler icon “Show in all layers”.',
    ],
    ['Snapping every line from day one: your freehand perspective never develops.', 'A horizon off the canvas you forget about.'],
    [{ title: 'Perspective ruler', url: tips('perspective ruler 2 point 3 point') }],
  ),
  G(
    'symmetry',
    'Structure & reference',
    'Symmetrical ruler for faces and designs',
    'Front views of faces, accessories and costume designs need symmetry, and the ruler mirrors your strokes live.',
    [
      'Ruler tool → Symmetrical ruler: drag a vertical line down the face centre.',
      'Draw one side; the other appears mirrored. Set “Number of lines” to 2.',
      'Turn it off for the final pass: perfect symmetry looks stiff; break it slightly (hair, expression).',
    ],
    ['Using it for three-quarter views (they aren’t symmetrical on the page).'],
    [{ title: 'Symmetrical ruler', url: tips('symmetrical ruler face') }],
  ),
  G(
    '3d-figure',
    'Structure & reference',
    '3D drawing figures and poses',
    'A posable 3D figure gives you any angle and lighting, the best way to check foreshortening and camera angles.',
    [
      'Material palette → 3D → Body type: drag a figure onto the canvas (it gets its own 3D layer).',
      'Pose by dragging joints, or Material → Pose: apply a pose and adjust. Pose scanner (Tool property) can read a pose from a photo.',
      'Object launcher → Body shape: set height and head-to-body ratio. Anime adults are often 7–8 heads tall.',
      'Camera: rotate and change the perspective (lens) in Tool property, matching your scene.',
      'Lower the 3D layer’s opacity and draw on a layer above, constructing over it: boxes, cylinders, then anatomy.',
    ],
    ['Tracing the figure outline: you copy the 3D model’s stiffness. Construct over it instead.', 'Default proportions for every character.'],
    [{ title: '3D drawing figure basics', url: tips('3d drawing figure pose beginner') }, { title: 'Pose scanner', url: tips('pose scanner') }],
  ),
  G(
    '3d-hand',
    'Structure & reference',
    '3D hand model',
    'Hands are the hardest part for most beginners; the 3D hand gives you any gesture from any angle.',
    [
      'Material palette → 3D: search for the hand model (Ver. 5.0), or use the hands of a 3D drawing figure.',
      'Pose with the hand sliders or apply a hand pose material; the Hand scanner can read a pose from a photo of your own hand.',
      'Adjust finger length and hand size to match your character (slimmer for delicate hands, broader for strong ones).',
      'Study it: draw the palm as a box, fingers as cylinders, then the real shape. Then hide the model and draw the same hand from memory.',
    ],
    ['Copying the outline without understanding the palm box.'],
    [{ title: '3D hand model (Ver. 5.0)', url: 'https://tips.clip-studio.com/en-us/articles/11932' }],
    '5.0',
  ),
  G(
    'reference',
    'Structure & reference',
    'Working with references',
    'Seeing the reference next to your canvas, at the same size, makes measuring possible.',
    [
      'Window → Sub View: import references there; click in Sub View to pick colours with the eyedropper.',
      'Or use Atelier’s .psd study file: the reference is already a locked layer next to (or hidden under) your canvas.',
      'Measure: compare angles and lengths with the pen held up to the screen, or draw quick guide lines on a separate layer.',
      'Copy freehand, then check: show the hidden reference layer (in the underlay study file) or use Atelier’s overlay to see where you drifted.',
    ],
    ['Tracing the reference: you train your hand to follow, not your eye to see.', 'A reference much smaller than your drawing.'],
    [{ title: 'Sub View palette', url: tips('sub view palette reference') }],
  ),
  G(
    'checking',
    'Structure & reference',
    'Your checking routine: flip, zoom out, grey',
    'Your eyes get used to your own drawing within minutes. These checks reset them, and they find most mistakes.',
    [
      'Flip: View → Rotate/Invert → Flip horizontally (give it the H key). Do it every few minutes.',
      'Zoom out: Window → Navigator shows the whole picture small, as your viewers will first see it.',
      'Grey: Layer → New correction layer → Hue/Saturation/Luminosity, Saturation −100, on top. Values right? Then colours will work.',
      'Step away for a minute, then look again before uploading.',
    ],
    ['Checking only at the end, when fixing means redrawing everything.'],
    [{ title: 'Flip canvas and checks', url: tips('flip canvas horizontally check mistakes') }],
  ),
  G(
    'transform',
    'Structure & reference',
    'Transform, liquify and puppet warp',
    'Fix proportions without redrawing: move the head, lengthen a leg, rotate an eye.',
    [
      'Select with the lasso (M) → Ctrl+T: scale, rotate, skew. Hold Shift to keep proportions.',
      'Edit → Transform → Mesh transformation: bend a whole area gently.',
      'Edit → Transform → Puppet warp (Ver. 4.0+): place pins on joints and drag to repose a sketch; pin what shouldn’t move.',
      'Blend tool → Liquify: push small areas like a cheek or a hair strand.',
      'Fix in the sketch stage; transforming finished line art softens it.',
    ],
    ['Transforming the same raster lines many times (each pass blurs them).'],
    [{ title: 'Puppet warp', url: 'https://tips.clip-studio.com/en-us/articles/10496' }, { title: 'Liquify and puppet warp', url: 'https://tips.clip-studio.com/en-us/articles/16348' }],
  ),

  // ---- Colour & light ---------------------------------------------------------------------------
  G(
    'flats',
    'Colour & light',
    'Flat colours, fast and clean',
    'Clean flats (one base colour per part) make every later step easy: shading, recolouring, effects.',
    [
      'Set the line art layer as Reference layer (the lighthouse icon in the Layer palette).',
      'Fill tool → Refer other layers. In Tool property: “Close gap” for small gaps, “Area scaling” about 1–2 px so colour slips under the lines.',
      'One layer per part (skin, hair, eyes, top, skirt), in a Colour folder under the line art.',
      'Clean up: View the layer alone, fill missed specks with the pen, or Auto select a region and Edit → Fill.',
    ],
    ['Gaps (white pixels) along lines; zoom in once before shading.', 'All flats on one layer: you can’t shade them separately.'],
    [{ title: 'Base colours', url: 'https://tips.clip-studio.com/en-us/articles/662' }, { title: 'Fill tool settings', url: tips('fill refer other layers close gap') }],
  ),
  G(
    'clipping',
    'Colour & light',
    'Cel shading with clipping layers',
    'The core anime colouring technique: a shadow layer clipped to the flat, painted with hard edges.',
    [
      'New layer above a flat → “Clip to layer below” (the icon at the top of the Layer palette). It can only paint where the flat is.',
      'Set the shadow layer’s blending mode to Multiply. Pick a light, slightly bluish or purplish grey and paint shadows with a hard brush or the lasso + fill.',
      'Decide the light direction first; shadows go under the hair, chin, folds and the side away from the light.',
      'Second shadow layer for the darkest occlusion (where things touch), also Multiply.',
      'Highlights: a new clipped layer in Normal or Add (Glow) mode for shiny spots (eyes, hair band, lips).',
    ],
    ['Grey or black shadows: they make colours muddy; use a tinted colour.', 'Shadows that follow the outline instead of the form.'],
    [{ title: 'Simple anime-style colouring', url: 'https://www.clipstudio.net/how-to-draw/archives/162911' }, { title: 'Light and shadow', url: 'https://tips.clip-studio.com/en-us/articles/941' }],
  ),
  G(
    'blending',
    'Colour & light',
    'Blending modes for light',
    'The anime glow (rim light, sunlight, bloom) is mostly a few layers in the right blending mode.',
    [
      'Multiply: shadows and colour tints. Screen: soft light and haze. Add (Glow): bright light, sparkles, rim light.',
      'Overlay: shift colours warmer in light areas or cooler in shadow; keep the opacity low.',
      'Glow: duplicate the finished picture, Filter → Blur → Gaussian blur, set to Screen or Add (Glow) at 20–40%.',
      'Rim light: a clipped layer in Add (Glow), paint a thin lit edge on the side of the backlight.',
    ],
    ['Using Add (Glow) everywhere: the picture looks washed out.'],
    [{ title: 'Blending modes explained', url: tips('blending modes multiply screen add glow') }],
  ),
  G(
    'colour',
    'Colour & light',
    'Picking and keeping colours',
    'A character needs the same colours in every picture; a colour set does that for you.',
    [
      'Color wheel palette for picking; Color slider → HSV to change only brightness or saturation.',
      'Color set palette → new set per character: skin, skin shadow, hair, hair shadow, eyes, outfit.',
      'Eyedropper with Alt while painting; Color history for recent colours.',
      'Intermediate color palette: get the in-between hue for transitions.',
    ],
    ['Picking every colour fresh each time: characters drift.'],
    [{ title: 'Colour sets', url: tips('color set palette character') }],
  ),
  G(
    'correction',
    'Colour & light',
    'Correction layers and gradient maps',
    'Adjust the whole picture without touching your painting, and undo it any time.',
    [
      'Layer → New correction layer → Tone curve (contrast), Color balance (mood), Hue/Saturation/Luminosity.',
      'Gradient map: Layer → New correction layer → Gradient map. Paint in greyscale first, then map greys to colours (dark → shadow hue, light → highlight hue).',
      'Clip a correction layer to a folder or layer to affect only that part.',
      'Put correction layers at the top; keep their opacity low and check with them hidden and shown.',
    ],
    ['Applying corrections destructively (Edit → Tonal correction) on your only copy.'],
    [{ title: 'Correction layers', url: tips('correction layer gradient map tone curve') }],
  ),
];

const GUIDE = new Map(GUIDES.map((g) => [g.id, g]));
const GROUPS = ['Set up', 'Lines', 'Structure & reference', 'Colour & light'];

module.exports = { GUIDES, GUIDE, GROUPS, help };
