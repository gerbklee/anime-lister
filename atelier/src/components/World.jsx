import { useMemo, useRef, useState } from 'react';
import { Tree, TREE_INFO } from './Tree.jsx';

// Your valley. Everything in it comes from what you did:
//   trees      - every focus block (a withered one when you gave up)
//   stones     - stepping stones along the river, one per finished lesson
//   buildings  - one per finished stage
//   lanterns   - one per week you met your target
//   easels     - one per skill check
// Season follows the calendar and the sky follows your clock.

const W = 1200;
const H = 560;

// Regions of the valley, one per skill area (plus a meadow for free drawing).
export const REGIONS = {
  gesture: { x: 140, y: 330, rx: 95, ry: 34 },
  line: { x: 410, y: 300, rx: 85, ry: 26 },
  form: { x: 280, y: 395, rx: 105, ry: 34 },
  anatomy: { x: 450, y: 430, rx: 80, ry: 30 },
  value: { x: 170, y: 485, rx: 110, ry: 34 },
  free: { x: 380, y: 520, rx: 110, ry: 26 },
  perspective: { x: 820, y: 290, rx: 85, ry: 24 },
  face: { x: 790, y: 395, rx: 85, ry: 30 },
  cloth: { x: 990, y: 335, rx: 95, ry: 28 },
  color: { x: 920, y: 470, rx: 100, ry: 32 },
  composition: { x: 1110, y: 430, rx: 70, ry: 34 },
  rendering: { x: 740, y: 515, rx: 90, ry: 26 },
};

// Building spots (by stage order).
const SPOTS = {
  campfire: [520, 500],
  hut: [300, 305],
  well: [120, 410],
  studio: [470, 360],
  bridge: [636, 400],
  atelier: [880, 380],
  windmill: [1060, 275],
  tower: [720, 262],
  gallery: [1010, 520],
  belltower: [230, 262],
  museum: [840, 545],
};

// The river as a chain of cubic curves (for placing stones and lanterns).
const RIVER = [
  [[610, 232], [585, 280], [700, 330], [650, 380]],
  [[650, 380], [610, 420], [530, 460], [560, 510]],
  [[560, 510], [575, 535], [555, 550], [560, 570]],
];
const bez = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
};
const riverAt = (t) => {
  const n = RIVER.length;
  const i = Math.min(n - 1, Math.floor(t * n));
  return bez(RIVER[i], t * n - i);
};
const riverPath = `M${RIVER[0][0]} ${RIVER.map((c) => `C${c[1]} ${c[2]} ${c[3]}`).join(' ')}`;

// Depth: things further up the valley are smaller.
const depth = (y) => 0.3 + ((y - 230) / 330) * 0.5;

function season(date = new Date()) {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}
function daytime(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5.5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17.5) return 'day';
  if (h >= 17.5 && h < 20.5) return 'dusk';
  return 'night';
}

// Anime background palette: deep clear skies, lit clouds, saturated greens,
// distance fading to the sky colour. Four stops from zenith to horizon.
const SKY = {
  dawn: ['#5b6fb8', '#a98bc0', '#f2b2a6', '#fde2c4'],
  day: ['#3f8ee0', '#6fb2ee', '#a9d4f5', '#e6f3fb'],
  dusk: ['#2f3d84', '#8a5d9e', '#e98a8a', '#f8c38c'],
  night: ['#0b1230', '#18235a', '#2b3b78', '#4a5b94'],
};
// Clouds: [lit top, shadow underside]
const CLOUD = {
  dawn: ['#fff1e6', '#e6b3c3'],
  day: ['#ffffff', '#cddcf3'],
  dusk: ['#ffd6bf', '#c486a6'],
  night: ['#3e4d80', '#2a3660'],
};
const LAND = {
  spring: { far: '#a9c1e0', mtn: '#7f9fcf', hill: '#7fcf86', hillShade: '#5fb173', meadow: '#a6dd8f', near: '#8fd07c', tuft: '#6cbd69', rim: '#c9f0a8' },
  summer: { far: '#9bb8e3', mtn: '#6f93cf', hill: '#5fbf78', hillShade: '#46a066', meadow: '#86d07a', near: '#72c46c', tuft: '#4fae5e', rim: '#b4ec98' },
  autumn: { far: '#b3bfdc', mtn: '#8a95c4', hill: '#e0a95c', hillShade: '#c58a47', meadow: '#ecc77c', near: '#e2b066', tuft: '#c98f45', rim: '#fbe2a6' },
  winter: { far: '#c9d6ec', mtn: '#a2b4d8', hill: '#eef3fa', hillShade: '#cfdbee', meadow: '#f6f9fd', near: '#e9f0f8', tuft: '#c3d2e8', rim: '#ffffff' },
};
// Time of day tints the land.
const TINT = { dawn: ['#f6c6b0', 0.14], day: null, dusk: ['#f09a7a', 0.2], night: ['#1b2550', 0.52] };

// Mountain ranges as ridge points (valley, peak, valley, ...).
const FAR = [[-40, 250], [90, 168], [200, 222], [330, 116], [450, 205], [560, 148], [680, 215], [820, 98], [950, 200], [1070, 142], [1240, 215]];
const MID = [[-40, 290], [60, 236], [170, 272], [290, 214], [400, 266], [520, 224], [640, 270], [760, 226], [880, 262], [1000, 220], [1120, 256], [1240, 240]];
const ridge = (pts, base) => `M${pts.map((p) => p.join(' ')).join(' L')} L1240 ${base} L-40 ${base} Z`;
// Cel shading: the side of each peak facing away from the light (to the right).
function shadowFaces(pts, base) {
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    if (py >= pts[i - 1][1] || py >= pts[i + 1][1]) continue; // not a peak
    const [vx, vy] = pts[i + 1];
    out.push(`M${px} ${py} L${vx} ${vy} L${vx} ${base} L${px + (vx - px) * 0.18} ${base} Z`);
  }
  return out;
}
function snowCaps(pts, depth) {
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    if (py >= pts[i - 1][1] || py >= pts[i + 1][1]) continue;
    const l = pts[i - 1];
    const r = pts[i + 1];
    const t = depth / Math.max(20, Math.min(l[1], r[1]) - py + depth);
    const a = [px + (l[0] - px) * t, py + (l[1] - py) * t];
    const b = [px + (r[0] - px) * t, py + (r[1] - py) * t];
    const mid = (a[0] + b[0]) / 2;
    out.push({
      lit: `M${px} ${py} L${a[0]} ${a[1]} L${a[0] + (mid - a[0]) * 0.4} ${a[1] - 5} L${mid - 4} ${a[1] + 3} L${px} ${py + depth * 0.5} Z`,
      shade: `M${px} ${py} L${px} ${py + depth * 0.5} L${mid + 6} ${b[1] - 2} L${b[0]} ${b[1]} Z`,
    });
  }
  return out;
}
const HILL_TOP = 'M-40 290 C 160 230 300 260 430 240 C 560 220 650 250 760 235 C 900 215 1050 250 1240 235';
const MEADOW_TOP = 'M-40 330 C 200 290 380 300 560 290 C 760 280 980 300 1240 285';
const NEAR_TOP = 'M-40 470 C 220 440 420 460 600 450 C 800 440 1000 470 1240 455';

// Deterministic pseudo-random numbers (same valley every render).
const rand = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Golden-angle spiral: stable spots in a region, new trees grow outward.
// The region fills its whole area from the start and gets denser as it grows.
function spot(region, k, n) {
  const cap = Math.max(18, Math.min(160, n));
  const r = Math.sqrt(((k % cap) + 0.5) / cap);
  const a = k * 2.399963 + Math.floor(k / cap) * 0.7;
  return [region.x + Math.cos(a) * r * region.rx, region.y + Math.sin(a) * r * region.ry];
}

function Building({ id, x, y, ghost, label }) {
  const s = depth(y) * 1.25;
  const ink = '#5a4a5e';
  const wall = '#fbf3e2';
  const roof = '#d0603f';
  const shapes = {
    campfire: (
      <g>
        <path d="M-14 0 L14 -6 M-14 -6 L14 0" stroke="#6b4a2f" strokeWidth="4" strokeLinecap="round" />
        <path d="M0 -34 C 10 -20 10 -10 0 -6 C -10 -10 -10 -20 0 -34 Z" fill="#f0a23a" />
        <path d="M0 -22 C 5 -14 5 -9 0 -7 C -5 -9 -5 -14 0 -22 Z" fill="#f7d36a" />
      </g>
    ),
    hut: (
      <g>
        <rect x="-20" y="-26" width="40" height="26" fill={wall} stroke={ink} strokeWidth="1.5" />
        <path d="M-26 -24 L0 -46 L26 -24 Z" fill={roof} stroke={ink} strokeWidth="1.5" />
        <rect x="-5" y="-14" width="10" height="14" fill={ink} opacity="0.7" />
      </g>
    ),
    well: (
      <g>
        <ellipse cx="0" cy="-8" rx="16" ry="6" fill="#9d8f7a" stroke={ink} strokeWidth="1.5" />
        <rect x="-16" y="-14" width="32" height="12" fill="#b9ab94" stroke={ink} strokeWidth="1.5" />
        <path d="M-14 -14 V-38 M14 -14 V-38" stroke={ink} strokeWidth="2" />
        <path d="M-20 -36 L0 -48 L20 -36 Z" fill={roof} stroke={ink} strokeWidth="1.5" />
      </g>
    ),
    studio: (
      <g>
        <rect x="-26" y="-32" width="52" height="32" fill={wall} stroke={ink} strokeWidth="1.5" />
        <path d="M-30 -30 L-30 -46 L30 -56 L30 -30 Z" fill="#7d9fb8" stroke={ink} strokeWidth="1.5" />
        <rect x="-18" y="-24" width="14" height="12" fill="#cfe1ec" stroke={ink} />
        <rect x="6" y="-24" width="12" height="24" fill={ink} opacity="0.6" />
      </g>
    ),
    bridge: (
      <g>
        <path d="M-40 0 Q 0 -30 40 0" fill="none" stroke="#8a6a48" strokeWidth="7" />
        <path d="M-40 -8 Q 0 -38 40 -8" fill="none" stroke={ink} strokeWidth="1.5" />
        {[-28, -14, 0, 14, 28].map((px) => (
          <path key={px} d={`M${px} ${-Math.max(4, 22 - Math.abs(px) * 0.55)} v8`} stroke={ink} strokeWidth="1.5" />
        ))}
      </g>
    ),
    atelier: (
      <g>
        <rect x="-32" y="-40" width="64" height="40" fill={wall} stroke={ink} strokeWidth="1.5" />
        <path d="M-38 -38 L0 -66 L38 -38 Z" fill={roof} stroke={ink} strokeWidth="1.5" />
        <rect x="-24" y="-30" width="18" height="16" fill="#f3d58c" stroke={ink} />
        <rect x="6" y="-30" width="18" height="16" fill="#f3d58c" stroke={ink} />
        <rect x="-6" y="-14" width="12" height="14" fill={ink} opacity="0.7" />
      </g>
    ),
    windmill: (
      <g>
        <path d="M-12 0 L-8 -50 L8 -50 L12 0 Z" fill={wall} stroke={ink} strokeWidth="1.5" />
        <g transform="translate(0 -50)" stroke={ink} strokeWidth="1.5" fill="#e9dcc2">
          <path d="M0 0 L-4 -34 L4 -34 Z" />
          <path d="M0 0 L34 -4 L34 4 Z" />
          <path d="M0 0 L4 34 L-4 34 Z" />
          <path d="M0 0 L-34 4 L-34 -4 Z" />
        </g>
      </g>
    ),
    tower: (
      <g>
        <rect x="-12" y="-70" width="24" height="70" fill="#d7ccb6" stroke={ink} strokeWidth="1.5" />
        <path d="M-16 -68 L0 -92 L16 -68 Z" fill="#6f8aa3" stroke={ink} strokeWidth="1.5" />
        <rect x="-4" y="-56" width="8" height="10" fill="#f3d58c" stroke={ink} />
      </g>
    ),
    gallery: (
      <g>
        <rect x="-40" y="-30" width="80" height="30" fill={wall} stroke={ink} strokeWidth="1.5" />
        <path d="M-46 -30 L0 -48 L46 -30 Z" fill="#d9c9a8" stroke={ink} strokeWidth="1.5" />
        {[-28, -10, 8, 26].map((px) => (
          <rect key={px} x={px - 4} y="-26" width="6" height="26" fill="#e9dcc2" stroke={ink} />
        ))}
      </g>
    ),
    belltower: (
      <g>
        <rect x="-10" y="-64" width="20" height="64" fill={wall} stroke={ink} strokeWidth="1.5" />
        <path d="M-14 -62 L0 -84 L14 -62 Z" fill={roof} stroke={ink} strokeWidth="1.5" />
        <path d="M-4 -52 a4 4 0 0 1 8 0 v6 h-8 Z" fill="#c9962f" stroke={ink} />
      </g>
    ),
    museum: (
      <g>
        <rect x="-50" y="-34" width="100" height="34" fill={wall} stroke={ink} strokeWidth="1.5" />
        <path d="M-56 -34 L0 -56 L56 -34 Z" fill="#cbbb98" stroke={ink} strokeWidth="1.5" />
        {[-38, -22, -6, 10, 26, 42].map((px) => (
          <rect key={px} x={px - 3} y="-30" width="5" height="30" fill="#f4ecdb" stroke={ink} />
        ))}
      </g>
    ),
  };
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={ghost ? 0.28 : 1} strokeDasharray={ghost ? '3 3' : undefined}>
      <title>{label}</title>
      {!ghost && <ellipse cx="0" cy="1" rx="34" ry="5" fill="#3b2f20" opacity="0.1" />}
      {shapes[id] ?? null}
    </g>
  );
}

function Cloud({ x, y, s, colours, dur, delay }) {
  const [lit, shade] = colours;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="w-cloud" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        {/* shadow underside first, then the lit puffs over it */}
        <path d="M-90 10 Q -92 -8 -66 -10 Q -60 -34 -30 -30 Q -14 -56 18 -44 Q 40 -60 62 -36 Q 92 -36 94 -6 Q 104 12 80 14 Z" fill={shade} />
        <path d="M-84 0 Q -84 -14 -64 -16 Q -58 -38 -30 -34 Q -14 -58 18 -48 Q 40 -64 60 -40 Q 88 -40 88 -14 Q 70 -4 40 -8 Q 10 0 -20 -4 Q -50 4 -84 0 Z" fill={lit} />
      </g>
    </g>
  );
}

// Seasonal particles: petals in spring, leaves in autumn, snow in winter.
function Particles({ sea, night }) {
  const kind = sea === 'spring' ? 'petal' : sea === 'autumn' ? 'leaf' : sea === 'winter' ? 'snow' : null;
  const list = [];
  if (kind)
    for (let i = 0; i < 22; i++) {
      const x = rand(i) * 1200;
      const dur = 14 + rand(i + 50) * 14;
      const delay = -rand(i + 99) * dur;
      const fill = kind === 'petal' ? (i % 2 ? '#ffc8d8' : '#ffe0ea') : kind === 'leaf' ? (i % 2 ? '#f08a3c' : '#e8b44a') : '#ffffff';
      list.push(
        <g key={`p${i}`} transform={`translate(${x} -20)`}>
          <g className="w-fall" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
            {kind === 'snow' ? <circle r={1.6 + rand(i + 7) * 1.8} fill={fill} opacity="0.9" /> : <path d="M0 -4 C 4 -4 5 2 0 5 C -5 2 -4 -4 0 -4 Z" fill={fill} opacity="0.92" />}
          </g>
        </g>,
      );
    }
  // Fireflies on warm nights, by the river.
  if (night && sea !== 'winter')
    for (let i = 0; i < 16; i++) {
      const x = 470 + rand(i + 300) * 300;
      const y = 300 + rand(i + 400) * 220;
      list.push(
        <g key={`f${i}`} transform={`translate(${x} ${y})`}>
          <g className="w-firefly" style={{ animationDuration: `${5 + rand(i) * 5}s`, animationDelay: `${-rand(i + 9) * 8}s` }}>
            <circle r="7" fill="url(#glow)" />
            <circle r="1.6" fill="#fff6c4" />
          </g>
        </g>,
      );
    }
  return <g pointerEvents="none">{list}</g>;
}

export default function World({ world, stages, areas, compact = false }) {
  const [tip, setTip] = useState(null);
  const box = useRef(null);
  const now = new Date();
  // Preview another season or time of day: #/?valley=dusk-spring
  const preview = (window.location.hash.split('?')[1] ?? '').match(/valley=(dawn|day|dusk|night)?-?(spring|summer|autumn|winter)?/);
  const sea = preview?.[2] ?? season(now);
  const time = preview?.[1] ?? daytime(now);
  const night = time === 'night';
  const tint = TINT[time];
  const land = tint ? Object.fromEntries(Object.entries(LAND[sea]).map(([k, c]) => [k, mix(c, tint[0], tint[1])])) : LAND[sea];
  const sky = SKY[time];
  const cloud = CLOUD[time];
  // Distance fades towards the horizon colour (atmospheric perspective).
  const far = mix(land.far, sky[3], 0.35);
  const mtn = mix(land.mtn, sky[3], 0.12);
  const sun = time === 'dawn' ? [230, 205] : time === 'dusk' ? [990, 200] : time === 'day' ? [930, 92] : [960, 88];

  const items = useMemo(() => {
    if (!world) return [];
    const out = [];
    // Trees: each region fills in order; only the newest 900 are drawn.
    const counts = {};
    const trees = world.trees.slice(-900);
    const regionOf = (t) => (REGIONS[t.area] ? t.area : 'free');
    const totals = {};
    for (const t of trees) totals[regionOf(t)] = (totals[regionOf(t)] ?? 0) + 1;
    for (const t of trees) {
      const key = regionOf(t);
      const k = (counts[key] = (counts[key] ?? -1) + 1);
      const [x, y] = spot(REGIONS[key], k, totals[key]);
      const grow = 0.75 + (Math.min(90, t.minutes) / 90) * 0.45;
      out.push({ kind: 'tree', y, x, t, s: depth(y) * grow * 0.95 });
    }
    // Buildings: finished stages, and the next one as a faint outline.
    const done = new Set((world.buildings ?? []).map((b) => b.id));
    (stages ?? []).forEach((st, i) => {
      const id = st.building.id;
      const [x, y] = SPOTS[id] ?? [600, 400];
      if (done.has(id)) out.push({ kind: 'building', x, y, id, label: `${st.building.name} – Stage ${i}: ${st.title} finished` });
      else if (i === world.stage) out.push({ kind: 'building', x, y, id, ghost: true, label: `Next: ${st.building.name} (finish Stage ${i}: ${st.title})` });
    });
    return out.sort((a, b) => a.y - b.y);
  }, [world, stages]);

  const stones = Math.min(world?.stones ?? 0, 80);
  const lanterns = Math.min(world?.lanterns ?? 0, 260);
  const easels = Math.min(world?.gallery?.length ?? 0, 24);
  const regionName = Object.fromEntries((areas ?? []).map((a) => [a.id, a.region]));
  const areaName = Object.fromEntries((areas ?? []).map((a) => [a.id, a.name]));

  const showTip = (e, text) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text });
  };

  return (
    <div className="world" ref={box} onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 ${compact ? 200 : 0} ${W} ${compact ? H - 200 : H}`} role="img" aria-label={`Your valley: ${world?.trees.length ?? 0} trees, ${world?.stones ?? 0} stepping stones, ${world?.buildings?.length ?? 0} buildings, ${world?.lanterns ?? 0} lanterns`}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky[0]} />
            <stop offset="0.35" stopColor={sky[1]} />
            <stop offset="0.7" stopColor={sky[2]} />
            <stop offset="1" stopColor={sky[3]} />
          </linearGradient>
          <radialGradient id="sunglow">
            <stop offset="0" stopColor={night ? '#dfe6ff' : '#fff6d8'} stopOpacity={night ? 0.35 : 0.8} />
            <stop offset="0.35" stopColor={night ? '#b8c6ff' : '#ffe3a8'} stopOpacity={night ? 0.12 : 0.35} />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky[3]} stopOpacity="0" />
            <stop offset="1" stopColor={sky[3]} stopOpacity="0.7" />
          </linearGradient>
          <radialGradient id="glow">
            <stop offset="0" stopColor="#ffe08a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sky */}
        <rect width={W} height={H} fill="url(#sky)" />
        {(night || time === 'dusk') &&
          Array.from({ length: night ? 90 : 25 }, (_, i) => (
            <circle key={i} className={i % 3 === 0 ? 'w-twinkle' : undefined} style={{ animationDelay: `${-rand(i) * 4}s` }} cx={rand(i + 1) * W} cy={rand(i + 2) * (night ? 230 : 110)} r={rand(i + 3) * 1.2 + 0.5} fill="#ffffff" opacity={0.4 + rand(i + 4) * 0.5} />
          ))}
        <circle cx={sun[0]} cy={sun[1]} r={night ? 120 : 210} fill="url(#sunglow)" />
        {night ? (
          <g>
            <circle cx={sun[0]} cy={sun[1]} r="24" fill="#f6f1dc" />
            <circle cx={sun[0] + 9} cy={sun[1] - 5} r="21" fill={sky[1]} opacity="0.92" />
          </g>
        ) : (
          <circle cx={sun[0]} cy={sun[1]} r="30" fill={time === 'day' ? '#fffbe8' : '#ffe1b0'} />
        )}
        {!night && (
          <g className="w-rays" opacity="0.5">
            {[-0.5, -0.22, 0.08, 0.36].map((a, i) => {
              const len = 700;
              const w = 26 + i * 8;
              const dx = Math.sin(a + (sun[0] > 600 ? 0.3 : -0.3)) * len;
              const dy = Math.cos(a) * len;
              return <path key={i} d={`M${sun[0]} ${sun[1]} L${sun[0] + dx - w} ${sun[1] + dy} L${sun[0] + dx + w} ${sun[1] + dy} Z`} fill="url(#ray)" />;
            })}
          </g>
        )}
        <Cloud x={170} y={92} s={1.05} colours={cloud} dur={70} delay={0} />
        <Cloud x={520} y={56} s={0.7} colours={cloud} dur={90} delay={-30} />
        <Cloud x={760} y={150} s={0.85} colours={cloud} dur={80} delay={-12} />
        <Cloud x={1110} y={70} s={0.6} colours={cloud} dur={100} delay={-50} />
        <Cloud x={360} y={175} s={0.5} colours={cloud} dur={60} delay={-20} />

        {/* Mountains: far range, near range, cel shaded, snow on the peaks */}
        <path d={ridge(FAR, 330)} fill={far} />
        {shadowFaces(FAR, 330).map((d, i) => (
          <path key={i} d={d} fill={mix(far, '#3a4a86', 0.16)} />
        ))}
        {snowCaps(FAR, sea === 'winter' ? 48 : 26).map((c, i) => (
          <g key={i}>
            <path d={c.lit} fill={mix('#ffffff', far, 0.15)} />
            <path d={c.shade} fill={mix('#dfe7f7', far, 0.3)} />
          </g>
        ))}
        <path d={ridge(MID, 340)} fill={mtn} />
        {shadowFaces(MID, 340).map((d, i) => (
          <path key={i} d={d} fill={mix(mtn, '#2d3a78', 0.2)} />
        ))}
        {sea === 'winter' &&
          snowCaps(MID, 22).map((c, i) => (
            <g key={i}>
              <path d={c.lit} fill="#ffffff" />
              <path d={c.shade} fill="#dce5f5" />
            </g>
          ))}
        <rect y="200" width={W} height="140" fill="url(#haze)" />

        {/* Hills, meadow and foreground with lit rims */}
        <path d={`${HILL_TOP} L1240 380 L-40 380 Z`} fill={land.hill} />
        <path d={`M-40 312 C 160 262 300 292 430 272 C 560 252 650 282 760 267 C 900 247 1050 282 1240 267 L1240 380 L-40 380 Z`} fill={land.hillShade} opacity="0.55" />
        <path d={HILL_TOP} fill="none" stroke={land.rim} strokeWidth="3" opacity="0.8" />
        <path d={`${MEADOW_TOP} L1240 600 L-40 600 Z`} fill={land.meadow} />
        <path d={MEADOW_TOP} fill="none" stroke={land.rim} strokeWidth="2.5" opacity="0.7" />
        <path d={`${NEAR_TOP} L1240 600 L-40 600 Z`} fill={land.near} />
        <path d={NEAR_TOP} fill="none" stroke={land.rim} strokeWidth="2" opacity="0.45" />
        {/* Grass tufts */}
        {Array.from({ length: 70 }, (_, i) => {
          const x = rand(i + 600) * W;
          const y = 320 + rand(i + 700) * 240;
          const s = depth(y) * 1.4;
          return <path key={i} d={`M${x - 5 * s} ${y} Q ${x - 3 * s} ${y - 8 * s} ${x - 1 * s} ${y - 11 * s} Q ${x} ${y - 5 * s} ${x + 1 * s} ${y} Q ${x + 3 * s} ${y - 9 * s} ${x + 6 * s} ${y - 10 * s} Q ${x + 4 * s} ${y - 4 * s} ${x + 4 * s} ${y} Z`} fill={land.tuft} opacity="0.7" />;
        })}

        {/* River: bank, water, a lit stripe, glints */}
        <path d={riverPath} fill="none" stroke={mix(land.meadow, '#3a5a7a', 0.35)} strokeWidth="34" strokeLinecap="round" />
        <path d={riverPath} fill="none" stroke={night ? '#3c5592' : '#5ea9e6'} strokeWidth="26" strokeLinecap="round" />
        <path d={riverPath} fill="none" stroke={night ? '#6f87c4' : '#a8dcfa'} strokeWidth="9" strokeLinecap="round" strokeDasharray="60 24 18 40" transform="translate(-4 -2)" />
        {Array.from({ length: 14 }, (_, i) => {
          const [x, y] = riverAt(0.06 + (i / 14) * 0.9);
          const s = 0.6 + depth(y);
          return (
            <path
              key={i}
              className="w-twinkle"
              style={{ animationDelay: `${-rand(i + 20) * 3}s` }}
              d={`M${x + (rand(i) - 0.5) * 12} ${y - 5 * s} l${1.2 * s} ${3.8 * s} l${3.8 * s} ${1.2 * s} l${-3.8 * s} ${1.2 * s} l${-1.2 * s} ${3.8 * s} l${-1.2 * s} ${-3.8 * s} l${-3.8 * s} ${-1.2 * s} l${3.8 * s} ${-1.2 * s} Z`}
              fill="#ffffff"
            />
          );
        })}

        {/* Region names, very faint */}
        {!compact &&
          Object.entries(REGIONS).map(([id, r]) => (
            <text key={id} x={r.x} y={r.y + r.ry + 14} textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="Nunito Sans, sans-serif" fill={night ? '#d6ddef' : '#2f3d2c'} opacity="0.45" letterSpacing="0.08em">
              {(id === 'free' ? 'Meadow' : regionName[id] ?? '').toUpperCase()}
            </text>
          ))}

        {/* Stepping stones: one per finished lesson, along the river bank */}
        {Array.from({ length: stones }, (_, i) => {
          const [x, y] = riverAt(0.02 + (i / 80) * 0.96);
          const side = i % 2 ? 1 : -1;
          const rx = 5 * depth(y) + 2.4;
          const ry = 2.6 * depth(y) + 1.2;
          return (
            <g key={i}>
              <ellipse cx={x + side * 26} cy={y + 2} rx={rx} ry={ry} fill="#8f8a9c" />
              <ellipse cx={x + side * 26 - rx * 0.15} cy={y + 2 - ry * 0.3} rx={rx * 0.8} ry={ry * 0.6} fill="#c4c0cf" />
            </g>
          );
        })}

        {items.map((it, i) =>
          it.kind === 'tree' ? (
            <Tree
              key={`t${it.t.id}`}
              type={it.t.tree}
              x={it.x}
              y={it.y}
              scale={it.s}
              onPointerEnter={(e) =>
                showTip(e, `${TREE_INFO[it.t.tree]?.name ?? 'Tree'} · ${it.t.minutes} min ${areaName[it.t.area] ? `· ${areaName[it.t.area]}` : ''} · ${new Date(it.t.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`)
              }
            />
          ) : (
            <Building key={`b${i}`} id={it.id} x={it.x} y={it.y} ghost={it.ghost} label={it.label} />
          ),
        )}

        {/* Lanterns: one per week you met your target, along the river */}
        {Array.from({ length: lanterns }, (_, i) => {
          const [x, y] = riverAt(0.01 + ((i * 0.618) % 1) * 0.98);
          const side = i % 2 ? -1 : 1;
          const s = depth(y);
          return (
            <g key={`l${i}`} transform={`translate(${x + side * (40 + (i % 5) * 4)} ${y})`}>
              <title>Lantern: a week you met your target</title>
              {(night || time === 'dusk') && <circle cx="0" cy={-14 * s} r={16 * s} fill="url(#glow)" />}
              <path d={`M0 0 V${-12 * s}`} stroke="#4a3b2c" strokeWidth="1" />
              <rect x={-2.8 * s} y={-19 * s} width={5.6 * s} height={7 * s} rx="1.5" fill="#ffcf5a" />
              <rect x={0} y={-19 * s} width={2.8 * s} height={7 * s} fill="#e8a23a" />
            </g>
          );
        })}

        {/* Easels: one per skill check, near the campfire */}
        {Array.from({ length: easels }, (_, i) => {
          const x = 560 + (i % 8) * 14 - 50;
          const y = 535 + Math.floor(i / 8) * 9;
          return (
            <g key={`e${i}`} transform={`translate(${x} ${y})`}>
              <title>{`Skill check #${world.gallery[i]}`}</title>
              <path d="M-5 0 L0 -14 L5 0 M0 -14 V0" stroke="#6b4a2f" strokeWidth="1.2" fill="none" />
              <rect x="-5" y="-15" width="10" height="8" fill="#fbf7ef" stroke="#6b4a2f" strokeWidth="0.8" />
            </g>
          );
        })}

        <Particles sea={sea} night={night} />
      </svg>
      {tip && (
        <div className="world-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

// Mixes two #rrggbb colours (t = share of b).
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
