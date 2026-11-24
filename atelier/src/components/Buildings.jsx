// Isometric buildings for the valley, one per finished stage. Each is built
// from small iso helpers (boxes, gable and pyramid roofs, cylinders, cones,
// windows) on a 2 × 2 tile plot. Light comes from the upper left: tops are
// brightest, left (+v) walls lit, right (+u) walls in shade.
import { mix } from './Tree.jsx';

const sh = (c) => ({ top: mix(c, '#ffffff', 0.2), left: c, right: mix(c, '#1d2b3a', 0.3) });

// Iso helpers for one plot: u, v in tiles from the plot's back corner, z in
// "units" (scaled with the tile size).
export function makeIso(A, ox, oy) {
  const k = A / 24;
  const P = (u, v, z = 0) => [ox + (u - v) * A, oy + ((u + v) * A) / 2 - z * k];
  const d = (pts) => `M${pts.map((p) => p.join(' ')).join(' L')} Z`;
  const poly = (pts, fill, key, extra = {}) => <path key={key} d={d(pts)} fill={fill} {...extra} />;
  let n = 0;
  const id = () => `p${n++}`;
  const I = {
    k,
    P,
    poly: (pts, fill, extra) => poly(pts, fill, id(), extra),
    box(u, v, w, dd, h, c, z0 = 0) {
      const s = sh(c);
      return [
        poly([P(u, v + dd, z0), P(u + w, v + dd, z0), P(u + w, v + dd, z0 + h), P(u, v + dd, z0 + h)], s.left, id()),
        poly([P(u + w, v, z0), P(u + w, v + dd, z0), P(u + w, v + dd, z0 + h), P(u + w, v, z0 + h)], s.right, id()),
        poly([P(u, v, z0 + h), P(u + w, v, z0 + h), P(u + w, v + dd, z0 + h), P(u, v + dd, z0 + h)], s.top, id()),
      ];
    },
    // Gable roof, ridge along u.
    gable(u, v, w, dd, z, rh, c, over = 0.12) {
      const s = sh(c);
      const [u0, u1, v0, v1] = [u - over, u + w + over, v - over, v + dd + over];
      const vm = v + dd / 2;
      return [
        poly([P(u0, v0, z), P(u1, v0, z), P(u1, vm, z + rh), P(u0, vm, z + rh)], s.right, id()),
        poly([P(u + w, v, z), P(u + w, v + dd, z), P(u + w, vm, z + rh)], mix(c, '#1d2b3a', 0.45), id()),
        poly([P(u0, v1, z), P(u1, v1, z), P(u1, vm, z + rh), P(u0, vm, z + rh)], s.top, id()),
      ];
    },
    // Pyramid roof.
    pyramid(u, v, w, dd, z, rh, c) {
      const s = sh(c);
      const apex = P(u + w / 2, v + dd / 2, z + rh);
      return [
        poly([P(u, v + dd, z), P(u + w, v + dd, z), apex], s.top, id()),
        poly([P(u + w, v, z), P(u + w, v + dd, z), apex], s.right, id()),
      ];
    },
    cylinder(u, v, r, h, c, z0 = 0) {
      const s = sh(c);
      const [cx, cy] = P(u, v, z0);
      const rx = r * A * 1.414;
      const ry = rx / 2;
      const top = cy - h * k;
      return [
        <path key={id()} d={`M${cx - rx} ${top} L${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx} ${cy + ry} L${cx} ${top + ry} A ${rx} ${ry} 0 0 1 ${cx - rx} ${top} Z`} fill={s.left} />,
        <path key={id()} d={`M${cx} ${top + ry} L${cx} ${cy + ry} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy} L${cx + rx} ${top} A ${rx} ${ry} 0 0 1 ${cx} ${top + ry} Z`} fill={s.right} />,
        <ellipse key={id()} cx={cx} cy={top} rx={rx} ry={ry} fill={s.top} />,
      ];
    },
    cone(u, v, r, z, h, c) {
      const s = sh(c);
      const [cx, cy] = P(u, v, z);
      const rx = r * A * 1.414;
      const ry = rx / 2;
      const ay = cy - h * k;
      return [
        <path key={id()} d={`M${cx} ${ay} L${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx} ${cy + ry} Z`} fill={s.top} />,
        <path key={id()} d={`M${cx} ${ay} L${cx} ${cy + ry} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy} Z`} fill={s.right} />,
      ];
    },
    // A window or door on the lit +v wall (from u1 to u2) or the shaded +u wall (v1 to v2).
    winL(u1, u2, v, z1, z2, c) {
      return poly([P(u1, v, z1), P(u2, v, z1), P(u2, v, z2), P(u1, v, z2)], c, id());
    },
    winR(u, v1, v2, z1, z2, c) {
      return poly([P(u, v1, z1), P(u, v2, z1), P(u, v2, z2), P(u, v1, z2)], c, id());
    },
  };
  return I;
}

const WOOD = '#b07a4f';
const STONE = '#b9b2a6';
const PLASTER = '#f3ead8';
const ROOF = '#cf5b3e';
const ROOF2 = '#4f78a8';

// Each building: (I, { night }) => elements, drawn on a 2 × 2 plot.
export const BUILDINGS = {
  campfire: (I, { night }) => {
    const [cx, cy] = I.P(1, 1, 0);
    const k = I.k;
    return [
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return I.box(1 + Math.cos(a) * 0.42 - 0.07, 1 + Math.sin(a) * 0.42 - 0.07, 0.14, 0.14, 4, STONE);
      }).flat(),
      ...I.box(0.72, 0.95, 0.56, 0.1, 3, '#6e4a30'),
      ...I.box(0.95, 0.72, 0.1, 0.56, 3, '#7e5436'),
      night && <circle key="glow" cx={cx} cy={cy - 8 * k} r={40 * k} fill="url(#glow)" />,
      <path key="f1" d={`M${cx} ${cy - 30 * k} C ${cx + 10 * k} ${cy - 16 * k} ${cx + 8 * k} ${cy - 4 * k} ${cx} ${cy - 2 * k} C ${cx - 8 * k} ${cy - 4 * k} ${cx - 10 * k} ${cy - 16 * k} ${cx} ${cy - 30 * k} Z`} fill="#f5a63a" />,
      <path key="f2" d={`M${cx} ${cy - 20 * k} C ${cx + 5 * k} ${cy - 12 * k} ${cx + 4 * k} ${cy - 5 * k} ${cx} ${cy - 3 * k} C ${cx - 4 * k} ${cy - 5 * k} ${cx - 5 * k} ${cy - 12 * k} ${cx} ${cy - 20 * k} Z`} fill="#ffe08a" />,
    ];
  },
  hut: (I, { night }) => [
    ...I.box(0.45, 0.45, 1.1, 1.1, 18, WOOD),
    I.winL(0.85, 1.15, 1.55, 0, 12, '#5b3b26'),
    I.winR(1.55, 0.7, 1.0, 7, 13, night ? '#ffd77a' : '#a8d4ef'),
    ...I.gable(0.45, 0.45, 1.1, 1.1, 18, 16, '#d9b45a'),
  ],
  well: (I) => [
    ...I.cylinder(1, 1, 0.42, 9, STONE),
    <ellipse key="water" cx={I.P(1, 1, 9)[0]} cy={I.P(1, 1, 9)[1]} rx={0.32 * 24 * I.k * 1.414} ry={0.16 * 24 * I.k * 1.414} fill="#4f8fc0" />,
    ...I.box(0.55, 0.95, 0.08, 0.08, 26, WOOD),
    ...I.box(1.37, 0.95, 0.08, 0.08, 26, WOOD),
    ...I.gable(0.5, 0.75, 1.0, 0.5, 26, 9, ROOF),
  ],
  studio: (I, { night }) => [
    ...I.box(0.25, 0.4, 1.5, 1.2, 22, PLASTER),
    I.winL(0.45, 0.85, 1.6, 8, 17, night ? '#ffd77a' : '#a8d4ef'),
    I.winL(1.0, 1.3, 1.6, 0, 14, '#6a8fb3'),
    I.winR(1.75, 0.6, 1.0, 8, 17, night ? '#ffd77a' : '#8fbfe0'),
    I.winR(1.75, 1.1, 1.45, 8, 17, night ? '#ffd77a' : '#8fbfe0'),
    ...I.gable(0.25, 0.4, 1.5, 1.2, 22, 14, ROOF2),
    ...I.box(1.35, 0.55, 0.16, 0.16, 40, '#9a8f84'),
  ],
  bridge: (I) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = 0.2 + (i / 10) * 1.6;
      const z = 4 + Math.sin((i / 10) * Math.PI) * 10;
      pts.push(...I.box(u - 0.08, 0.7, 0.16, 0.6, 2.5, WOOD, z));
    }
    const rail = [0, 2, 4, 6, 8, 10].map((i) => {
      const u = 0.2 + (i / 10) * 1.6;
      const z = 6.5 + Math.sin((i / 10) * Math.PI) * 10;
      return I.box(u - 0.04, 1.26, 0.06, 0.06, 7, '#7e5436', z);
    });
    return [...pts, ...rail.flat()];
  },
  atelier: (I, { night }) => [
    ...I.box(0.2, 0.3, 1.6, 1.4, 34, '#f6e6c8'),
    ...[0.4, 0.85, 1.3].map((u) => I.winL(u, u + 0.3, 1.7, 18, 30, night ? '#ffd77a' : '#a8d4ef')),
    ...[0.4, 1.3].map((u) => I.winL(u, u + 0.3, 1.7, 3, 13, night ? '#ffd77a' : '#a8d4ef')),
    I.winL(0.85, 1.15, 1.7, 0, 14, '#6e4a30'),
    I.winR(1.8, 0.5, 0.9, 18, 30, night ? '#ffd77a' : '#8fbfe0'),
    I.winR(1.8, 1.1, 1.5, 18, 30, night ? '#ffd77a' : '#8fbfe0'),
    ...I.box(0.3, 1.7, 1.4, 0.18, 2, WOOD, 16),
    ...I.gable(0.2, 0.3, 1.6, 1.4, 34, 18, ROOF),
    ...I.box(0.45, 0.45, 0.18, 0.18, 58, '#9a8f84'),
  ],
  windmill: (I) => {
    const [hx, hy] = I.P(1, 1.2, 46);
    const k = I.k;
    const blade = (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const L = 30 * k;
      const W = 5 * k;
      return `M${hx} ${hy} L${hx + c * L - s * W} ${hy + s * L + c * W} L${hx + c * L + s * W} ${hy + s * L - c * W} Z`;
    };
    return [
      ...I.cylinder(1, 1, 0.42, 44, '#f1e4cc'),
      I.winL(0.95, 1.1, 1.3, 0, 10, '#6e4a30'),
      ...I.cone(1, 1, 0.48, 44, 16, ROOF),
      ...[0.3, 1.87, 3.44, 5.01].map((a, i) => <path key={`bl${i}`} d={blade(a)} fill={i % 2 ? '#e9dcc2' : '#fbf3e2'} stroke="#8a6a48" strokeWidth={0.8 * k} />),
      <circle key="hub" cx={hx} cy={hy} r={3 * k} fill="#6e4a30" />,
    ];
  },
  tower: (I, { night }) => {
    const [fx, fy] = I.P(1, 1, 86);
    const k = I.k;
    return [
      ...I.cylinder(1, 1, 0.36, 62, '#c9c0b0'),
      I.winL(0.9, 1.05, 1.36, 40, 50, night ? '#ffd77a' : '#4a5a70'),
      I.winL(0.9, 1.05, 1.36, 18, 28, night ? '#ffd77a' : '#4a5a70'),
      ...I.cone(1, 1, 0.44, 62, 24, ROOF2),
      <path key="pole" d={`M${fx} ${fy} V${fy - 12 * k}`} stroke="#5a4a3a" strokeWidth={1.2 * k} />,
      <path key="flag" d={`M${fx} ${fy - 12 * k} L${fx + 10 * k} ${fy - 9 * k} L${fx} ${fy - 6 * k} Z`} fill="#e8643a" />,
    ];
  },
  gallery: (I, { night }) => [
    ...I.box(0.1, 0.4, 1.8, 1.2, 4, STONE),
    ...I.box(0.2, 0.5, 1.6, 0.9, 22, PLASTER, 4),
    ...[0.25, 0.6, 0.95, 1.3, 1.65].map((u) => I.box(u, 1.5, 0.1, 0.1, 22, '#fbf6ea', 4)).flat(),
    I.winL(0.85, 1.15, 1.4, 4, 18, night ? '#ffd77a' : '#7f6a55'),
    ...I.box(0.1, 0.4, 1.8, 1.2, 4, '#e9dfcc', 26),
    ...I.gable(0.1, 0.4, 1.8, 1.2, 30, 10, '#d9c9a8', 0.04),
  ],
  belltower: (I) => [
    ...I.box(0.65, 0.65, 0.7, 0.7, 60, PLASTER),
    I.winL(0.8, 1.2, 1.35, 44, 56, '#3b3a44'),
    I.winR(1.35, 0.8, 1.2, 44, 56, '#2e2d36'),
    <circle key="bell" cx={I.P(1, 1.35, 48)[0]} cy={I.P(1, 1.35, 48)[1]} r={3.5 * I.k} fill="#d9a83a" />,
    ...I.pyramid(0.6, 0.6, 0.8, 0.8, 60, 22, ROOF),
  ],
  museum: (I, { night }) => {
    const [dx, dy] = I.P(1, 1, 30);
    const k = I.k;
    const r = 0.45 * 24 * k * 1.414;
    return [
      ...I.box(0.05, 0.2, 1.9, 1.6, 4, STONE),
      ...I.box(0.15, 0.3, 1.7, 1.3, 26, '#f6efe2', 4),
      ...[0.2, 0.5, 0.8, 1.1, 1.4, 1.7].map((u) => I.box(u, 1.62, 0.1, 0.1, 26, '#ffffff', 4)).flat(),
      I.winL(0.85, 1.15, 1.6, 4, 20, night ? '#ffd77a' : '#7f6a55'),
      ...I.box(0.05, 0.2, 1.9, 1.6, 4, '#e9dfcc', 30),
      <path key="dome" d={`M${dx - r} ${dy} A ${r} ${r * 0.9} 0 0 1 ${dx + r} ${dy} A ${r} ${r * 0.5} 0 0 1 ${dx - r} ${dy} Z`} fill="#8fb3c9" />,
      <path key="domeS" d={`M${dx} ${dy - r * 0.9} A ${r} ${r * 0.9} 0 0 1 ${dx + r} ${dy} A ${r} ${r * 0.5} 0 0 1 ${dx} ${dy + r * 0.5} Z`} fill="#6e95ad" />,
      <circle key="domeT" cx={dx} cy={dy - r * 0.9 - 2 * k} r={2 * k} fill="#d9a83a" />,
    ];
  },
};
