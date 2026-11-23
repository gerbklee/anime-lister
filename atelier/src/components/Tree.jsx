// Trees of the valley, one kind per stage of the path, painted as soft
// overlapping washes. Drawn with the base at (0, 0), about 100 units tall.

export const TREE_INFO = {
  sapling: { name: 'Sapling', leaves: ['#8fbf6a', '#6fa456'], trunk: '#7a5a3c' },
  birch: { name: 'Birch', leaves: ['#b5cf6e', '#93b754'], trunk: '#e9e3d6' },
  pine: { name: 'Pine', leaves: ['#4c8664', '#356b4f'], trunk: '#5a4030' },
  oak: { name: 'Oak', leaves: ['#6c9a52', '#527f3f'], trunk: '#5e4430' },
  maple: { name: 'Maple', leaves: ['#de6c3e', '#c4502c'], trunk: '#5e4430' },
  willow: { name: 'Willow', leaves: ['#a6c56f', '#86aa56'], trunk: '#6a5038' },
  ginkgo: { name: 'Ginkgo', leaves: ['#ecc853', '#d8ae33'], trunk: '#6a5038' },
  cypress: { name: 'Cypress', leaves: ['#3f6f50', '#2f5a41'], trunk: '#5a4030' },
  plane: { name: 'Plane tree', leaves: ['#86ad63', '#6a934d'], trunk: '#9a8a70' },
  magnolia: { name: 'Magnolia', leaves: ['#f1cdd5', '#e1a6b5'], trunk: '#6a5038' },
  sakura: { name: 'Sakura', leaves: ['#f6c3d0', '#ec9fb5'], trunk: '#5e4430' },
  withered: { name: 'Withered tree', leaves: ['#b3a690', '#9a8c76'], trunk: '#8a7a68' },
};

const Trunk = ({ c, h = 46, w = 3 }) => <path d={`M${-w} 0 L${-w * 0.6} ${-h} L${w * 0.6} ${-h} L${w} 0 Z`} fill={c} />;

function Crown({ type, a, b }) {
  switch (type) {
    case 'sapling':
      return (
        <g>
          <path d="M0 -26 C -14 -30 -16 -42 -4 -44 C 0 -36 0 -30 0 -26 Z" fill={a} />
          <path d="M0 -30 C 14 -34 16 -48 4 -50 C 0 -42 0 -36 0 -30 Z" fill={b} opacity="0.9" />
        </g>
      );
    case 'birch':
      return (
        <g>
          <ellipse cx="0" cy="-64" rx="17" ry="30" fill={a} opacity="0.9" />
          <ellipse cx="5" cy="-58" rx="11" ry="20" fill={b} opacity="0.6" />
        </g>
      );
    case 'pine':
    case 'cypress':
      if (type === 'cypress')
        return (
          <g>
            <path d="M0 -100 C 12 -80 13 -40 9 -18 L -9 -18 C -13 -40 -12 -80 0 -100 Z" fill={a} />
            <path d="M2 -88 C 9 -70 9 -42 6 -22 L -1 -22 Z" fill={b} opacity="0.7" />
          </g>
        );
      return (
        <g>
          <path d="M0 -98 L 15 -66 L -15 -66 Z" fill={a} />
          <path d="M0 -82 L 20 -44 L -20 -44 Z" fill={a} />
          <path d="M0 -64 L 25 -18 L -25 -18 Z" fill={a} />
          <path d="M0 -64 L 25 -18 L 4 -18 Z" fill={b} opacity="0.55" />
        </g>
      );
    case 'willow':
      return (
        <g>
          <ellipse cx="0" cy="-66" rx="28" ry="20" fill={a} />
          {[-24, -14, -4, 6, 16, 25].map((x, i) => (
            <path key={i} d={`M${x} -62 C ${x - 3} -44 ${x + 2} -30 ${x - 1} -14`} stroke={i % 2 ? b : a} strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.85" />
          ))}
        </g>
      );
    case 'ginkgo':
      return (
        <g>
          <path d="M0 -50 C -30 -52 -30 -92 0 -98 C 30 -92 30 -52 0 -50 Z" fill={a} />
          <path d="M0 -50 C 16 -54 22 -80 8 -92 C 22 -80 26 -58 0 -50 Z" fill={b} opacity="0.7" />
        </g>
      );
    case 'sakura':
    case 'magnolia':
      return (
        <g>
          {[
            [-16, -56, 14],
            [14, -58, 14],
            [0, -72, 17],
            [-22, -70, 11],
            [22, -72, 11],
            [0, -54, 12],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? b : a} opacity="0.88" />
          ))}
        </g>
      );
    case 'withered':
      return (
        <g stroke={a} strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d="M0 -40 L -12 -58 M -6 -49 L -14 -50 M0 -44 L 10 -62 M 6 -54 L 15 -56 M 0 -46 L 1 -68" />
        </g>
      );
    case 'plane':
      return (
        <g>
          <circle cx="-18" cy="-58" r="20" fill={a} opacity="0.92" />
          <circle cx="18" cy="-60" r="21" fill={a} opacity="0.92" />
          <circle cx="0" cy="-78" r="24" fill={a} />
          <circle cx="10" cy="-62" r="14" fill={b} opacity="0.55" />
        </g>
      );
    default: // oak, maple
      return (
        <g>
          <circle cx="-14" cy="-56" r="18" fill={a} opacity="0.92" />
          <circle cx="14" cy="-58" r="18" fill={a} opacity="0.92" />
          <circle cx="0" cy="-74" r="21" fill={a} />
          <circle cx="8" cy="-60" r="12" fill={b} opacity="0.6" />
        </g>
      );
  }
}

export function Tree({ type = 'sapling', x = 0, y = 0, scale = 1, opacity = 1, onPointerEnter, onPointerLeave, title }) {
  const info = TREE_INFO[type] ?? TREE_INFO.sapling;
  const [a, b] = info.leaves;
  const trunkH = type === 'sapling' ? 30 : type === 'cypress' ? 20 : 46;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      {title && <title>{title}</title>}
      <ellipse cx="0" cy="1" rx={type === 'sapling' ? 8 : 20} ry="4" fill="#3b2f20" opacity="0.12" />
      <Trunk c={info.trunk} h={trunkH} w={type === 'sapling' ? 1.6 : 3} />
      {type === 'birch' && <path d="M-2 -12 h3 M-1 -24 h3 M-2 -34 h2" stroke="#3b3128" strokeWidth="1.4" />}
      <Crown type={type} a={a} b={b} />
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
