// Trees of the valley, one kind per stage of the path, in a clean anime look:
// flat cel shading (a lit shape over a shadow shape with a hard edge), small
// highlight dabs, no outlines. Light comes from the upper left. Drawn with
// the base at (0, 0), about 100 units tall.

// [light, shadow, highlight]
export const TREE_INFO = {
  sapling: { name: 'Sapling', leaves: ['#9fd77a', '#6fae5a', '#d4f2a8'], trunk: ['#8a6444', '#634631'] },
  birch: { name: 'Birch', leaves: ['#c6e07a', '#94b856', '#eef8b8'], trunk: ['#f2ece0', '#c9bfae'] },
  pine: { name: 'Pine', leaves: ['#5aa57a', '#367a5c', '#8fd0a4'], trunk: ['#6a4a34', '#4a3324'] },
  oak: { name: 'Oak', leaves: ['#7cbf5c', '#4f9148', '#b6e48a'], trunk: ['#6e5038', '#4d3726'] },
  maple: { name: 'Maple', leaves: ['#f07e4a', '#c8503a', '#ffc08e'], trunk: ['#6e5038', '#4d3726'] },
  willow: { name: 'Willow', leaves: ['#b4d978', '#86b05a', '#e2f5b0'], trunk: ['#7a5c40', '#58412d'] },
  ginkgo: { name: 'Ginkgo', leaves: ['#f7d455', '#d9a832', '#fff0a0'], trunk: ['#7a5c40', '#58412d'] },
  cypress: { name: 'Cypress', leaves: ['#4f9a6c', '#2f6c4e', '#84c69a'], trunk: ['#6a4a34', '#4a3324'] },
  plane: { name: 'Plane tree', leaves: ['#94c46a', '#68984e', '#c8e89a'], trunk: ['#b3a184', '#8a7a60'] },
  magnolia: { name: 'Magnolia', leaves: ['#fbe0e8', '#e7a9bf', '#ffffff'], trunk: ['#7a5c40', '#58412d'] },
  sakura: { name: 'Sakura', leaves: ['#ffc8d8', '#f093b2', '#fff0f5'], trunk: ['#6e5038', '#4d3726'] },
  withered: { name: 'Withered tree', leaves: ['#a8998a', '#857565', '#c9bcae'], trunk: ['#9a8a78', '#7a6a5a'] },
};

// Crown silhouettes as primitives: c = circle [x, y, r], e = ellipse [x, y, rx, ry], p = path d.
const CROWNS = {
  sapling: [['p', 'M0 -24 C -15 -28 -17 -42 -4 -45 C 0 -36 0 -30 0 -24 Z'], ['p', 'M0 -28 C 15 -32 17 -48 4 -51 C 0 -42 0 -35 0 -28 Z']],
  birch: [['e', 0, -64, 17, 31]],
  pine: [['p', 'M0 -100 L 15 -68 L -15 -68 Z'], ['p', 'M0 -84 L 21 -45 L -21 -45 Z'], ['p', 'M0 -66 L 26 -18 L -26 -18 Z']],
  cypress: [['p', 'M0 -102 C 13 -82 14 -40 9 -16 L -9 -16 C -14 -40 -13 -82 0 -102 Z']],
  oak: [['c', -15, -55, 18], ['c', 15, -57, 18], ['c', 0, -74, 22], ['c', 0, -50, 16]],
  maple: [['c', -15, -55, 17], ['c', 15, -57, 17], ['c', 0, -75, 21], ['c', -2, -50, 15]],
  plane: [['c', -19, -57, 20], ['c', 19, -59, 21], ['c', 0, -79, 24], ['c', 0, -52, 18]],
  willow: [['e', 0, -66, 29, 21]],
  ginkgo: [['p', 'M0 -48 C -32 -50 -32 -94 0 -100 C 32 -94 32 -50 0 -48 Z']],
  sakura: [['c', -17, -56, 14], ['c', 15, -58, 14], ['c', 0, -73, 17], ['c', -23, -70, 11], ['c', 23, -72, 11], ['c', 0, -52, 13]],
  magnolia: [['c', -15, -56, 14], ['c', 15, -58, 14], ['c', 0, -73, 17], ['c', 0, -52, 13]],
};

function Shapes({ list, fill, transform }) {
  return (
    <g transform={transform} fill={fill}>
      {list.map((s, i) =>
        s[0] === 'c' ? <circle key={i} cx={s[1]} cy={s[2]} r={s[3]} /> : s[0] === 'e' ? <ellipse key={i} cx={s[1]} cy={s[2]} rx={s[3]} ry={s[4]} /> : <path key={i} d={s[1]} />,
      )}
    </g>
  );
}

// Vertical centre of each crown (the lit shape shrinks around it).
const CENTER = { sapling: -38, pine: -58, cypress: -58, birch: -64, ginkgo: -74, willow: -66 };

// Highlight dabs: small lit spots towards the upper left of the crown.
const DABS = {
  default: [[-12, -76, 5], [-20, -62, 3.5], [-4, -86, 3]],
  pine: [[-5, -88, 2.5], [-8, -60, 3], [-12, -36, 3]],
  cypress: [[-4, -84, 2.5], [-5, -58, 3]],
  birch: [[-7, -78, 4], [-9, -64, 3]],
  sapling: [[-7, -38, 2.5]],
  willow: [[-12, -74, 4.5], [-2, -80, 3]],
  ginkgo: [[-12, -82, 4.5], [-18, -68, 3]],
};

export function Tree({ type = 'sapling', x = 0, y = 0, scale = 1, opacity = 1, onPointerEnter, onPointerLeave, title }) {
  const info = TREE_INFO[type] ?? TREE_INFO.sapling;
  const [light, shadow, hi] = info.leaves;
  const [tl, ts] = info.trunk;
  const small = type === 'sapling';
  const trunkH = small ? 30 : type === 'cypress' ? 20 : 46;
  const w = small ? 1.6 : 3.2;
  const crown = CROWNS[type];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      {title && <title>{title}</title>}
      {/* Cast shadow on the grass (to the lower right) */}
      <ellipse cx={small ? 4 : 10} cy="1.5" rx={small ? 9 : 24} ry="4.5" fill="#1d2a3a" opacity="0.16" />
      {/* Trunk: lit left half, shadowed right half */}
      <path d={`M${-w} 0 L${-w * 0.6} ${-trunkH} L0 ${-trunkH} L0 0 Z`} fill={tl} />
      <path d={`M0 0 L0 ${-trunkH} L${w * 0.6} ${-trunkH} L${w} 0 Z`} fill={ts} />
      {type === 'birch' && <path d="M-2.6 -12 h3 M-1.6 -24 h3 M-2.4 -34 h2.4" stroke="#3b3128" strokeWidth="1.3" />}
      {type === 'withered' ? (
        <g stroke={light} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M0 -40 L -12 -58 M -6 -49 L -15 -51 M0 -44 L 10 -62 M 6 -54 L 16 -56 M 0 -46 L 1 -70" />
          <path d="M 10 -62 L 13 -68 M -12 -58 L -14 -64" stroke={shadow} />
        </g>
      ) : (
        <>
          {type === 'willow' &&
            [-25, -15, -5, 5, 15, 25].map((sx, i) => (
              <path key={i} d={`M${sx} -60 C ${sx - 3} -44 ${sx + 2} -30 ${sx - 1} -12`} stroke={i < 3 ? light : shadow} strokeWidth="6" strokeLinecap="round" fill="none" />
            ))}
          {/* Shadow silhouette, then the lit shape nudged towards the light */}
          <Shapes list={crown} fill={shadow} />
          <Shapes list={crown} fill={light} transform={`translate(-3.5 -4) translate(0 ${CENTER[type] ?? -62}) scale(0.9) translate(0 ${-(CENTER[type] ?? -62)})`} />
          {(DABS[type] ?? DABS.default).map(([dx, dy, r], i) => (
            <circle key={i} cx={dx} cy={dy} r={r} fill={hi} opacity="0.9" />
          ))}
        </>
      )}
    </g>
  );
}

// A standalone tree picture (for the timer, path and legends).
export function TreeIcon({ type, size = 48, grow = 1 }) {
  const s = 0.25 + 0.75 * Math.max(0, Math.min(1, grow));
  return (
    <svg width={size} height={size} viewBox="-50 -105 100 110" aria-hidden="true">
      <Tree type={type} scale={s} />
    </svg>
  );
}
