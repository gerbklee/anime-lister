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
const SKY = {
  dawn: ['#f3d9c4', '#f7e6d2', '#e9eef0'],
  day: ['#cfe1ec', '#e3eef2', '#f3efe4'],
  dusk: ['#e9b99a', '#f0cdb0', '#e8d9c8'],
  night: ['#1d2740', '#2c3756', '#454f6a'],
};
const LAND = {
  spring: { far: '#9fb7c4', hill: '#a9c98e', meadow: '#c6dca5', near: '#b5d193' },
  summer: { far: '#93acbb', hill: '#93ba79', meadow: '#b4d08c', near: '#a2c47c' },
  autumn: { far: '#a3aebd', hill: '#c9b06a', meadow: '#d8c88e', near: '#cfae6c' },
  winter: { far: '#b9c4cf', hill: '#d9dfe0', meadow: '#eef0ee', near: '#e3e8e6' },
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
  const ink = '#4a3b2c';
  const wall = '#efe2c8';
  const roof = '#b85a3a';
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

export default function World({ world, stages, areas, compact = false }) {
  const [tip, setTip] = useState(null);
  const box = useRef(null);
  const now = new Date();
  const sea = season(now);
  const time = daytime(now);
  const night = time === 'night';
  // At night the land takes on cool moonlight.
  const land = night ? Object.fromEntries(Object.entries(LAND[sea]).map(([k, c]) => [k, mix(c, '#2c3a66', 0.38)])) : LAND[sea];
  const sky = SKY[time];

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
            <stop offset="0.6" stopColor={sky[1]} />
            <stop offset="1" stopColor={sky[2]} />
          </linearGradient>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={night ? '#5d6f8f' : '#a9cde0'} />
            <stop offset="1" stopColor={night ? '#41557a' : '#7fb3cf'} />
          </linearGradient>
          <filter id="wc" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="9" />
          </filter>
          <radialGradient id="glow">
            <stop offset="0" stopColor="#ffd98a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#sky)" />
        {night &&
          Array.from({ length: 60 }, (_, i) => <circle key={i} cx={(i * 197) % W} cy={(i * 71) % 200} r={(i % 3) * 0.5 + 0.6} fill="#fff" opacity={0.35 + (i % 4) * 0.15} />)}
        {time === 'night' ? <circle cx="960" cy="80" r="26" fill="#f2ecd8" opacity="0.9" /> : <circle cx={time === 'dawn' ? 220 : time === 'dusk' ? 1000 : 900} cy={time === 'day' ? 70 : 150} r="34" fill={time === 'day' ? '#fbe9b5' : '#f6b980'} opacity="0.85" />}

        <g filter="url(#wc)">
          <path d="M-40 250 L120 160 L230 215 L360 120 L470 200 L600 140 L720 210 L840 110 L980 200 L1080 150 L1240 220 L1240 300 L-40 300 Z" fill={land.far} opacity="0.75" />
          {sea === 'winter' && <path d="M330 140 L360 120 L392 145 Z M812 132 L840 110 L866 130 Z M210 205 L230 215 L250 203 L230 190 Z" fill="#fff" opacity="0.8" />}
          <path d="M-40 290 C 160 230 300 260 430 240 C 560 220 650 250 760 235 C 900 215 1050 250 1240 235 L1240 360 L-40 360 Z" fill={land.hill} />
          <path d="M-40 330 C 200 290 380 300 560 290 C 760 280 980 300 1240 285 L1240 600 L-40 600 Z" fill={land.meadow} />
          <path d="M-40 470 C 220 440 420 460 600 450 C 800 440 1000 470 1240 455 L1240 600 L-40 600 Z" fill={land.near} opacity="0.7" />
        </g>

        {/* River */}
        <path d={riverPath} fill="none" stroke="url(#water)" strokeWidth="26" strokeLinecap="round" filter="url(#wc)" />
        <path d={riverPath} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="5" strokeDasharray="18 30" strokeLinecap="round" />

        {/* Region names, very faint */}
        {!compact &&
          Object.entries(REGIONS).map(([id, r]) => (
            <text key={id} x={r.x} y={r.y + r.ry + 14} textAnchor="middle" fontSize="11" fontFamily="Nunito Sans, sans-serif" fill={night ? '#c9cfdc' : '#5a5148'} opacity="0.55" letterSpacing="0.06em">
              {(id === 'free' ? 'Meadow' : regionName[id] ?? '').toUpperCase()}
            </text>
          ))}

        {/* Stepping stones: one per finished lesson, along the river bank */}
        {Array.from({ length: stones }, (_, i) => {
          const [x, y] = riverAt(0.02 + (i / 80) * 0.96);
          const side = i % 2 ? 1 : -1;
          return <ellipse key={i} cx={x + side * 24} cy={y + 2} rx={5 * depth(y) + 2} ry={2.4 * depth(y) + 1} fill="#a59a8a" stroke="#6e6353" strokeWidth="0.6" />;
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
            <g key={`l${i}`} transform={`translate(${x + side * (38 + (i % 5) * 4)} ${y})`}>
              <title>Lantern: a week you met your target</title>
              {(night || time === 'dusk') && <circle cx="0" cy={-14 * s} r={14 * s} fill="url(#glow)" />}
              <path d={`M0 0 V${-12 * s}`} stroke="#4a3b2c" strokeWidth="1" />
              <rect x={-2.6 * s} y={-18 * s} width={5.2 * s} height={6 * s} rx="1" fill="#f3c55a" stroke="#4a3b2c" strokeWidth="0.6" />
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
