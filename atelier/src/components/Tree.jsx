// Low-poly trees for the isometric valley (and the timer). Every crown is
// built from faceted gems lit from the upper left: light, mid and dark facets
// plus a highlight. Each kind has several variants (`variant`), and seasons
// tint them (autumn colours, snow on the crowns in winter).
//
// Sprites stand on (0, 0) and are about 72 units tall at scale 1 (one tile
// is 48 units wide at that scale).

export const TREE_INFO = {
  sapling: { name: 'Sapling', leaf: '#86cf6a' },
  birch: { name: 'Birch', leaf: '#b9d96a' },
  pine: { name: 'Pine', leaf: '#3f9a6b' },
  oak: { name: 'Oak', leaf: '#5fb15a' },
  maple: { name: 'Maple', leaf: '#e8643a' },
  willow: { name: 'Willow', leaf: '#9fcf5e' },
  ginkgo: { name: 'Ginkgo', leaf: '#f2c93f' },
  cypress: { name: 'Cypress', leaf: '#2f8a5f' },
  plane: { name: 'Plane tree', leaf: '#7fbf55' },
  magnolia: { name: 'Magnolia', leaf: '#6aa85a', flower: '#fbe3ec' },
  sakura: { name: 'Sakura', leaf: '#f6b3c8' },
  withered: { name: 'Withered tree', leaf: '#9b8b7a' },
};
export const VARIANTS = 3;

// ---- Colour helpers --------------------------------------------------------------------------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a, b, t) => {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
// light, mid, dark, highlight from one base colour
const shades = (c) => ({ light: mix(c, '#ffffff', 0.18), mid: c, dark: mix(c, '#1d2b3a', 0.32), hi: mix(c, '#ffffff', 0.5) });

// Seasonal leaf colour for deciduous kinds.
const AUTUMN = { oak: '#d98b2f', plane: '#e3b23c', birch: '#f0c43c', willow: '#c9b44a', maple: '#d9452c', magnolia: '#c98b3a' };
function leafColour(type, variant, season) {
  const base = TREE_INFO[type]?.leaf ?? '#6fbf5a';
  let c = season === 'autumn' && AUTUMN[type] ? AUTUMN[type] : base;
  // Variants shift the hue a little so a forest never looks copy-pasted.
  if (variant === 1) c = mix(c, '#f6e27a', 0.14);
  if (variant === 2) c = mix(c, '#1f5f5a', 0.14);
  return c;
}

// ---- Primitives -------------------------------------------------------------------------------
// A faceted gem: 7 outer points around (cx, cy); facets shaded by the
// direction they face. `snow` whitens the upward-facing facets.
function Gem({ cx, cy, rx, ry, c, snow, rot = 0 }) {
  const s = shades(c);
  const n = 7;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 ? 0.9 : 1;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  const core = [cx - rx * 0.18, cy - ry * 0.22];
  return (
    <g>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % n];
        const mx = (p[0] + q[0]) / 2 - cx;
        const my = (p[1] + q[1]) / 2 - cy;
        // facing: up-left = light, up/right = mid, down-right = dark
        const f = -mx * 0.7 - my;
        let fill = f > ry * 0.35 ? s.light : f > -ry * 0.35 ? s.mid : s.dark;
        if (snow && my < -ry * 0.2) fill = mix(fill, '#ffffff', 0.78);
        return <path key={i} d={`M${core[0]} ${core[1]} L${p[0]} ${p[1]} L${q[0]} ${q[1]} Z`} fill={fill} />;
      })}
      <path d={`M${core[0]} ${core[1]} L${pts[6][0]} ${pts[6][1]} L${pts[0][0]} ${pts[0][1]} Z`} fill={snow ? '#ffffff' : s.hi} opacity="0.55" />
    </g>
  );
}

// A cone seen from above-front: light left half, dark right half.
function Cone({ cx, base, w, h, c, snow }) {
  const s = shades(c);
  const front = base + w * 0.28;
  return (
    <g>
      <path d={`M${cx} ${base - h} L${cx - w} ${base} L${cx} ${front} Z`} fill={s.light} />
      <path d={`M${cx} ${base - h} L${cx} ${front} L${cx + w} ${base} Z`} fill={s.dark} />
      {snow && <path d={`M${cx} ${base - h} L${cx - w * 0.38} ${base - h * 0.6} L${cx - w * 0.05} ${base - h * 0.55} L${cx + w * 0.36} ${base - h * 0.62} Z`} fill="#ffffff" />}
    </g>
  );
}

// An isometric trunk: a small prism with lit left and shaded right faces.
function Trunk({ h, w = 2.4, c = '#8a5e3c' }) {
  const s = shades(c);
  return (
    <g>
      <path d={`M${-w} ${-w / 2} L0 0 L0 ${-h} L${-w} ${-w / 2 - h} Z`} fill={s.light} />
      <path d={`M0 0 L${w} ${-w / 2} L${w} ${-w / 2 - h} L0 ${-h} Z`} fill={s.dark} />
    </g>
  );
}

// ---- Tree kinds -------------------------------------------------------------------------------
function Crown({ type, v, season }) {
  const c = leafColour(type, v, season);
  const snow = season === 'winter';
  switch (type) {
    case 'sapling':
      return (
        <g>
          <Trunk h={14} w={1.3} />
          <Gem cx={0} cy={-18} rx={7 + v} ry={6 + v} c={c} snow={snow} />
          {v === 2 && <Gem cx={5} cy={-24} rx={4} ry={3.5} c={mix(c, '#ffffff', 0.1)} snow={snow} />}
        </g>
      );
    case 'birch': {
      const tall = [44, 52, 40][v];
      return (
        <g>
          <Trunk h={tall - 10} w={2} c="#efeae0" />
          {[10, 18, 26].map((y) => (
            <path key={y} d={`M-2 ${-y} h1.6`} stroke="#3a332c" strokeWidth="1.3" />
          ))}
          <Gem cx={0} cy={-tall} rx={12} ry={18} c={c} snow={snow} />
          {v !== 2 && <Gem cx={-8} cy={-tall + 12} rx={7} ry={9} c={mix(c, '#1f5f5a', 0.1)} snow={snow} />}
          {v === 1 && <Gem cx={8} cy={-tall + 8} rx={7} ry={9} c={c} snow={snow} />}
        </g>
      );
    }
    case 'pine': {
      const tiers = [3, 4, 2][v];
      const w = [17, 15, 21][v];
      return (
        <g>
          <Trunk h={10} />
          {Array.from({ length: tiers }, (_, i) => {
            const base = -8 - i * (v === 2 ? 17 : 13);
            const ww = w * (1 - i * 0.2);
            return <Cone key={i} cx={0} base={base} w={ww} h={ww * 1.35} c={mix(c, '#ffffff', i * 0.04)} snow={snow} />;
          })}
        </g>
      );
    }
    case 'cypress': {
      const h = [62, 70, 54][v];
      return (
        <g>
          <Trunk h={8} />
          <Cone cx={0} base={-6} w={10} h={h} c={c} snow={snow} />
          <Gem cx={0} cy={-18} rx={10} ry={12} c={c} snow={false} />
        </g>
      );
    }
    case 'oak':
    case 'plane': {
      const big = type === 'plane' ? 1.15 : 1;
      const layout = [
        [[-11, -36, 14], [11, -38, 14], [0, -50, 16]],
        [[-14, -34, 13], [14, -34, 13], [-4, -46, 14], [8, -50, 12]],
        [[0, -40, 13], [0, -56, 13]],
      ][v];
      return (
        <g>
          <Trunk h={30} w={3} />
          {layout.map(([x, y, r], i) => (
            <Gem key={i} cx={x * big} cy={y} rx={r * big} ry={r * 0.92} c={i % 2 ? mix(c, '#1f5f5a', 0.08) : c} snow={snow} rot={i * 0.5} />
          ))}
        </g>
      );
    }
    case 'maple': {
      const layout = [
        [[-10, -36, 12], [10, -37, 12], [0, -48, 14]],
        [[0, -40, 15], [-12, -32, 9], [12, -32, 9]],
        [[-8, -38, 11], [9, -44, 12], [-2, -54, 10]],
      ][v];
      return (
        <g>
          <Trunk h={28} w={2.6} c="#7a4e34" />
          {layout.map(([x, y, r], i) => (
            <Gem key={i} cx={x} cy={y} rx={r} ry={r * 0.9} c={i === 2 ? mix(c, '#f4b23a', 0.25) : c} snow={snow} rot={i} />
          ))}
        </g>
      );
    }
    case 'willow':
      return (
        <g>
          <Trunk h={26} w={2.8} c="#7f6040" />
          {[-14, -8, -2, 4, 10, 16].map((x, i) => (
            <path key={i} d={`M${x} -40 L${x + 2.5} -40 L${x + 1.5} ${-12 - (i % 3) * 3} L${x - 1} ${-14 - (i % 3) * 3} Z`} fill={i < 3 ? shades(c).light : shades(c).dark} />
          ))}
          <Gem cx={0} cy={-44} rx={20 + v * 2} ry={13} c={c} snow={snow} />
        </g>
      );
    case 'ginkgo':
      return (
        <g>
          <Trunk h={24} w={2.4} />
          {[
            [0, -44, 16],
            [-10, -34, 10],
            [10, -36, 10],
          ]
            .slice(0, v === 2 ? 1 : 3)
            .map(([x, y, r], i) => (
              <g key={i}>
                <path d={`M${x} ${y + r * 0.8} L${x - r} ${y - r * 0.5} Q ${x} ${y - r * 1.3} ${x + r} ${y - r * 0.5} Z`} fill={shades(c).light} />
                <path d={`M${x} ${y + r * 0.8} L${x} ${y - r * 0.95} Q ${x + r * 0.6} ${y - r * 0.9} ${x + r} ${y - r * 0.5} Z`} fill={shades(c).dark} />
                {snow && <path d={`M${x - r * 0.8} ${y - r * 0.55} Q ${x} ${y - r * 1.25} ${x + r * 0.8} ${y - r * 0.55} Q ${x} ${y - r * 0.85} ${x - r * 0.8} ${y - r * 0.55} Z`} fill="#fff" />}
              </g>
            ))}
        </g>
      );
    case 'magnolia':
    case 'sakura': {
      const petals = type === 'sakura' ? c : TREE_INFO.magnolia.flower;
      const leaves = type === 'sakura' ? mix(c, '#ffffff', 0.15) : c;
      const layout = [
        [[-11, -34, 12], [11, -36, 12], [0, -47, 14]],
        [[-13, -32, 10], [13, -32, 10], [-4, -44, 12], [8, -48, 10]],
        [[0, -40, 16]],
      ][v];
      return (
        <g>
          <Trunk h={26} w={2.6} c="#6e4a36" />
          {layout.map(([x, y, r], i) => (
            <Gem key={i} cx={x} cy={y} rx={r} ry={r * 0.9} c={season === 'winter' && type === 'magnolia' ? '#b9a48f' : leaves} snow={snow} rot={i * 0.7} />
          ))}
          {season !== 'winter' &&
            layout.flatMap(([x, y, r], i) =>
              [0, 1, 2].map((k) => <circle key={`${i}-${k}`} cx={x + Math.cos(k * 2.1 + i) * r * 0.55} cy={y + Math.sin(k * 2.1 + i) * r * 0.45} r={1.8} fill={mix(petals, '#ffffff', 0.4)} />),
            )}
        </g>
      );
    }
    case 'withered':
      return (
        <g>
          <Trunk h={24} w={2.4} c="#8c7b6a" />
          <g stroke="#8c7b6a" strokeWidth="2" strokeLinecap="round" fill="none">
            <path d="M0 -22 L-9 -34 M-5 -28 L-12 -29 M0 -24 L8 -36 M5 -31 L12 -32 M0 -24 L1 -40" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

export function Tree({ type = 'sapling', variant = 0, season = 'summer', x = 0, y = 0, scale = 1, opacity = 1, onPointerEnter, onPointerLeave, title }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      {title && <title>{title}</title>}
      <ellipse cx="3" cy="1" rx="15" ry="7" fill="#1d2b3a" opacity="0.18" />
      <Crown type={TREE_INFO[type] ? type : 'sapling'} v={variant % VARIANTS} season={season} />
    </g>
  );
}

// A standalone tree picture (for the timer, path and legends).
export function TreeIcon({ type, size = 48, grow = 1, variant = 0 }) {
  const s = 0.35 + 0.65 * Math.max(0, Math.min(1, grow));
  return (
    <svg width={size} height={size} viewBox="-36 -76 72 82" aria-hidden="true">
      <Tree type={type} variant={variant} scale={s} />
    </svg>
  );
}
