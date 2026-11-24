// Small teaching diagrams for exercise steps, drawn as clean SVG. Each step
// text is matched against RULES (first match wins); a step without a
// diagram gets a picture search for exactly that step instead.
//
// Colours: ink lines, accent (terracotta) for what the step is about,
// blue for construction/guide lines, sage for "good".

const INK = 'var(--ink)';
const GUIDE = 'var(--blue)';
const HOT = 'var(--accent)';
const OK = 'var(--sage)';
const FILL = 'var(--paper-2)';

const S = ({ children, label }) => (
  <svg viewBox="0 0 160 100" className="diagram" role="img" aria-label={label}>
    {children}
  </svg>
);
const L = (p) => <path fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p} />;
const G = (p) => <path fill="none" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" strokeLinecap="round" {...p} />;
const H = (p) => <path fill="none" stroke={HOT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p} />;
const T = ({ x, y, children, c = 'var(--muted)', a = 'middle' }) => (
  <text x={x} y={y} fontSize="7" fill={c} textAnchor={a} fontFamily="Nunito Sans, sans-serif">
    {children}
  </text>
);
const dot = (x, y, c = HOT) => <circle cx={x} cy={y} r="2.4" fill={c} />;

// A box in 2-point perspective (front corner at x, y).
const box2 = (x, y, s = 1) => {
  const p = (dx, dy) => `${x + dx * s} ${y + dy * s}`;
  return `M${p(0, 0)} L${p(-26, -8)} L${p(-26, -38)} L${p(0, -30)} Z M${p(0, 0)} L${p(30, -9)} L${p(30, -39)} L${p(0, -30)} M${p(-26, -38)} L${p(4, -48)} L${p(30, -39)}`;
};

export const DIAGRAMS = {
  ghosting: (
    <S label="Ghosting a line">
      {dot(20, 70)}
      {dot(140, 30)}
      <G d="M20 64 L140 24" />
      <G d="M20 58 L140 18" />
      <H d="M20 70 L140 30" />
      <T x={80} y={92}>dots → ghost the motion → one stroke</T>
    </S>
  ),
  superimposed: (
    <S label="Superimposed lines">
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M20 ${60 + i * 0.6} L140 ${30 + i * 1.4}`} stroke={i ? INK : HOT} strokeWidth="1.2" opacity={i ? 0.5 : 1} />
      ))}
      <T x={80} y={92}>many strokes on one path, ends together</T>
    </S>
  ),
  curves: (
    <S label="Curves through points">
      {dot(20, 70)}
      {dot(80, 25)}
      {dot(140, 65)}
      <H d="M20 70 Q 80 -20 140 65" />
      <L d="M20 40 C 50 10 70 80 100 50 S 140 30 145 40" opacity="0.5" />
      <T x={80} y={92}>C- and S-curves through the dots</T>
    </S>
  ),
  pressure: (
    <S label="Pressure ladder and tapered strokes">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M${20 + i * 20} 20 V50`} stroke={INK} strokeWidth={0.5 + i * 1.1} strokeLinecap="round" />
      ))}
      <path d="M20 72 Q 80 60 140 72 Q 80 66 20 72 Z" fill={HOT} />
      <T x={80} y={92}>thin → thick, and taper at both ends</T>
    </S>
  ),
  ellipse: (
    <S label="Ellipse with its minor axis">
      <ellipse cx="80" cy="48" rx="52" ry="20" fill="none" stroke={INK} strokeWidth="1.6" />
      <G d="M80 15 V82" />
      <G d="M20 48 H140" />
      <T x={86} y={20} c={GUIDE} a="start">minor axis</T>
      <T x={80} y={95}>round ends, no lemon points</T>
    </S>
  ),
  tables: (
    <S label="Ellipses in a table">
      <rect x="20" y="15" width="120" height="65" fill="none" stroke={INK} strokeWidth="1.4" />
      {[[48, 35, 24, 14], [100, 32, 34, 13], [44, 64, 20, 12], [92, 63, 30, 14], [128, 58, 10, 18]].map(([cx, cy, rx, ry], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={i === 1 ? HOT : INK} strokeWidth="1.3" />
      ))}
      <T x={80} y={94}>ellipses touching each other and the edges</T>
    </S>
  ),
  funnel: (
    <S label="Ellipse funnel">
      <G d="M30 80 Q 80 20 135 40" />
      {[[34, 76, 6], [52, 58, 10], [72, 44, 13], [95, 37, 11], [118, 37, 7]].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.42} transform={`rotate(${-50 + i * 18} ${x} ${y})`} fill="none" stroke={i === 2 ? HOT : INK} strokeWidth="1.3" />
      ))}
      <T x={80} y={94}>each ellipse centred on the curved axis</T>
    </S>
  ),
  contour: (
    <S label="Contour lines wrapping a form">
      <L d="M30 30 C 60 10 110 15 130 40 C 140 55 125 75 100 70 C 70 65 50 80 32 66 C 18 55 20 40 30 30 Z" />
      {[45, 65, 85, 105].map((x, i) => (
        <path key={x} d={`M${x} ${22 + i * 2} Q ${x + 8} ${48} ${x - 2} ${70 - i * 1}`} fill="none" stroke={HOT} strokeWidth="1.4" />
      ))}
      <T x={80} y={94}>contour lines curve around, never straight across</T>
    </S>
  ),
  through: (
    <S label="Drawing through a box">
      <L d={box2(80, 80, 1.2)} />
      <G d="M80 80 L 80 44 M80 44 L 48.8 34.4 M80 44 L 116 33.2" />
      <T x={80} y={95}>draw the hidden edges too</T>
    </S>
  ),
  persp1: (
    <S label="One-point perspective">
      <G d="M0 45 H160" />
      {dot(80, 45, GUIDE)}
      <rect x="20" y="58" width="28" height="20" fill="none" stroke={INK} strokeWidth="1.5" />
      <G d="M20 58 L80 45 M48 58 L80 45 M48 78 L80 45" />
      <L d="M20 58 L 34 55 L 58 55 L 48 58 M58 55 V 72 L48 78" />
      <rect x="110" y="15" width="26" height="18" fill="none" stroke={INK} strokeWidth="1.5" />
      <G d="M110 33 L80 45 M136 33 L80 45" />
      <T x={6} y={42} a="start" c={GUIDE}>horizon</T>
      <T x={80} y={95}>below: see the top · above: see the bottom</T>
    </S>
  ),
  persp2: (
    <S label="Two-point perspective">
      <G d="M0 30 H160" />
      {dot(4, 30, GUIDE)}
      {dot(156, 30, GUIDE)}
      <L d="M70 50 V82 M70 50 L 38 42 M70 50 L 112 40 M70 82 L 38 72 M70 82 L 112 70 M38 42 V72 M112 40 V70" />
      <G d="M38 42 L4 30 M38 72 L4 30 M112 40 L156 30 M112 70 L156 30" />
      <T x={80} y={95}>vanishing points far apart, often off the page</T>
    </S>
  ),
  persp3: (
    <S label="Three-point perspective, looking up">
      <G d="M0 88 H160" />
      {dot(80, 2, HOT)}
      <L d="M68 84 L 60 30 M68 84 L 40 78 M68 84 L 104 78 M40 78 L 46 34 M104 78 L 94 32 M60 30 L46 34 M60 30 L94 32" />
      <G d="M46 34 L80 2 M94 32 L80 2 M60 30 L80 2" />
      <T x={130} y={20}>3rd point above</T>
    </S>
  ),
  spacing: (
    <S label="Spacing in depth with the diagonal">
      <G d="M0 30 H160" />
      {[[20, 60], [52, 48], [74, 41], [89, 36], [99, 33]].map(([x, h], i) => (
        <path key={i} d={`M${x} ${30 + h * 0.75} V${30 - h * 0.25}`} stroke={INK} strokeWidth="2" />
      ))}
      <H d="M20 15 L 74 71" />
      <T x={80} y={94}>top of 1st → middle of 2nd → foot of 3rd</T>
    </S>
  ),
  measure: (
    <S label="Measuring in head lengths">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <g key={i}>
          <G d={`M50 ${8 + i * 10.5} H110`} />
          <T x={46} y={11 + i * 10.5} a="end">{i + 1}</T>
        </g>
      ))}
      <circle cx="80" cy="13" r="5" fill="none" stroke={INK} strokeWidth="1.5" />
      <L d="M80 18 V50 M70 24 H90 M80 50 L72 92 M80 50 L88 92 M70 24 L64 52 M90 24 L96 52" />
      <T x={130} y={50}>8 heads</T>
    </S>
  ),
  plumb: (
    <S label="Plumb line from the pit of the neck">
      <circle cx="78" cy="14" r="6" fill="none" stroke={INK} strokeWidth="1.5" />
      <L d="M78 20 Q 76 40 84 52 M66 26 L90 30 M72 50 L96 46 M84 52 L72 90 M90 50 L100 88" />
      <H d="M80 22 V92" />
      {dot(80, 22)}
      <T x={120} y={30}>shoulders tilt</T>
      <T x={122} y={52}>hips tilt the other way</T>
      <T x={80} y={99}>weight over the supporting foot</T>
    </S>
  ),
  negative: (
    <S label="Negative space">
      <L d="M60 10 Q 70 30 66 60 L 62 92 M90 10 Q 82 30 88 60 L 92 92 M66 30 Q 40 44 50 66" />
      <path d="M66 32 Q 46 44 52 62 Q 58 52 66 50 Z" fill={HOT} opacity="0.35" />
      <T x={110} y={50} a="start">the gap between arm and body</T>
    </S>
  ),
  gesture: (
    <S label="Line of action">
      <H d="M70 8 C 100 30 60 60 92 92" />
      <circle cx="72" cy="12" r="6" fill="none" stroke={INK} strokeWidth="1.4" />
      <L d="M74 22 L52 34 M78 26 L104 18 M86 70 L60 88" opacity="0.7" />
      <T x={128} y={50}>one curve first</T>
    </S>
  ),
  mannequin: (
    <S label="Mannequin: ribcage, pelvis and limbs">
      <ellipse cx="80" cy="30" rx="13" ry="16" transform="rotate(-12 80 30)" fill="none" stroke={INK} strokeWidth="1.5" />
      <path d="M68 52 Q 80 64 94 54 L 92 46 L 70 46 Z" fill="none" stroke={INK} strokeWidth="1.5" transform="rotate(8 80 50)" />
      <H d="M74 44 Q 82 32 80 16" />
      <ellipse cx="80" cy="30" rx="13" ry="4" transform="rotate(-12 80 30)" fill="none" stroke={GUIDE} strokeWidth="1" />
      <L d="M70 56 L64 76 L66 94 M90 56 L98 74 L96 94 M68 20 L56 36 L50 52 M92 18 L106 30 L114 44" />
      {[[64, 76], [98, 74], [56, 36], [106, 30]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill={FILL} stroke={INK} />
      ))}
      <T x={130} y={30}>egg ribcage</T>
      <T x={128} y={56}>bowl pelvis</T>
    </S>
  ),
  foreshortening: (
    <S label="Foreshortening with overlapping cylinders">
      <ellipse cx="44" cy="50" rx="9" ry="6" fill="none" stroke={INK} strokeWidth="1.4" />
      <path d="M44 44 L82 38 M44 56 L82 64" stroke={INK} strokeWidth="1.4" />
      <ellipse cx="82" cy="51" rx="14" ry="13" fill={FILL} stroke={INK} strokeWidth="1.4" />
      <path d="M82 38 L118 30 M82 64 L118 72" stroke={INK} strokeWidth="1.4" />
      <ellipse cx="120" cy="51" rx="21" ry="21" fill="var(--card)" stroke={HOT} strokeWidth="2" />
      <T x={80} y={95}>near = bigger and rounder, overlaps in front</T>
    </S>
  ),
  hand: (
    <S label="Hand: palm box, thumb wedge, finger segments">
      <path d="M50 50 L90 44 L94 80 L56 86 Z" fill="none" stroke={INK} strokeWidth="1.6" />
      <path d="M50 50 L36 62 L44 80 L56 86" fill="none" stroke={GUIDE} strokeWidth="1.3" />
      <H d="M52 47 Q 70 38 90 42" />
      {[[56, 46, 54, 22], [66, 43, 66, 14], [76, 42, 78, 18], [86, 43, 90, 26]].map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={INK} strokeWidth="4" strokeLinecap="round" opacity="0.25" />
          {[0.4, 0.7].map((k) => (
            <circle key={k} cx={x1 + (x2 - x1) * k} cy={y1 + (y2 - y1) * k} r="1.6" fill={INK} />
          ))}
        </g>
      ))}
      <T x={128} y={40}>knuckles on an arc</T>
      <T x={124} y={70}>palm box + thumb</T>
    </S>
  ),
  foot: (
    <S label="Foot as a wedge">
      <path d="M40 30 L60 30 L120 74 L40 74 Z" fill="none" stroke={INK} strokeWidth="1.6" />
      <H d="M60 74 Q 80 62 104 74" />
      <circle cx="54" cy="40" r="3" fill={GUIDE} />
      <T x={80} y={90}>high at the ankle, flat at the toes, arch lifts</T>
    </S>
  ),
  loomis: (
    <S label="Loomis head construction">
      <circle cx="74" cy="42" r="26" fill="none" stroke={INK} strokeWidth="1.6" />
      <ellipse cx="90" cy="42" rx="8" ry="20" fill="none" stroke={GUIDE} strokeWidth="1.2" />
      <H d="M60 18 Q 50 44 64 70" />
      <G d="M48 40 Q 70 46 98 40" />
      <L d="M64 66 L 70 88 L 84 92 L 98 62" />
      <T x={126} y={30}>side slice</T>
      <T x={126} y={46}>brow line</T>
      <T x={30} y={30}>centre</T>
      <T x={120} y={86}>jaw hangs from it</T>
    </S>
  ),
  eye: (
    <S label="Anime eye construction">
      <H d="M40 46 Q 80 20 122 40" />
      <L d="M52 64 Q 80 70 112 60" opacity="0.6" />
      <ellipse cx="82" cy="52" rx="15" ry="19" fill={FILL} stroke={INK} strokeWidth="1.4" />
      <path d="M67 44 Q 82 34 97 44" fill="none" stroke={INK} strokeWidth="5" opacity="0.25" />
      <circle cx="82" cy="55" r="6" fill={INK} />
      <circle cx="76" cy="46" r="3.5" fill="#fff" />
      <path d="M118 38 L128 30 M120 42 L132 38" stroke={INK} strokeWidth="1.4" />
      <T x={80} y={92}>strong upper lid, iris tucked under it</T>
    </S>
  ),
  features: (
    <S label="Feature placement in profile">
      <path d="M60 14 Q 92 10 98 36 L 104 50 L 98 52 L 100 60 Q 96 66 98 70 Q 90 84 74 86" fill="none" stroke={INK} strokeWidth="1.6" />
      <G d="M40 36 H120 M40 52 H120" />
      <ellipse cx="66" cy="45" rx="5" ry="9" fill="none" stroke={HOT} strokeWidth="1.6" />
      <T x={136} y={38}>brow</T>
      <T x={136} y={54}>nose</T>
      <T x={40} y={70}>ear between them</T>
    </S>
  ),
  expression: (
    <S label="Expressions: brows, lids and mouth together">
      {[
        [30, 'M18 34 L40 40', 'M20 62 Q30 56 40 62', 'angry'],
        [80, 'M68 38 L90 32', 'M70 60 Q80 66 90 60', 'happy'],
        [130, 'M118 36 Q130 28 142 36', 'M124 62 Q130 58 136 62', 'sad'],
      ].map(([x, brow, mouth, name]) => (
        <g key={name}>
          <circle cx={x} cy="48" r="22" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.4" />
          <H d={brow} />
          <circle cx={x - 7} cy="46" r="2" fill={INK} />
          <circle cx={x + 7} cy="46" r="2" fill={INK} />
          <L d={mouth} />
          <T x={x} y={84}>{name}</T>
        </g>
      ))}
    </S>
  ),
  hair: (
    <S label="Hair as big clumps">
      <circle cx="80" cy="50" r="26" fill="none" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      {[
        'M58 34 Q 50 60 54 84 Q 62 66 66 44',
        'M70 26 Q 66 52 72 76 Q 78 56 80 30',
        'M86 26 Q 96 52 92 78 Q 102 56 98 36',
        'M100 34 Q 112 58 108 84 Q 116 60 106 42',
      ].map((d, i) => (
        <path key={i} d={d} fill={i === 1 ? HOT : FILL} opacity={i === 1 ? 0.6 : 1} stroke={INK} strokeWidth="1.3" />
      ))}
      <path d="M56 36 Q 80 14 106 38" fill="none" stroke={INK} strokeWidth="1.6" />
      <T x={80} y={97}>5–8 clumps with volume above the skull</T>
    </S>
  ),
  folds: (
    <S label="Fold types">
      <L d="M14 12 V60 M22 12 Q 18 36 22 60 M30 12 V60" />
      <T x={22} y={74}>pipe</T>
      <L d="M52 12 L64 24 L52 36 L64 48 L52 60" />
      <T x={58} y={74}>zigzag</T>
      <L d="M86 14 Q 104 20 88 30 Q 104 38 88 46 Q 104 54 88 60" />
      <T x={96} y={74}>spiral</T>
      <L d="M120 14 Q 136 40 150 14 M124 22 Q 136 46 146 22" />
      <T x={136} y={74}>diaper</T>
      {dot(120, 14)}
      {dot(150, 14)}
      <T x={80} y={92}>folds radiate from tension points</T>
    </S>
  ),
  fabric: (
    <S label="Thin vs thick fabric">
      <L d="M20 20 Q 26 50 22 80 M30 20 Q 34 50 30 80 M40 20 Q 44 50 38 80 M50 20 Q 52 50 48 80" />
      <T x={36} y={92}>thin: many small folds</T>
      <path d="M100 20 Q 92 50 104 80 L 144 80 Q 154 50 140 20 Z" fill={FILL} stroke={INK} strokeWidth="2.4" />
      <path d="M118 30 Q 112 55 122 76" fill="none" stroke={INK} strokeWidth="1.6" />
      <T x={122} y={92}>thick: few, rounded</T>
    </S>
  ),
  values: (
    <S label="Value scale">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={14 + i * 27} y="20" width="26" height="30" fill={`hsl(30, 8%, ${96 - i * 22}%)`} stroke={INK} strokeWidth="0.6" />
      ))}
      <rect x="14" y="62" width="44" height="18" fill="hsl(30,8%,92%)" />
      <rect x="58" y="62" width="44" height="18" fill="hsl(30,8%,55%)" />
      <rect x="102" y="62" width="44" height="18" fill="hsl(30,8%,15%)" />
      <T x={80} y={94}>5 even steps · then group into 3</T>
    </S>
  ),
  light: (
    <S label="Light on a sphere">
      <defs>
        <radialGradient id="dg-sphere" cx="35%" cy="32%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#c9c2b6" />
          <stop offset="0.62" stopColor="#5a524a" />
          <stop offset="0.85" stopColor="#3a332c" />
          <stop offset="1" stopColor="#6a625a" />
        </radialGradient>
      </defs>
      <ellipse cx="98" cy="80" rx="40" ry="8" fill="#3a332c" opacity="0.35" />
      <circle cx="72" cy="48" r="30" fill="url(#dg-sphere)" />
      <path d="M20 10 L 40 24" stroke={HOT} strokeWidth="2" markerEnd="" />
      <T x={20} y={8} c={HOT}>light</T>
      <T x={140} y={34}>core shadow</T>
      <T x={140} y={70}>cast shadow</T>
    </S>
  ),
  cel: (
    <S label="Cel shadow shapes">
      <circle cx="58" cy="48" r="28" fill="#f3d3bd" stroke={INK} strokeWidth="1.4" />
      <path d="M58 20 Q 74 34 70 52 Q 66 68 58 76 A 28 28 0 0 0 58 20 Z" fill="#c9938a" />
      <path d="M36 30 L 44 40 L 50 30 L 58 42 L 64 30 L 72 40 L 80 32 Q 70 18 58 20 Q 44 20 36 30 Z" fill="#5a4a6a" />
      <path d="M44 40 L 50 46 L 58 42 L 64 48 L 72 40" fill="none" stroke="#a87a76" strokeWidth="3" />
      <T x={120} y={36}>hard-edged shapes</T>
      <T x={120} y={50}>shadow under the fringe</T>
      <T x={120} y={64}>away from the light</T>
    </S>
  ),
  edges: (
    <S label="Hard and soft edges">
      <defs>
        <linearGradient id="dg-soft" x1="0" x2="1">
          <stop offset="0" stopColor="#e9e2d6" />
          <stop offset="1" stopColor="#6a625a" />
        </linearGradient>
      </defs>
      <rect x="14" y="20" width="60" height="44" fill="#e9e2d6" />
      <rect x="44" y="20" width="30" height="44" fill="#6a625a" />
      <rect x="86" y="20" width="60" height="44" fill="url(#dg-soft)" />
      <T x={44} y={80}>hard: sharp turns</T>
      <T x={116} y={80}>soft: gentle curves</T>
    </S>
  ),
  hsv: (
    <S label="Hue, saturation, value">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={`s${i}`} x={14 + i * 27} y="12" width="25" height="18" fill={`hsl(12, ${15 + i * 20}%, 55%)`} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={`v${i}`} x={14 + i * 27} y="36" width="25" height="18" fill={`hsl(12, 60%, ${85 - i * 15}%)`} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={`h${i}`} x={14 + i * 27} y="60" width="25" height="18" fill={`hsl(${i * 70}, 50%, 55%)`} />
      ))}
      <T x={80} y={92}>saturation · value · hue (same value)</T>
    </S>
  ),
  temperature: (
    <S label="Warm light, cool shadow">
      <circle cx="60" cy="46" r="28" fill="#f6c89a" />
      <path d="M60 18 A 28 28 0 0 1 60 74 Q 74 46 60 18 Z" fill="#8a7aa8" />
      <circle cx="120" cy="46" r="20" fill="#9fb7d9" />
      <path d="M120 26 A 20 20 0 0 1 120 66 Q 130 46 120 26 Z" fill="#c98a6a" />
      <T x={60} y={90}>warm light → cool shadow</T>
      <T x={120} y={90}>cool light → warm shadow</T>
    </S>
  ),
  palette: (
    <S label="Colour harmonies">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <circle key={i} cx={54 + Math.cos(a) * 30} cy={48 + Math.sin(a) * 30} r="7" fill={`hsl(${i * 30}, 60%, 58%)`} />;
      })}
      <H d="M84 48 L 24 48" />
      <T x={130} y={30}>complementary:</T>
      <T x={130} y={40}>opposite hues</T>
      <T x={130} y={60}>analogous:</T>
      <T x={130} y={70}>neighbours</T>
    </S>
  ),
  layers: (
    <S label="Layer stack with clipping">
      {[
        ['Highlight · Add (Glow)', '#f6e7a8', true],
        ['Shadow · Multiply', '#b9a8d0', true],
        ['Skin flat', '#f3d3bd', false],
        ['Lines', '#ffffff', false],
        ['Sketch (blue, 30%)', '#cfe0f5', false],
      ].map(([name, c, clip], i) => (
        <g key={name}>
          <rect x={clip ? 44 : 30} y={8 + i * 17} width={clip ? 100 : 114} height="14" rx="3" fill={c} stroke={INK} strokeWidth="0.6" />
          {clip && <path d={`M36 ${15 + i * 17} h6`} stroke={HOT} strokeWidth="2" />}
          <T x={clip ? 50 : 36} y={18 + i * 17} c={INK} a="start">
            {name}
          </T>
        </g>
      ))}
    </S>
  ),
  lineweight: (
    <S label="Line weight">
      <path d="M30 80 Q 40 20 80 16 Q 120 20 130 80" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M60 50 Q 80 40 100 50" fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />
      <path d="M66 62 Q 80 70 94 62" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
      <T x={140} y={30} a="start">thick outside</T>
      <T x={80} y={92}>thin inside and in the light</T>
    </S>
  ),
  thumbnails: (
    <S label="Thumbnails in three values">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 10 + (i % 3) * 50;
        const y = 8 + Math.floor(i / 3) * 42;
        return (
          <g key={i}>
            <rect x={x} y={y} width="44" height="34" fill="#e9e2d6" stroke={i === 4 ? HOT : INK} strokeWidth={i === 4 ? 2 : 0.8} />
            <rect x={x} y={y + 20 - (i % 2) * 8} width="44" height={14 + (i % 2) * 8} fill="#a39a8e" />
            <ellipse cx={x + 12 + i * 4} cy={y + 18} rx="5" ry="10" fill="#3a332c" />
          </g>
        );
      })}
    </S>
  ),
  focal: (
    <S label="Focal point and eye flow">
      <rect x="10" y="8" width="140" height="80" fill="none" stroke={INK} strokeWidth="1" />
      <circle cx="104" cy="36" r="8" fill={HOT} />
      <H d="M24 76 Q 60 70 70 54 Q 80 40 96 38" />
      <G d="M10 34.7 H150 M10 61.3 H150 M56.7 8 V88 M103.3 8 V88" />
      <T x={80} y={97}>lead the eye to the point of highest contrast</T>
    </S>
  ),
  camera: (
    <S label="Camera angles">
      <L d="M30 80 L 36 30 L 42 80 M30 50 H42" />
      <circle cx="36" cy="24" r="5" fill="none" stroke={INK} strokeWidth="1.4" />
      <T x={36} y={94}>low: power</T>
      <L d="M80 70 L 82 40 L 84 70 M78 52 H86" />
      <circle cx="82" cy="36" r="5" fill="none" stroke={INK} strokeWidth="1.4" />
      <T x={82} y={94}>eye level</T>
      <g transform="rotate(14 130 55)">
        <L d="M126 76 L 130 46 L 134 76 M124 58 H136" />
        <circle cx="130" cy="41" r="5" fill="none" stroke={INK} strokeWidth="1.4" />
      </g>
      <T x={130} y={94}>Dutch: tension</T>
    </S>
  ),
  silhouette: (
    <S label="Silhouettes">
      <path d="M30 86 L32 50 Q 20 40 30 30 Q 40 10 50 30 Q 60 40 48 50 L52 86 Z" fill={INK} />
      <path d="M76 86 L74 46 L66 30 L82 34 L88 18 L94 34 L110 30 L102 46 L100 86 Z" fill={INK} />
      <path d="M130 86 Q 120 60 126 46 Q 120 30 136 26 Q 152 30 146 46 Q 152 60 142 86 Z" fill={INK} />
      <T x={80} y={97}>recognisable in pure black</T>
    </S>
  ),
  turnaround: (
    <S label="Turnaround on guide lines">
      {[12, 26, 46, 64, 88].map((y) => (
        <G key={y} d={`M8 ${y} H152`} />
      ))}
      {[34, 80, 126].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy="18" r="6" fill="none" stroke={INK} strokeWidth="1.4" />
          <L d={i === 1 ? `M${x} 24 V64 M${x} 64 L${x - 3} 88 M${x} 64 L${x + 4} 88 M${x - 2} 28 L${x + 6} 46` : `M${x} 24 V64 M${x - 10} 28 H${x + 10} M${x} 64 L${x - 6} 88 M${x} 64 L${x + 6} 88`} />
        </g>
      ))}
      <T x={34} y={98}>front</T>
      <T x={80} y={98}>side</T>
      <T x={126} y={98}>back</T>
    </S>
  ),
  panels: (
    <S label="Manga panels and reading order">
      <rect x="30" y="6" width="100" height="88" fill="none" stroke={INK} strokeWidth="1.4" />
      <path d="M30 34 H130 M80 6 V34 M30 64 H130 M70 64 V94" stroke={INK} strokeWidth="1.4" />
      {[[110, 22, '1'], [56, 22, '2'], [80, 50, '3'], [104, 80, '4'], [50, 80, '5']].map(([x, y, n]) => (
        <T key={n} x={x} y={y} c={HOT}>
          {n}
        </T>
      ))}
      <T x={150} y={50}>right → left</T>
    </S>
  ),
  bubble: (
    <S label="Speech bubbles in reading order">
      <ellipse cx="110" cy="26" rx="30" ry="14" fill="#fff" stroke={INK} strokeWidth="1.4" />
      <path d="M100 38 L94 52 L108 39" fill="#fff" stroke={INK} strokeWidth="1.4" />
      <ellipse cx="50" cy="56" rx="28" ry="13" fill="#fff" stroke={INK} strokeWidth="1.4" />
      <path d="M60 68 L66 82 L52 68" fill="#fff" stroke={INK} strokeWidth="1.4" />
      <T x={110} y={28}>1</T>
      <T x={50} y={58}>2</T>
      <T x={80} y={96}>tails point at the speaker’s mouth</T>
    </S>
  ),
  glow: (
    <S label="Glow: core, colour, soft halo">
      <rect x="10" y="8" width="140" height="80" fill="#1f2433" rx="6" />
      <circle cx="80" cy="48" r="34" fill="#5b8fe0" opacity="0.25" />
      <circle cx="80" cy="48" r="20" fill="#5b8fe0" opacity="0.6" />
      <circle cx="80" cy="48" r="9" fill="#ffffff" />
      <T x={80} y={84} c="#cfd8ee">white core · saturated colour · soft glow</T>
    </S>
  ),
  check: (
    <S label="Checking: flip, zoom out, overlay">
      <path d="M20 30 L40 20 L40 70 L20 60 Z M60 20 L80 30 L80 60 L60 70 Z" fill={FILL} stroke={INK} strokeWidth="1.2" />
      <path d="M44 45 H56" stroke={HOT} strokeWidth="2" markerEnd="" />
      <T x={50} y={84}>flip</T>
      <rect x="96" y="22" width="44" height="40" fill="none" stroke={INK} strokeWidth="1.2" />
      <rect x="108" y="32" width="20" height="18" fill={FILL} stroke={HOT} strokeWidth="1.4" />
      <T x={118} y={84}>zoom out</T>
    </S>
  ),
  room: (
    <S label="A room in perspective">
      <G d="M0 44 H160" />
      {dot(80, 44, GUIDE)}
      <rect x="50" y="24" width="60" height="40" fill="none" stroke={INK} strokeWidth="1.5" />
      <L d="M50 24 L10 4 M110 24 L150 4 M50 64 L10 96 M110 64 L150 96" />
      <path d="M60 64 L 56 70 L 84 70 L 86 64" fill="none" stroke={HOT} strokeWidth="1.6" />
      <L d="M118 30 L 140 18 L 140 70 L 118 60 Z" opacity="0.7" />
      <T x={80} y={84}>room box, then furniture footprints</T>
    </S>
  ),
};

// Step text → diagram. Most specific first.
const RULES = [
  [/superimpos|on top of it|exactly on top/i, 'superimposed'],
  [/ghost/i, 'ghosting'],
  [/funnel/i, 'funnel'],
  [/table/i, 'tables'],
  [/three dots|curve through|c-curves|s-curves|smooth curve/i, 'curves'],
  [/pressure|thinnest|taper|thick(er)? |swell/i, 'pressure'],
  [/spacing|diagonal|lamp post|posts/i, 'spacing'],
  [/3-point|three vanishing|third vanishing|looking up at|verticals converge/i, 'persp3'],
  [/2-point|two vanishing|vanishing points|converge|corner/i, 'persp2'],
  [/room|wall|floor|furniture|interior/i, 'room'],
  [/1-point|one vanishing|vanishing point|horizon|eye level|front rectangle/i, 'persp1'],
  [/draw(n)? through|hidden edge|all 12 edges/i, 'through'],
  [/contour|wrap/i, 'contour'],
  [/ellipse|minor axis/i, 'ellipse'],
  [/plumb|pit of the neck|supporting foot|contrapposto|hip line|shoulder line/i, 'plumb'],
  [/negative|gap between/i, 'negative'],
  [/head count|heads tall|head length|head marks|landmark|measure/i, 'measure'],
  [/line of action|gesture/i, 'gesture'],
  [/foreshorten|towards you|towards the viewer|biggest shape|cylinders? with visible ellipses/i, 'foreshortening'],
  [/mannequin|ribcage|pelvis|egg|bowl|cylinders? and joint/i, 'mannequin'],
  [/palm|knuckle|finger|thumb/i, 'hand'],
  [/wedge|arch|ankle|feet|foot/i, 'foot'],
  [/sphere|slice|loomis|brow line|centre line|jaw|construction heads?/i, 'loomis'],
  [/lid|iris|eyelash|pupil|eye/i, 'eye'],
  [/nose|mouth|ear\b|profile/i, 'features'],
  [/brows?|expression|emotion/i, 'expression'],
  [/clump|hair|parting|strand/i, 'hair'],
  [/silk|denim|coat|material|weight|thick fabric|thin fabric/i, 'fabric'],
  [/fold|tension point|hem|sleeve/i, 'folds'],
  [/silhouette/i, 'silhouette'],
  [/turnaround|front, side|side and back|guide lines/i, 'turnaround'],
  [/panel|frame|page layout|reading order/i, 'panels'],
  [/bubble|letter|text/i, 'bubble'],
  [/glow|core|effect|magic|lightning|fire/i, 'glow'],
  [/thumbnail/i, 'thumbnails'],
  [/focal|eye (moves|path|flow)|arrows/i, 'focal'],
  [/low|high|camera|dutch|angle/i, 'camera'],
  [/cel|lasso|shadow shape|hard brush/i, 'cel'],
  [/hard edge|soft edge|edges|blend/i, 'edges'],
  [/core shadow|cast shadow|terminator|light from|lit|light direction|shade a sphere|highlight/i, 'light'],
  [/warm|cool|temperature|moonlight|sunlight/i, 'temperature'],
  [/analogous|complementary|limited|harmony|palette/i, 'palette'],
  [/saturation|hue|hsv|swatch/i, 'hsv'],
  [/values?\b|grey|greyscale|value scale/i, 'values'],
  [/clip|multiply|flat|layer/i, 'layers'],
  [/line weight|varied weight|uniform weight|ink|line art/i, 'lineweight'],
  [/flip|zoom out|overlay|compare/i, 'check'],
];

export function diagramFor(step) {
  for (const [re, id] of RULES) if (re.test(step)) return id;
  return null;
}

// A picture search for one step of an exercise.
export function stepSearch(step, exercise) {
  const words = String(step)
    .replace(/\([^)]*\)/g, '')
    .replace(/[“”"’']/g, '')
    .split(/[:.;,]/)[0]
    .split(/\s+/)
    .slice(0, 8)
    .join(' ');
  const topic = exercise.search ?? exercise.title;
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${topic} ${words} drawing`)}`;
}
