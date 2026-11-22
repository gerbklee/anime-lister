import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { SHIP_STATUS, VOTES } from '../util.js';

const STATUS_COLORS = { canon: '#e8b024', fanon: '#9b7bff', crack: '#2eba78' };
const R = 22; // node radius

// Simple force-directed layout (run once, synchronously; fine for a few hundred nodes).
function layout(nodes, edges) {
  const n = nodes.length;
  const pos = nodes.map((_, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const r = 60 + 14 * Math.sqrt(n) * (1 + (i % 3) * 0.15);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 };
  });
  const index = new Map(nodes.map((nd, i) => [nd.id, i]));
  const links = edges.map((e) => [index.get(e.a), index.get(e.b)]).filter(([a, b]) => a != null && b != null);
  for (let step = 0; step < 320; step++) {
    const cool = 1 - step / 320;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 1;
        }
        const f = 5200 / d2;
        const d = Math.sqrt(d2);
        pos[i].vx += (dx / d) * f;
        pos[i].vy += (dy / d) * f;
        pos[j].vx -= (dx / d) * f;
        pos[j].vy -= (dy / d) * f;
      }
    }
    for (const [a, b] of links) {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 110) * 0.04;
      pos[a].vx += (dx / d) * f;
      pos[a].vy += (dy / d) * f;
      pos[b].vx -= (dx / d) * f;
      pos[b].vy -= (dy / d) * f;
    }
    for (const p of pos) {
      p.vx -= p.x * 0.012;
      p.vy -= p.y * 0.012;
      p.x += Math.max(-30, Math.min(30, p.vx)) * cool;
      p.y += Math.max(-30, Math.min(30, p.vy)) * cool;
      p.vx *= 0.5;
      p.vy *= 0.5;
    }
  }
  return new Map(nodes.map((nd, i) => [nd.id, pos[i]]));
}

export default function ShipMap() {
  const { navigate } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [series, setSeries] = useState('');
  const [onlyBoth, setOnlyBoth] = useState(false);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const moved = useRef(false);

  useEffect(() => {
    api
      .shipMap()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const allSeries = useMemo(() => [...new Set((data?.nodes ?? []).map((n) => n.series).filter(Boolean))].sort(), [data]);

  const { nodes, edges, pos, bounds } = useMemo(() => {
    if (!data) return { nodes: [], edges: [], pos: new Map(), bounds: null };
    const keepNode = new Map(data.nodes.map((n) => [n.id, n]));
    let es = data.edges.filter((e) => (!onlyBoth || e.everyone) && keepNode.has(e.a) && keepNode.has(e.b));
    if (series) es = es.filter((e) => keepNode.get(e.a).series === series || keepNode.get(e.b).series === series);
    const used = new Set(es.flatMap((e) => [e.a, e.b]));
    const ns = data.nodes.filter((n) => used.has(n.id));
    const p = layout(ns, es);
    const xs = [...p.values()].map((v) => v.x);
    const ys = [...p.values()].map((v) => v.y);
    const b = xs.length ? { minX: Math.min(...xs) - 70, maxX: Math.max(...xs) + 70, minY: Math.min(...ys) - 70, maxY: Math.max(...ys) + 70 } : null;
    return { nodes: ns, edges: es, pos: p, bounds: b };
  }, [data, series, onlyBoth]);

  useEffect(() => {
    setView({ x: 0, y: 0, k: 1 });
    setSelected(null);
  }, [series, onlyBoth]);

  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // The pointer is only captured once a drag starts, so plain taps still reach
  // the character or line under the finger.
  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, local(e));
    moved.current = false;
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      if (!moved.current && Math.abs(now.x - prev.x) + Math.abs(now.y - prev.y) <= 2) return;
      if (!moved.current) svgRef.current.setPointerCapture(e.pointerId);
      moved.current = true;
      setView((v) => ({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y }));
    } else if (pts.length === 2) {
      moved.current = true;
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch.current) {
        const f = dist / pinch.current.dist;
        setView((v) => {
          const k = Math.min(4, Math.max(0.3, v.k * f));
          const kk = k / v.k;
          return { k, x: mid.x - (mid.x - v.x) * kk, y: mid.y - (mid.y - v.y) * kk };
        });
      }
      pinch.current = { dist };
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };
  const zoom = (f, cx, cy) =>
    setView((v) => {
      const r = svgRef.current.getBoundingClientRect();
      const px = cx ?? r.width / 2;
      const py = cy ?? r.height / 2;
      const k = Math.min(4, Math.max(0.3, v.k * f));
      const kk = k / v.k;
      return { k, x: px - (px - v.x) * kk, y: py - (py - v.y) * kk };
    });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const p = local(e);
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const sel = selected ? nodes.find((n) => n.id === selected) : null;
  const selEdges = sel ? edges.filter((e) => e.a === sel.id || e.b === sel.id) : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <section className="ship-map">
      <div className="list-header">
        <a href="#/ships" className="back-link">
          ← Ship board
        </a>
      </div>
      <h2 className="list-name">🕸️ Ship map</h2>
      <div className="map-filters">
        {allSeries.length > 1 && (
          <select value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Series">
            <option value="">All series</option>
            {allSeries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <label className="check small">
          <input type="checkbox" checked={onlyBoth} onChange={(e) => setOnlyBoth(e.target.checked)} /> Only ships we all voted on
        </label>
      </div>
      {error && <div className="banner error">{error}</div>}
      {!data ? (
        <p className="muted">Drawing the map…</p>
      ) : !nodes.length ? (
        <p className="muted">No ships to show{series || onlyBoth ? ' with these filters' : ' yet'}.</p>
      ) : (
        <div className="map-wrap card">
          <svg
            ref={svgRef}
            className="map-svg"
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => e.target === svgRef.current && !moved.current && setSelected(null)}
          >
            <defs>
              {nodes.map((n) => (
                <clipPath key={n.id} id={`clip-${n.id}`}>
                  <circle cx={pos.get(n.id).x} cy={pos.get(n.id).y} r={R} />
                </clipPath>
              ))}
            </defs>
            <g style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0' }}>
              {edges.map((e, i) => {
                const a = pos.get(e.a);
                const b = pos.get(e.b);
                const dim = sel && !(e.a === sel.id || e.b === sel.id);
                return (
                  <g key={`${e.shipId}-${i}`} className={`map-edge ${dim ? 'dim' : ''}`} onClick={() => !moved.current && navigate(`#/ship/${e.shipId}`)}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="edge-hit" />
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={e.war ? '#ff5a6e' : STATUS_COLORS[e.status] ?? '#999'}
                      strokeWidth={e.avg == null ? 1.5 : 1.5 + e.avg * 1.4}
                      strokeDasharray={e.war ? '7 5' : e.avg == null ? '3 4' : e.poly ? '10 3' : undefined}
                      strokeLinecap="round"
                      opacity={e.avg != null && e.avg < 1 ? 0.45 : 0.9}
                    >
                      <title>{`${e.name}${e.avg != null ? ` · avg ${VOTES[Math.round(e.avg)].emoji}` : ''}${e.war ? ' · ⚔️ ship war' : ''}`}</title>
                    </line>
                  </g>
                );
              })}
              {nodes.map((n) => {
                const p = pos.get(n.id);
                const dim = sel && sel.id !== n.id && !selEdges.some((e) => e.a === n.id || e.b === n.id);
                return (
                  <g key={n.id} className={`map-node ${dim ? 'dim' : ''} ${sel?.id === n.id ? 'active' : ''}`} onClick={() => !moved.current && setSelected(n.id)}>
                    <circle cx={p.x} cy={p.y} r={R + 3} className="node-ring" />
                    {n.image ? (
                      <image href={n.image} x={p.x - R} y={p.y - R} width={R * 2} height={R * 2} preserveAspectRatio="xMidYMin slice" clipPath={`url(#clip-${n.id})`} />
                    ) : (
                      <circle cx={p.x} cy={p.y} r={R} fill="#555" />
                    )}
                    <text x={p.x} y={p.y + R + 14} textAnchor="middle" className="node-label">
                      {n.name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="map-zoom">
            <button type="button" className="icon-btn bordered" onClick={() => zoom(1.25)} aria-label="Zoom in">
              +
            </button>
            <button type="button" className="icon-btn bordered" onClick={() => zoom(0.8)} aria-label="Zoom out">
              −
            </button>
            <button type="button" className="icon-btn bordered" onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="Reset view">
              ⤢
            </button>
          </div>
        </div>
      )}

      <div className="map-legend muted tiny">
        {Object.entries(SHIP_STATUS).map(([k, s]) => (
          <span key={k}>
            <i style={{ background: STATUS_COLORS[k] }} /> {s.label}
          </span>
        ))}
        <span>
          <i className="war" /> Ship war
        </span>
        <span>thicker = shipped harder · tap a line to open the ship</span>
      </div>

      {sel && (
        <div className="card map-panel">
          <div className="map-panel-head">
            {sel.image && <img src={sel.image} alt="" referrerPolicy="no-referrer" />}
            <div>
              <b>{sel.name}</b>
              <div className="muted tiny">
                {sel.series} · {selEdges.length} {selEdges.length === 1 ? 'ship' : 'ships'}
              </div>
            </div>
            <a className="btn ghost small-btn" href={`#/character/${sel.id}`}>
              Character →
            </a>
          </div>
          <ul className="map-panel-ships">
            {selEdges.map((e, i) => {
              const other = nodeById.get(e.a === sel.id ? e.b : e.a);
              return (
                <li key={`${e.shipId}-${i}`}>
                  <a href={`#/ship/${e.shipId}`}>
                    <b>{e.name}</b> <span className="muted small">with {other?.name}</span>
                  </a>
                  <span className="small">
                    {e.avg != null ? `${VOTES[Math.round(e.avg)].emoji} avg` : 'no votes'}
                    {e.war ? ' · ⚔️' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
