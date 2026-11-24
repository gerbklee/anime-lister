import { useEffect, useMemo, useRef, useState } from 'react';
import { Tree, TREE_INFO, VARIANTS, mix } from './Tree.jsx';
import { BUILDINGS, LANDMARKS, makeIso } from './Buildings.jsx';

// Your valley: a floating isometric island, like a Forest app plot that grows
// with you. Everything on it comes from what you did:
//   trees     - every focus block, one per tile (withered if you gave up)
//   path      - a stone path, one stone tile per finished lesson
//   buildings - one per finished stage (the next one shows as a faint outline)
//   lanterns  - one per week you met your target, along the island's edge
//   easels    - one per skill check, around the campfire
// The island grows as you plant more trees. Season follows the calendar,
// the sky your clock.

const W = 1200;
// From this many objects on, the island is kept as one picture.
const RASTER_AT = 250;

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
  dawn: ['#6a7fc4', '#b49ad0', '#f4bcae', '#fde6cb'],
  day: ['#4b98e6', '#7dbcf0', '#b4dcf7', '#e9f5fb'],
  dusk: ['#36458e', '#93649f', '#ec9090', '#f9c690'],
  night: ['#0c1433', '#18245c', '#283a78', '#3f5390'],
};
const CLOUD = { dawn: ['#fff3e8', '#e6b6c6'], day: ['#ffffff', '#d2e0f5'], dusk: ['#ffd9c4', '#c88aa8'], night: ['#3a4a80', '#29355f'] };
const GRASS = {
  spring: ['#9edb7c', '#93d273', '#c6efa5'],
  summer: ['#7fcb6a', '#74c062', '#b4e895'],
  autumn: ['#d6c26a', '#cdb75f', '#efdf98'],
  winter: ['#eef4fa', '#e3ebf4', '#ffffff'],
};
const TINT = { dawn: ['#f6c6b0', 0.12], day: null, dusk: ['#f09a7a', 0.18], night: ['#1b2550', 0.48] };

const rand = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Cloud({ x, y, s, colours, dur, delay }) {
  const [lit, shade] = colours;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="w-cloud" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <path d="M-90 10 Q -92 -8 -66 -10 Q -60 -34 -30 -30 Q -14 -56 18 -44 Q 40 -60 62 -36 Q 92 -36 94 -6 Q 104 12 80 14 Z" fill={shade} />
        <path d="M-84 0 Q -84 -14 -64 -16 Q -58 -38 -30 -34 Q -14 -58 18 -48 Q 40 -64 60 -40 Q 88 -40 88 -14 Q 70 -4 40 -8 Q 10 0 -20 -4 Q -50 4 -84 0 Z" fill={lit} />
      </g>
    </g>
  );
}

function Particles({ sea, night, h }) {
  const kind = sea === 'spring' ? 'petal' : sea === 'autumn' ? 'leaf' : sea === 'winter' ? 'snow' : null;
  const list = [];
  if (kind)
    for (let i = 0; i < 24; i++) {
      const dur = 14 + rand(i + 50) * 14;
      const fill = kind === 'petal' ? (i % 2 ? '#ffc8d8' : '#ffe0ea') : kind === 'leaf' ? (i % 2 ? '#f08a3c' : '#e8b44a') : '#ffffff';
      list.push(
        <g key={`p${i}`} transform={`translate(${rand(i) * W} -20)`}>
          <g className="w-fall" style={{ animationDuration: `${dur}s`, animationDelay: `${-rand(i + 99) * dur}s` }}>
            {kind === 'snow' ? <circle r={1.6 + rand(i + 7) * 1.8} fill={fill} opacity="0.9" /> : <path d="M0 -4 C 4 -4 5 2 0 5 C -5 2 -4 -4 0 -4 Z" fill={fill} opacity="0.92" />}
          </g>
        </g>,
      );
    }
  if (night && sea !== 'winter')
    for (let i = 0; i < 18; i++)
      list.push(
        <g key={`f${i}`} transform={`translate(${250 + rand(i + 300) * 700} ${h * 0.3 + rand(i + 400) * h * 0.5})`}>
          <g className="w-firefly" style={{ animationDuration: `${5 + rand(i) * 5}s`, animationDelay: `${-rand(i + 9) * 8}s` }}>
            <circle r="7" fill="url(#glow-p)" />
            <circle r="1.6" fill="#fff6c4" />
          </g>
        </g>,
      );
  return <g pointerEvents="none">{list}</g>;
}

// Small decorations on empty tiles, by season.
function Decoration({ kind, x, y, s, sea, seed }) {
  const g = (children) => <g transform={`translate(${x} ${y}) scale(${s})`}>{children}</g>;
  switch (kind) {
    case 'bush':
      return g(
        <>
          <ellipse cx="2" cy="1" rx="9" ry="4" fill="#1d2b3a" opacity="0.15" />
          <path d="M-9 0 Q -10 -10 -2 -11 Q 4 -15 9 -8 Q 12 -2 8 0 Z" fill={sea === 'autumn' ? '#c9893a' : sea === 'winter' ? '#dfe8f2' : '#5aa557'} />
          <path d="M0 -11 Q 6 -14 9 -8 Q 12 -2 8 0 L 0 0 Z" fill={sea === 'winter' ? '#c8d5e4' : mix(sea === 'autumn' ? '#c9893a' : '#5aa557', '#1d2b3a', 0.3)} />
        </>,
      );
    case 'flowers': {
      const cols = ['#ff8fb1', '#ffd35a', '#ffffff', '#b78cff', '#ff7a5a'];
      return g(
        <>
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${(rand(seed + i) - 0.5) * 18} ${(rand(seed + i + 9) - 0.5) * 8})`}>
              <path d="M0 0 V-6" stroke="#4f9a4c" strokeWidth="1.2" />
              <circle cy="-7" r="2.2" fill={cols[(seed + i) % cols.length]} />
            </g>
          ))}
        </>,
      );
    }
    case 'rock':
      return g(
        <>
          <path d="M-7 0 L-5 -6 L1 -8 L7 -4 L6 0 Z" fill="#b5b0aa" />
          <path d="M1 -8 L7 -4 L6 0 L1 0 Z" fill="#8c877f" />
          {sea === 'winter' && <path d="M-5 -6 L1 -8 L5 -6 L0 -5 Z" fill="#fff" />}
        </>,
      );
    case 'mushroom':
      return g(
        <>
          <path d="M-1 0 V-4 H1 V0 Z" fill="#f3ead8" />
          <path d="M-5 -4 Q 0 -10 5 -4 Z" fill="#d9452c" />
          <circle cx="-1.5" cy="-6" r="0.8" fill="#fff" />
          <circle cx="1.8" cy="-5.2" r="0.7" fill="#fff" />
        </>,
      );
    case 'grass':
      return g(
        <path d="M-6 0 Q -5 -7 -3 -9 Q -2 -4 -1 0 Q 0 -8 2 -10 Q 2 -4 3 0 Q 4 -6 6 -7 Q 5 -3 5 0 Z" fill={sea === 'winter' ? '#cbd7e6' : sea === 'autumn' ? '#b99a4a' : '#5fa856'} />,
      );
    case 'snowman':
      return g(
        <>
          <circle cy="-5" r="5" fill="#ffffff" />
          <circle cy="-13" r="3.6" fill="#f4f7fb" />
          <path d="M0 -13 L4 -12.5 L0 -12 Z" fill="#f08a3c" />
        </>,
      );
    default:
      return null;
  }
}

// Building plots (2 × 2 tiles) as fractions of the island, by stage.
const PLOTS = {
  campfire: [0.46, 0.46],
  hut: [0.18, 0.2],
  well: [0.66, 0.2],
  studio: [0.2, 0.64],
  bridge: [0.42, 0.78],
  atelier: [0.68, 0.62],
  windmill: [0.08, 0.42],
  tower: [0.44, 0.1],
  gallery: [0.8, 0.4],
  belltower: [0.32, 0.36],
  museum: [0.56, 0.36],
  teahouse: [0.02, 0.86],
  lighthouse: [0.9, 0.0],
  pagoda: [0.88, 0.86],
};

export default function World({ world, stages }) {
  const [tip, setTip] = useState(null);
  const box = useRef(null);
  const islandRef = useRef(null);
  // Big islands are drawn once and kept as a single picture (cheap to show,
  // also on phones); small ones stay live SVG.
  const [raster, setRaster] = useState(null);
  const now = new Date();
  const preview = (window.location.hash.split('?')[1] ?? '').match(/valley=(dawn|day|dusk|night)?-?(spring|summer|autumn|winter)?/);
  const sea = preview?.[2] ?? season(now);
  const time = preview?.[1] ?? daytime(now);
  const night = time === 'night';
  const tint = TINT[time];
  const t = (c) => (tint ? mix(c, tint[0], tint[1]) : c);
  const sky = SKY[time];

  const scene = useMemo(() => {
    if (!world) return null;
    const trees = world.trees;
    const stones = Math.min(world.stones ?? 0, 400);
    // The island grows with your trees (plus room for buildings and the path).
    const N = Math.max(10, Math.min(34, Math.ceil(Math.sqrt((trees.length + 60 + stones * 0.4 + (world.landmarks?.length ?? 0) * 2) * 1.35))));
    const A = 520 / N;
    const ox = W / 2;
    const oy = 150;
    const P = (u, v, z = 0) => [ox + (u - v) * A, oy + ((u + v) * A) / 2 - z];
    const k = A / 24;

    // Plots for buildings (2 × 2).
    const taken = new Set();
    const plots = {};
    for (const [id, [fu, fv]] of Object.entries(PLOTS)) {
      const u = Math.min(N - 2, Math.max(0, Math.round(fu * N)));
      const v = Math.min(N - 2, Math.max(0, Math.round(fv * N)));
      plots[id] = [u, v];
      for (const [du, dv] of [[0, 0], [1, 0], [0, 1], [1, 1]]) taken.add(`${u + du},${v + dv}`);
    }
    // A clearing in front of every plot, so trees never hide a building.
    const clearing = new Set();
    for (const [u, v] of Object.values(plots))
      for (let i = 0; i <= 2; i++) {
        clearing.add(`${u + 2},${v + i}`);
        clearing.add(`${u + i},${v + 2}`);
      }
    // Water: a little pond under the bridge plot.
    const water = new Set();
    {
      const [bu, bv] = plots.bridge;
      for (let du = -1; du <= 2; du++) for (let dv = 0; dv <= 1; dv++) water.add(`${bu + du},${bv + dv}`);
      for (const w of water) taken.add(w);
    }
    // The stone path: from the front corner towards the campfire, one tile per lesson.
    const path = [];
    {
      const [cu, cv] = plots.campfire;
      let u = N - 1;
      let v = N - 1;
      let i = 0;
      while (path.length < Math.min(stones, N * 3) && i < 400) {
        i++;
        const key = `${u},${v}`;
        if (!taken.has(key)) {
          path.push([u, v]);
          taken.add(key);
        }
        const toward = rand(i + 77) < 0.5 ? 'u' : 'v';
        if (u > cu + 2 && (toward === 'u' || v <= cv + 2)) u--;
        else if (v > cv + 2) v--;
        else {
          // past the campfire: wind on around the island
          if (u > 1 && rand(i) < 0.5) u--;
          else if (v > 1) v--;
          else break;
        }
      }
    }
    // Milestone landmarks: on tiles beside the stone path (or near the campfire).
    const pathSet = new Set(path.map(([u, v]) => `${u},${v}`));
    const landmarkTiles = [];
    {
      const want = (world.landmarks ?? []).length;
      const near = [];
      for (let u = 0; u < N; u++)
        for (let v = 0; v < N; v++) {
          const key = `${u},${v}`;
          if (taken.has(key) || clearing.has(key)) continue;
          const byPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([du, dv]) => pathSet.has(`${u + du},${v + dv}`));
          const [cu, cv] = plots.campfire;
          near.push({ u, v, score: (byPath ? 0 : 6) + Math.hypot(u - cu - 1, v - cv - 1) * 0.3 + rand(u * 7 + v) });
        }
      near.sort((a, b) => a.score - b.score);
      for (const t of near.slice(0, want)) {
        landmarkTiles.push([t.u, t.v]);
        taken.add(`${t.u},${t.v}`);
      }
    }

    // Tree tiles: from the middle outwards, in a stable shuffled order.
    const free = [];
    for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) if (!taken.has(`${u},${v}`) && !clearing.has(`${u},${v}`)) free.push([u, v]);
    const c = (N - 1) / 2;
    free.sort((a, b) => Math.hypot(a[0] - c, a[1] - c) + rand(a[0] * 97 + a[1]) * 3 - (Math.hypot(b[0] - c, b[1] - c) + rand(b[0] * 97 + b[1]) * 3));
    const shown = trees.slice(-free.length);
    const objects = [];
    shown.forEach((tr, i) => {
      const [u, v] = free[i];
      const [x, y] = P(u + 0.5, v + 0.5);
      const size = 0.85 + (Math.min(90, tr.minutes) / 90) * 0.35;
      objects.push({ kind: 'tree', depth: u + v + 1, x, y, s: k * size, tr, variant: tr.id % VARIANTS });
    });
    // Decorations on some of the leftover tiles.
    const decoKinds = sea === 'spring' ? ['flowers', 'flowers', 'bush', 'grass', 'rock'] : sea === 'summer' ? ['bush', 'grass', 'flowers', 'rock'] : sea === 'autumn' ? ['mushroom', 'bush', 'grass', 'rock'] : ['rock', 'bush', 'snowman', 'grass'];
    free.slice(shown.length).forEach(([u, v], i) => {
      if (rand(u * 31 + v * 17) > 0.28) return;
      const [x, y] = P(u + 0.5, v + 0.5);
      objects.push({ kind: 'deco', depth: u + v + 1, x, y, s: k, deco: decoKinds[Math.floor(rand(u * 7 + v * 13) * decoKinds.length)], seed: u * 11 + v + i });
    });
    // Buildings.
    const done = new Set((world.buildings ?? []).map((b) => b.id));
    (stages ?? []).forEach((st, i) => {
      const id = st.building.id;
      if (!PLOTS[id]) return;
      const [u, v] = plots[id];
      if (done.has(id)) objects.push({ kind: 'building', id, depth: u + v + 2.5, u, v, label: `${st.building.name}: Stage ${i}, ${st.title}, finished` });
      else if (i === world.stage) objects.push({ kind: 'building', id, depth: u + v + 2.5, u, v, ghost: true, label: `Next: ${st.building.name} (finish Stage ${i}: ${st.title})` });
    });
    (world.landmarks ?? []).forEach((lm, i) => {
      const t = landmarkTiles[i];
      if (!t) return;
      objects.push({ kind: 'landmark', depth: t[0] + t[1] + 1, u: t[0], v: t[1], lm });
    });
    // Easels around the campfire.
    const [fu, fv] = plots.campfire;
    (world.gallery ?? []).slice(0, 12).forEach((round, i) => {
      const a = (i / 12) * Math.PI * 2;
      const u = fu + 1 + Math.cos(a) * 1.6;
      const v = fv + 1 + Math.sin(a) * 1.6;
      const [x, y] = P(u, v);
      objects.push({ kind: 'easel', depth: u + v, x, y, s: k, round });
    });
    // Lanterns along the two front edges.
    const lanterns = Math.min(world.lanterns ?? 0, N * 2 - 2);
    for (let i = 0; i < lanterns; i++) {
      const along = Math.floor(i / 2) + 0.5;
      const [u, v] = i % 2 ? [along + 0.5, N - 0.08] : [N - 0.08, along + 0.5];
      const [x, y] = P(u, v);
      objects.push({ kind: 'lantern', depth: u + v, x, y, s: k });
    }
    objects.sort((a, b) => a.depth - b.depth);
    const height = oy + N * A + 60 * k + 70;
    return { N, A, P, k, ox, oy, objects, water, path: new Set(path.map(([u, v]) => `${u},${v}`)), plots, height };
  }, [world, stages, sea]);

  // New data: draw live again, then (if big) turn it into a picture.
  useEffect(() => {
    setRaster((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }, [scene]);
  useEffect(() => {
    if (raster || !scene || scene.objects.length < RASTER_AT || !islandRef.current) return undefined;
    const id = requestAnimationFrame(() => {
      try {
        const svg = new XMLSerializer().serializeToString(islandRef.current);
        setRaster(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
      } catch {
        // keep the live SVG
      }
    });
    return () => cancelAnimationFrame(id);
  }, [scene, raster]);

  if (!scene) return <div className="world" style={{ aspectRatio: '1200 / 760' }} />;
  const { N, A, P, k, objects, water, path, height } = scene;
  const H = Math.max(640, height);
  const grass = GRASS[sea].map(t);
  const soil = [t('#9a6a45'), t('#7d5537'), t('#5e3f2a')];
  const D = 34 * k + 14; // island thickness

  const tiles = [];
  for (let u = 0; u < N; u++)
    for (let v = 0; v < N; v++) {
      const key = `${u},${v}`;
      const pts = [P(u, v), P(u + 1, v), P(u + 1, v + 1), P(u, v + 1)];
      let fill = (u + v) % 2 ? grass[0] : grass[1];
      if (water.has(key)) fill = t(night ? '#3c5c9a' : '#5fb0e8');
      else if (path.has(key)) fill = t(sea === 'winter' ? '#dfe3ea' : '#d9cdb5');
      tiles.push(<path key={key} d={`M${pts.map((p) => p.join(' ')).join(' L')} Z`} fill={fill} />);
      if (path.has(key)) {
        const [x, y] = P(u + 0.5, v + 0.5);
        tiles.push(<ellipse key={`s${key}`} cx={x - 3 * k} cy={y - 1 * k} rx={7 * k} ry={3.5 * k} fill={t('#b3a68c')} />, <ellipse key={`s2${key}`} cx={x + 6 * k} cy={y + 3 * k} rx={5 * k} ry={2.5 * k} fill={t('#bfb39a')} />);
      }
      if (water.has(key)) {
        const [x, y] = P(u + 0.5, v + 0.5);
        tiles.push(<path key={`w${key}`} d={`M${x - 6 * k} ${y} h${5 * k} M${x + 2 * k} ${y + 3 * k} h${4 * k}`} stroke="#ffffff" strokeWidth={1.4 * k} strokeLinecap="round" />);
      }
    }
  // Island sides with a grass lip and soil layers.
  const left = [P(0, N), P(N, N)];
  const right = [P(N, N), P(N, 0)];
  const side = (a, b, fills) =>
    fills.map((f, i) => {
      const z0 = (i / fills.length) * D;
      const z1 = ((i + 1) / fills.length) * D;
      return <path key={`${f}${i}`} d={`M${a[0]} ${a[1] + z0} L${b[0]} ${b[1] + z0} L${b[0]} ${b[1] + z1} L${a[0]} ${a[1] + z1} Z`} fill={f} />;
    });


  // What's on each tile, for the hover tooltip (works on the picture too).
  const onTile = new Map();
  for (const o of objects) {
    if (o.kind === 'tree') {
      const label = `${TREE_INFO[o.tr.tree]?.name ?? 'Tree'} · ${o.tr.minutes} min · ${new Date(o.tr.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      const u = Math.round((o.x - scene.ox) / A / 2 + (o.y - scene.oy) / A - 0.5);
      const v = Math.round((o.y - scene.oy) / A - (o.x - scene.ox) / A / 2 - 0.5);
      onTile.set(`${u},${v}`, label);
    } else if (o.kind === 'building') {
      for (const [du, dv] of [[0, 0], [1, 0], [0, 1], [1, 1]]) onTile.set(`${o.u + du},${o.v + dv}`, o.label);
    } else if (o.kind === 'landmark') onTile.set(`${o.u},${o.v}`, o.lm.label);
  }
  const hover = (e) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const a = (x - scene.ox) / A;
    const b = (2 * (y - scene.oy)) / A;
    const u = Math.floor((a + b) / 2);
    const v = Math.floor((b - a) / 2);
    // Trees and buildings rise above their tile: prefer what stands in front.
    let label = null;
    for (let i = 3; i >= 0 && !label; i--) label = onTile.get(`${u + i},${v + i}`) ?? onTile.get(`${u + i},${v + i - 1}`) ?? null;
    if (label) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: label });
    else setTip(null);
  };

  const label = `Your valley: ${world.trees.length} trees, ${world.stones} lessons on the path, ${world.buildings.length} buildings, ${world.lanterns} lanterns`;
  const islandSvg = (
    <svg ref={islandRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="world-layer" aria-hidden="true">
      <defs>
        <radialGradient id="glow">
          <stop offset="0" stopColor="#ffe08a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={W / 2} cy={P(N, N)[1] + D + 40} rx={N * A * 0.9} ry={30} fill="#1d2b3a" opacity="0.12" />
      {side(left[0], left[1], [t(mix(grass[0], '#1d2b3a', 0.2)), ...soil.map((s) => mix(s, '#ffffff', 0.08))])}
      {side(right[0], right[1], [t(mix(grass[0], '#1d2b3a', 0.35)), ...soil.map((s) => mix(s, '#1d2b3a', 0.22))])}
      {tiles}
        {objects.map((o, i) => {
          if (o.kind === 'tree')
            return (
              <Tree
                key={`t${o.tr.id}`}
                type={o.tr.tree}
                variant={o.variant}
                season={sea}
                x={o.x}
                y={o.y}
                scale={o.s}

              />
            );
          if (o.kind === 'deco') return <Decoration key={`d${i}`} kind={o.deco} x={o.x} y={o.y} s={o.s} sea={sea} seed={o.seed} />;
          if (o.kind === 'building') {
            const [bx, by] = P(o.u, o.v);
            const I = makeIso(A, bx, by);
            return (
              <g key={`b${o.id}`} opacity={o.ghost ? 0.3 : 1}>
                <title>{o.label}</title>
                {BUILDINGS[o.id](I, { night: night || time === 'dusk' })}
              </g>
            );
          }
          if (o.kind === 'landmark') {
            const [lx, ly] = P(o.u, o.v);
            const draw = LANDMARKS[o.lm.kind];
            if (!draw) return null;
            return (
              <g key={`m${i}`}>
                <title>{o.lm.label}</title>
                {draw(makeIso(A, lx, ly), { night: night || time === 'dusk', tier: o.lm.tier })}
              </g>
            );
          }
          if (o.kind === 'easel')
            return (
              <g key={`e${i}`} transform={`translate(${o.x} ${o.y}) scale(${o.s})`}>
                <title>{`Skill check #${o.round}`}</title>
                <path d="M-5 0 L0 -16 L5 0 M0 -16 V0" stroke="#7e5436" strokeWidth="1.4" fill="none" />
                <rect x="-6" y="-17" width="12" height="9" fill="#fbf7ef" stroke="#7e5436" strokeWidth="0.8" />
              </g>
            );
          if (o.kind === 'lantern')
            return (
              <g key={`l${i}`} transform={`translate(${o.x} ${o.y}) scale(${o.s})`}>
                <title>Lantern: a week you met your target</title>
                {(night || time === 'dusk') && <circle cy="-16" r="16" fill="url(#glow)" />}
                <path d="M0 0 V-12" stroke="#4a3b2c" strokeWidth="1.4" />
                <rect x="-3" y="-20" width="6" height="8" rx="1.5" fill="#ffcf5a" />
                <rect x="0" y="-20" width="3" height="8" fill="#e8a23a" />
              </g>
            );
          return null;
        })}
    </svg>
  );

  return (
    <div className="world" ref={box} onPointerMove={hover} onPointerLeave={() => setTip(null)}>
      {/* Layer 1: sky (its own small animations) */}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky[0]} />
            <stop offset="0.4" stopColor={sky[1]} />
            <stop offset="0.75" stopColor={sky[2]} />
            <stop offset="1" stopColor={sky[3]} />
          </linearGradient>
          <radialGradient id="sunglow">
            <stop offset="0" stopColor={night ? '#dfe6ff' : '#fff6d8'} stopOpacity={night ? 0.35 : 0.8} />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#sky)" />
        {(night || time === 'dusk') &&
          Array.from({ length: night ? 90 : 25 }, (_, i) => (
            <circle key={i} className={i % 3 === 0 ? 'w-twinkle' : undefined} style={{ animationDelay: `${-rand(i) * 4}s` }} cx={rand(i + 1) * W} cy={rand(i + 2) * H * 0.45} r={rand(i + 3) * 1.2 + 0.5} fill="#ffffff" opacity={0.4 + rand(i + 4) * 0.5} />
          ))}
        <circle cx={night ? 1010 : 980} cy={95} r={night ? 110 : 190} fill="url(#sunglow)" />
        {night ? (
          <g>
            <circle cx={1010} cy={95} r="24" fill="#f6f1dc" />
            <circle cx={1019} cy={90} r="21" fill={sky[1]} />
          </g>
        ) : (
          <circle cx={980} cy={95} r="30" fill={time === 'day' ? '#fffbe8' : '#ffe1b0'} />
        )}
        <Cloud x={170} y={110} s={1} colours={CLOUD[time]} dur={70} delay={0} />
        <Cloud x={760} y={70} s={0.7} colours={CLOUD[time]} dur={90} delay={-30} />
        <Cloud x={1080} y={230} s={0.6} colours={CLOUD[time]} dur={100} delay={-50} />
        <Cloud x={90} y={H - 150} s={0.8} colours={CLOUD[time]} dur={80} delay={-12} />
      </svg>
      {/* Layer 2: the island, static; turned into one picture when it gets big */}
      {raster ? <img className="world-layer" src={raster} alt="" /> : islandSvg}
      {/* Layer 3: falling petals, leaves, snow and fireflies */}
      <svg viewBox={`0 0 ${W} ${H}`} className="world-layer" aria-hidden="true">
        <defs>
          <radialGradient id="glow-p">
            <stop offset="0" stopColor="#ffe08a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <Particles sea={sea} night={night} h={H} />
      </svg>
      {tip && (
        <div className="world-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
