import { useRef, useState } from 'react';

// Charts for Progress. Colours come from CSS tokens (paper and night themes are
// validated separately): sequential sage ramp for minutes, ink blue and
// terracotta for "now" vs "then". Text always uses ink colours. Every chart has
// a hover tooltip and a text alternative.

function useTip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const on = (text) => ({
    onPointerEnter: (e) => move(e, text),
    onPointerMove: (e) => move(e, text),
    onPointerLeave: () => setTip(null),
  });
  const move = (e, text) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text });
  };
  const el = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  ) : null;
  return { ref, on, el };
}

const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

// A year of days: minutes drawn per day, 53 weeks x 7 days.
export function Heatmap({ days, dayMinutes = 60 }) {
  const t = useTip();
  const cell = 12;
  const gap = 3;
  const step = cell + gap;
  const level = (m) => (m <= 0 ? 0 : m < dayMinutes / 2 ? 1 : m < dayMinutes ? 2 : m < dayMinutes * 1.5 ? 3 : 4);
  const cols = Math.ceil(days.length / 7);
  const months = [];
  days.forEach((d, i) => {
    // A label on the 1st of each month (the first column only if the next month is far enough away).
    if (d.day.endsWith('-01') || (i === 0 && Number(d.day.slice(8)) <= 14)) months.push({ col: Math.floor(i / 7), label: new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }) });
  });
  const w = 28 + cols * step;
  const h = 20 + 7 * step;
  return (
    <div className="chart" ref={t.ref}>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ minWidth: 640 }} role="img" aria-label={`Minutes drawn per day over the last year. ${days.filter((d) => d.minutes > 0).length} days with drawing.`}>
          {months.map((m, i) => (
            <text key={i} x={28 + m.col * step} y="11" fontSize="10" fill="var(--muted)">
              {m.label}
            </text>
          ))}
          {['Mon', 'Wed', 'Fri'].map((l, i) => (
            <text key={l} x="0" y={20 + (i * 2) * step + cell - 2} fontSize="10" fill="var(--muted)">
              {l}
            </text>
          ))}
          {days.map((d, i) => (
            <rect
              key={d.day}
              x={28 + Math.floor(i / 7) * step}
              y={20 + (i % 7) * step}
              width={cell}
              height={cell}
              rx="3"
              style={{ fill: `var(--heat-${level(d.minutes)})` }}
              {...t.on(`${dayLabel(d.day)}: ${d.minutes ? `${d.minutes} min` : 'no drawing'}`)}
            />
          ))}
        </svg>
      </div>
      <div className="row tiny muted" style={{ justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} style={{ width: 12, height: 12, borderRadius: 3, background: `var(--heat-${l})`, display: 'inline-block' }} />
        ))}
        More · darkest = 1.5× your {dayMinutes}-minute day
      </div>
      {t.el}
    </div>
  );
}

// Weekly minutes as bars, with the weekly target as a dashed line.
export function WeekBars({ weeks, target }) {
  const t = useTip();
  const list = weeks.slice(-16);
  const W = 640;
  const H = 200;
  const pad = { l: 36, r: 8, t: 12, b: 26 };
  const max = Math.max(target * 1.2, ...list.map((w) => w.minutes), 60);
  const bw = Math.min(44, (W - pad.l - pad.r) / Math.max(1, list.length));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2 / 30) * 30, Math.round(max / 30) * 30].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="chart" ref={t.ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Minutes per week for the last ${list.length} weeks against a target of ${target} minutes.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={pad.l - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="var(--muted)">
              {v >= 60 ? `${Math.round(v / 6) / 10}h` : v}
            </text>
          </g>
        ))}
        {list.map((w, i) => {
          const x = pad.l + i * bw + 3;
          const top = y(w.minutes);
          const bh = Math.max(0, H - pad.b - top);
          return (
            <g key={w.week} {...t.on(`Week of ${shortDate(w.week)}: ${w.minutes} min, ${w.daysHit} target days${w.grace ? ` + ${w.grace} grace` : ''}${w.met ? ' · target met' : w.current ? ' · in progress' : ''}`)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <path d={bh > 4 ? `M${x} ${H - pad.b} V${top + 4} q0 -4 4 -4 H${x + bw - 10} q4 0 4 4 V${H - pad.b} Z` : `M${x} ${H - pad.b} h${bw - 6} v${-bh} h${-(bw - 6)} Z`} style={{ fill: w.current ? 'var(--heat-2)' : 'var(--heat-3)' }} />
              {w.met && (
                <text x={x + (bw - 6) / 2} y={top - 5} fontSize="11" textAnchor="middle">
                  🏮
                </text>
              )}
              {i % 2 === 0 && (
                <text x={x + (bw - 6) / 2} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--muted)">
                  {shortDate(w.week)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--ink-2)" strokeDasharray="5 4" strokeWidth="1.5" />
        <text x={W - pad.r} y={y(target) - 5} fontSize="10" textAnchor="end" fill="var(--ink-2)">
          target {Math.round(target / 6) / 10}h
        </text>
      </svg>
      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
        🏮 = target met (you get a lantern). The lighter bar is this week, still in progress.
      </p>
      {t.el}
    </div>
  );
}

// Skill radar: now vs earlier, 1-5 on each area.
export function Radar({ areas, now, then, thenLabel = '3 months ago' }) {
  const t = useTip();
  const R = 120;
  const n = areas.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const r = (Math.max(0, v ?? 0) / 5) * R;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const poly = (vals) =>
    areas
      .map((a, i) => pt(i, vals?.[a.id] ?? 0))
      .map((p) => p.join(','))
      .join(' ');
  const has = (vals) => vals && areas.some((a) => vals[a.id] != null);
  return (
    <div className="chart" ref={t.ref}>
      <svg viewBox="-190 -160 380 320" role="img" aria-label={`Skill scores per area, 1 to 5. ${areas.map((a) => `${a.name}: ${now?.[a.id] ?? 'no data'}`).join(', ')}.`}>
        {[1, 2, 3, 4, 5].map((lv) => (
          <polygon key={lv} points={areas.map((a, i) => pt(i, lv).join(',')).join(' ')} fill="none" stroke="var(--line)" />
        ))}
        {areas.map((a, i) => {
          const [x, y] = pt(i, 5);
          const [lx, ly] = pt(i, 6.1);
          return (
            <g key={a.id}>
              <line x1="0" y1="0" x2={x} y2={y} stroke="var(--line)" />
              <text x={lx} y={ly + 4} fontSize="11" textAnchor={Math.abs(lx) < 10 ? 'middle' : lx > 0 ? 'start' : 'end'} fill="var(--ink-2)">
                {a.name}
              </text>
            </g>
          );
        })}
        {has(then) && <polygon points={poly(then)} style={{ fill: 'var(--series-2)', stroke: 'var(--series-2)' }} fillOpacity="0.12" strokeWidth="2" strokeDasharray="5 4" />}
        {has(now) && <polygon points={poly(now)} style={{ fill: 'var(--series-1)', stroke: 'var(--series-1)' }} fillOpacity="0.16" strokeWidth="2" />}
        {areas.map((a, i) => {
          const v = now?.[a.id];
          if (v == null) return null;
          const [x, y] = pt(i, v);
          return (
            <g key={a.id} {...t.on(`${a.name}: ${v} now${then?.[a.id] != null ? ` · ${then[a.id]} ${thenLabel}` : ''}`)}>
              <circle cx={x} cy={y} r="12" fill="transparent" />
              <circle cx={x} cy={y} r="4.5" style={{ fill: 'var(--series-1)' }} stroke="var(--card)" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      <div className="legend" style={{ justifyContent: 'center' }}>
        <span style={{ '--c': 'var(--series-1)' }}>Last 60 days</span>
        {has(then) && <span style={{ '--c': 'var(--series-2)' }}>{thenLabel}</span>}
      </div>
      {t.el}
    </div>
  );
}

// One small line chart per area: monthly score 1-5.
export function Trends({ areas, history }) {
  const t = useTip();
  const W = 200;
  const H = 70;
  const months = history.map((h) => h.month);
  return (
    <div className="chart" ref={t.ref}>
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        {areas.map((a) => {
          const pts = history.map((h, i) => ({ i, v: h.scores[a.id], m: h.month })).filter((p) => p.v != null);
          const x = (i) => 6 + (months.length > 1 ? (i / (months.length - 1)) * (W - 12) : (W - 12) / 2);
          const y = (v) => 6 + (H - 12) * (1 - (v - 1) / 4);
          const last = pts[pts.length - 1];
          const first = pts[0];
          return (
            <div key={a.id} className="tile" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong className="small">{a.name}</strong>
                <span className="small muted">
                  {last ? last.v.toFixed(1) : '–'}
                  {first && last && pts.length > 1 ? ` (${last.v - first.v >= 0 ? '+' : ''}${(last.v - first.v).toFixed(1)})` : ''}
                </span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} aria-label={`${a.name} by month: ${pts.map((p) => `${p.m} ${p.v}`).join(', ') || 'no scores yet'}`}>
                <line x1="6" x2={W - 6} y1={y(3)} y2={y(3)} stroke="var(--line)" strokeDasharray="3 3" />
                {pts.length > 1 && <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" style={{ stroke: 'var(--series-1)' }} strokeWidth="2" strokeLinejoin="round" />}
                {pts.map((p) => (
                  <g key={p.i} {...t.on(`${a.name}, ${p.m}: ${p.v}`)}>
                    <circle cx={x(p.i)} cy={y(p.v)} r="9" fill="transparent" />
                    <circle cx={x(p.i)} cy={y(p.v)} r="4" style={{ fill: 'var(--series-1)' }} stroke="var(--card)" strokeWidth="1.5" />
                  </g>
                ))}
                {!pts.length && (
                  <text x={W / 2} y={H / 2 + 4} fontSize="11" textAnchor="middle" fill="var(--muted)">
                    no scores yet
                  </text>
                )}
              </svg>
            </div>
          );
        })}
      </div>
      {t.el}
    </div>
  );
}

// Growth rings: one ring per month since you started, thicker = more minutes.
export function Rings({ days }) {
  const t = useTip();
  const byMonth = new Map();
  for (const d of days) byMonth.set(d.day.slice(0, 7), (byMonth.get(d.day.slice(0, 7)) ?? 0) + d.minutes);
  // Trim leading empty months.
  const months = [...byMonth].filter((_, i, a) => a.slice(0, i + 1).some(([, m]) => m > 0));
  const max = Math.max(1, ...months.map(([, m]) => m));
  let r = 10;
  const rings = months.map(([month, m]) => {
    const w = 3 + (m / max) * 12;
    const ring = { month, m, r: r + w / 2, w };
    r += w + 1.5;
    return ring;
  });
  // Room for about 3 years of rings, so a young tree stays small.
  const size = Math.max(140, r + 6);
  const lv = (m) => (m <= 0 ? 0 : 1 + Math.min(3, Math.floor((m / max) * 3.999)));
  return (
    <div className="chart" ref={t.ref} style={{ maxWidth: 320, margin: '0 auto' }}>
      <svg viewBox={`${-size} ${-size} ${size * 2} ${size * 2}`} role="img" aria-label={`Growth rings, one per month: ${months.map(([mo, m]) => `${mo} ${m} min`).join(', ')}`}>
        <circle r="10" style={{ fill: 'var(--heat-4)' }} />
        {rings.map((g) => (
          <g key={g.month} {...t.on(`${new Date(`${g.month}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}: ${Math.round(g.m / 6) / 10} h`)}>
            <circle r={g.r} fill="none" style={{ stroke: `var(--heat-${lv(g.m)})` }} strokeWidth={g.w} />
          </g>
        ))}
      </svg>
      <p className="tiny muted center" style={{ margin: 0 }}>
        One ring per month from the centre out; thicker and darker = more drawing.
      </p>
      {t.el}
    </div>
  );
}

// When you draw: minutes by hour of day.
export function HourBars({ hours }) {
  const t = useTip();
  const max = Math.max(1, ...hours);
  const W = 480;
  const H = 90;
  const bw = W / 24;
  return (
    <div className="chart" ref={t.ref}>
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Focus minutes by hour of the day">
        {hours.map((m, h) => {
          const bh = (m / max) * H;
          return (
            <g key={h} {...t.on(`${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00: ${m} min`)}>
              <rect x={h * bw} y="0" width={bw} height={H} fill="transparent" />
              <rect x={h * bw + 2} y={H - bh} width={bw - 4} height={bh} rx="3" style={{ fill: 'var(--heat-3)' }} />
              {h % 3 === 0 && (
                <text x={h * bw + bw / 2} y={H + 13} fontSize="10" textAnchor="middle" fill="var(--muted)">
                  {h}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {t.el}
    </div>
  );
}
