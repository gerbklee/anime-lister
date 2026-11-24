import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { GOAL, rankName } from '../components/ranks.js';

const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonth = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

// One skill's level as a bar: whole levels, the progress inside the current
// one, and a line at the goal.
function LevelBar({ level, progress = 0 }) {
  return (
    <span className="level-bar big" aria-hidden="true">
      <span style={{ width: `${Math.min(100, (level + (level ? progress : 0)) * 10)}%` }} />
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className="tick" style={{ left: `${(i + 1) * 10}%` }} />
      ))}
      <i className="goal" style={{ left: `${GOAL * 10}%` }} />
    </span>
  );
}

function Sheet({ data }) {
  const { overall, areas } = data;
  const sorted = [...areas].sort((a, b) => (b.core ? 1 : 0) - (a.core ? 1 : 0));
  return (
    <section className="section">
      <div className="card char-card">
        <div className="char-level" aria-hidden="true">
          <span>Lv</span>
          <strong>{overall.level || '–'}</strong>
        </div>
        <div style={{ flex: 1 }}>
          <div className="kicker">Your title</div>
          <h2 style={{ margin: '2px 0 6px' }}>{overall.level ? rankName(overall.level) : 'Unranked'}</h2>
          <p className="small" style={{ margin: 0 }}>
            {overall.heldBackBy ? (
              <>
                Held back by <strong>{overall.heldBackBy.name}</strong>: your title is your weakest proven core skill, because industry work needs all of them at once.
              </>
            ) : (
              'Your title appears once a core skill is proven: two drawings assessed at a level by a critique or portfolio review.'
            )}
          </p>
          {overall.unproven.length > 0 && <p className="tiny muted" style={{ margin: '6px 0 0' }}>Not proven yet: {overall.unproven.map((u) => u.name).join(', ')}.</p>}
          <div style={{ marginTop: 10 }}>
            <LevelBar level={overall.level} />
            <span className="tiny muted">
              Goal: Lv {GOAL} {rankName(GOAL)}
              {overall.level ? ` · ${Math.max(0, GOAL - overall.level)} levels to go` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="card section">
        <h3>Skills</h3>
        <div className="stat-rows">
          {sorted.map((a) => (
            <div key={a.id} className="stat-row">
              <span>
                <strong className="small">{a.name}</strong>
                {a.core && <span className="chip" style={{ marginLeft: 6 }}>core</span>}
                <br />
                <span className="tiny muted">{a.level ? `Lv ${a.level} · ${a.rank}` : a.assessed === 1 ? 'Unranked · 1 of 2 assessments' : 'Unranked'}</span>
              </span>
              <span>
                <LevelBar level={a.level} progress={a.progress} />
                {a.recent.length > 0 && (
                  <span className="tiny muted">
                    Last assessed: {a.recent.map((r) => `Lv ${r.level}`).join(' · ')}
                    {a.recent[0]?.why ? ` — “${a.recent[0].why}”` : ''}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ margin: '10px 0 0' }}>
          Levels are proven, not earned: a level counts once two of your last three assessed drawings in that skill reach it. The bar inside a level is your recent average. The dark line is Lv {GOAL}, {rankName(GOAL)}.
        </p>
      </div>
    </section>
  );
}

// A skill's level over time: the proven level as steps, each assessment as a
// dot, level-ups marked, the goal as a line.
function Growth({ areas }) {
  const withData = areas.filter((a) => a.history.length);
  const [pick, setPick] = useState(withData[0]?.id ?? null);
  const [hover, setHover] = useState(null);
  const a = areas.find((x) => x.id === pick);
  if (!withData.length) {
    return (
      <section className="section card">
        <h3>Growth over time</h3>
        <p className="small muted" style={{ margin: 0 }}>Your climb shows here after your first assessed drawings.</p>
      </section>
    );
  }
  const W = 720;
  const H = 240;
  const pad = { l: 36, r: 16, t: 14, b: 28 };
  const pts = a?.history ?? [];
  const t0 = pts[0]?.at ?? Date.now();
  const t1 = Math.max(Date.now(), t0 + 86400000);
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (lv) => pad.t + (1 - lv / 10) * (H - pad.t - pad.b);
  let step = '';
  pts.forEach((p, i) => {
    if (!p.level) return;
    step += !step ? `M${x(p.at)},${y(p.level)}` : `H${x(p.at)}V${y(p.level)}`;
  });
  if (step) step += `H${x(t1)}`;
  const ticks = [];
  const d = new Date(t0);
  d.setDate(1);
  for (let m = new Date(d); m.getTime() <= t1; m.setMonth(m.getMonth() + 1)) if (m.getTime() >= t0) ticks.push(m.getTime());
  const every = Math.max(1, Math.ceil(ticks.length / 8));
  return (
    <section className="section card">
      <h3>Growth over time</h3>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {withData.map((x2) => (
          <button key={x2.id} className={`chip-btn ${pick === x2.id ? 'active' : ''}`} onClick={() => setPick(x2.id)}>
            {x2.name}
          </button>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="growth-chart" role="img" aria-label={`${a.name} level over time`} onMouseLeave={() => setHover(null)}>
          {[2, 4, 6, 8, 10].map((lv) => (
            <g key={lv}>
              <line x1={pad.l} x2={W - pad.r} y1={y(lv)} y2={y(lv)} className={lv === GOAL ? 'goal-line' : 'grid-line'} />
              <text x={pad.l - 8} y={y(lv) + 4} textAnchor="end" className="axis">
                {lv}
              </text>
            </g>
          ))}
          <text x={W - pad.r} y={y(GOAL) - 6} textAnchor="end" className="axis goal-label">
            Lv {GOAL} {rankName(GOAL)}
          </text>
          {ticks.map((t, i) =>
            i % every === 0 ? (
              <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="axis">
                {fmtMonth(t)}
              </text>
            ) : null,
          )}
          <path d={step} className="step-line" />
          {pts.map((p, i) => (
            <g key={i}>
              {i > 0 && p.level > pts[i - 1].level && <circle cx={x(p.at)} cy={y(p.level)} r="9" className="levelup-ring" />}
              <circle cx={x(p.at)} cy={y(p.assessed)} r="4.5" className="dot" />
              <circle cx={x(p.at)} cy={y(p.assessed)} r="14" fill="transparent" onMouseEnter={() => setHover({ p, i })} />
            </g>
          ))}
        </svg>
        {hover && (
          <div className="chart-tip" style={{ left: `${(x(hover.p.at) / W) * 100}%`, top: `${(y(hover.p.assessed) / H) * 100}%` }}>
            <strong>{fmtDate(hover.p.at)}</strong>
            <br />
            Assessed Lv {hover.p.assessed} · proven Lv {hover.p.level || '–'}
            {hover.i > 0 && hover.p.level > pts[hover.i - 1].level ? <><br />Level up!</> : null}
          </div>
        )}
      </div>
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>Dots: each assessment. Line: your proven level. Rings: level-ups.</p>
    </section>
  );
}

function Quests({ quests, levelUps, achievements }) {
  return (
    <div className="grid-2 section">
      <div className="card">
        <h3>Quests</h3>
        {quests.length === 0 ? (
          <p className="small muted">Quests appear as you reach each skill on the path.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {quests.slice(0, 8).map((qq) => (
              <div key={qq.id} className="quest">
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <strong className="small">{qq.title}</strong>
                  <span className="pips" aria-label={`${qq.done} of ${qq.need}`}>
                    {Array.from({ length: qq.need }, (_, i) => (
                      <i key={i} className={i < qq.done ? 'on' : ''} />
                    ))}
                  </span>
                </div>
                <span className="tiny muted">
                  {qq.heldBack ? 'Raises your title. ' : ''}
                  {qq.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <h3>Level-ups</h3>
        {levelUps.length === 0 ? (
          <p className="small muted">None yet. Your first proven level will show here.</p>
        ) : (
          <ul className="levelups">
            {levelUps.slice(0, 10).map((l) => (
              <li key={`${l.area}-${l.to}-${l.at}`}>
                <span className="lv-badge">Lv {l.to}</span>
                <span>
                  <strong className="small">{l.name}</strong> · {l.rank}
                  <br />
                  <span className="tiny muted">{fmtDate(l.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {achievements.length > 0 && (
          <>
            <h4 className="brush-h">Achievements</h4>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {achievements.map((a) => (
                <span key={a.id} className="chip">
                  {a.title}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// The skill tree: per skill, its lessons along the path, unlocked as you go,
// with the level each part of the path aims for.
function Tree({ tree }) {
  const [openId, setOpenId] = useState(null);
  return (
    <section className="section card">
      <h3>Skill tree</h3>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        Each skill’s lessons along the path. Filled: finished; ringed: your current lesson; hollow: still ahead. “Aims for” is the level the path works towards by then. Levels themselves only come from proof.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {tree.map((t) => {
          const done = t.lessons.filter((l) => l.status === 'done').length;
          const open = openId === t.id;
          return (
            <div key={t.id} className="tree-skill">
              <button className="guide-head" onClick={() => setOpenId(open ? null : t.id)} aria-expanded={open}>
                <span style={{ flex: 1 }}>
                  <strong className="small">{t.name}</strong>
                  <span className="tiny muted">
                    {' '}
                    · {done} of {t.lessons.length} lessons · {t.level ? `Lv ${t.level}` : 'unranked'}
                  </span>
                </span>
                <span className="tree-mini" aria-hidden="true">
                  {t.lessons.map((l) => (
                    <i key={l.id} className={l.status} />
                  ))}
                </span>
                <span className="muted" aria-hidden="true">
                  {open ? '−' : '+'}
                </span>
              </button>
              {open && (
                <ol className="tree-nodes">
                  {t.lessons.map((l, i) => {
                    const prevAim = t.lessons[i - 1]?.aim;
                    return (
                      <li key={l.id} className={l.status}>
                        {l.aim && l.aim !== prevAim && <span className="aim">aims for Lv {l.aim}</span>}
                        <a href={`#/lesson/${l.id}`}>
                          <i className="node" aria-hidden="true" />
                          <span className="small">{l.title}</span>
                          <span className="tiny muted">{l.stage != null ? ` · Stage ${l.stage}` : l.track ? ` · ${l.track} track` : ''}</span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Skills() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api
      .skills()
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);
  const areas = useMemo(() => data?.areas ?? [], [data]);
  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="kicker">Character sheet</div>
      <h1>Your skills</h1>
      <p className="muted" style={{ maxWidth: 720 }}>
        Every skill on the professional scale from Lv 1 Novice to Lv {GOAL} {rankName(GOAL)}, the goal. Only honest proof moves a level: Claude’s industry ratings from critiques (API) and your portfolio reviews. Practice time, self-ratings and Claude.ai critiques don’t, so a level here is a level you’ve shown.
      </p>
      <Sheet data={data} />
      <Growth areas={areas} />
      <Quests quests={data.quests} levelUps={data.levelUps} achievements={data.achievements} />
      <Tree tree={data.tree} />
    </div>
  );
}
