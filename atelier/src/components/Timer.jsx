import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { TreeIcon, TREE_INFO, Tree } from './Tree.jsx';
import { useMusic } from './Music.jsx';

// The focus timer. A block plants a tree that grows while you draw. Finishing
// (or stopping at a natural point after 10 minutes) keeps it; giving up
// withers it. Optional phone guard: leaving the page for over 15 seconds
// counts as giving up. State lives in localStorage, so a reload keeps going.

const KEY = 'atelier.timer';
const TimerContext = createContext(null);
export const useTimer = () => useContext(TimerContext);

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
};
const save = (s) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.5);
    });
  } catch {
    // no sound
  }
}

export const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export function TimerProvider({ children, onChange }) {
  // phase: 'focus' | 'done' | 'withered' | 'break' | null
  const [state, setState] = useState(load);
  const [now, setNow] = useState(Date.now());
  const hiddenAt = useRef(null);
  const busy = useRef(false);
  // Music follows the timer (Spotify player in the dock).
  const music = useMusic();
  const musicRef = useRef(music);
  musicRef.current = music;

  const update = useCallback((s) => {
    setState(s);
    save(s);
  }, []);

  const finish = useCallback(
    async (status, extra = {}) => {
      const s = load();
      if (!s || s.phase !== 'focus' || busy.current) return;
      busy.current = true;
      const minutes = Math.min(s.planned, (Date.now() - s.startedAt) / 60000);
      try {
        await api.finishBlock(s.blockId, status, minutes);
      } catch {
        // the server closes stale blocks on its own
      }
      busy.current = false;
      if (status === 'done') chime();
      update({ ...s, phase: status === 'done' ? 'done' : 'withered', endedAt: Date.now(), minutes: Math.round(minutes), ...extra });
      if (status === 'done') musicRef.current?.onBreak();
      else musicRef.current?.onStop();
      onChange?.();
    },
    [update, onChange],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Time up?
  useEffect(() => {
    if (state?.phase === 'focus' && now >= state.startedAt + state.planned * 60000) finish('done');
    if (state?.phase === 'break' && now >= state.breakEndsAt) {
      chime();
      update({ ...state, phase: 'breakOver' });
      musicRef.current?.onStop();
    }
  }, [now, state, finish, update]);

  // Title shows the time left.
  useEffect(() => {
    const base = 'Atelier';
    if (state?.phase === 'focus') document.title = `${state.open ? fmt(now - state.startedAt) : fmt(state.startedAt + state.planned * 60000 - now)} · ${base}`;
    else if (state?.phase === 'break') document.title = `Break ${fmt(state.breakEndsAt - now)} · ${base}`;
    else document.title = base;
  }, [now, state]);

  // Phone guard.
  useEffect(() => {
    const onVis = () => {
      const s = load();
      if (!s?.guard || s.phase !== 'focus') return;
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current) {
        const away = Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (away > 15000) finish('gave_up', { reason: 'You left Atelier during a guarded block.' });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [finish]);

  const start = useCallback(
    async ({ minutes, kind = 'free', lessonId, area, label, guard, open = false, projectId = null }) => {
      // Start the music right away, while the click still counts as a user action (autoplay rules).
      musicRef.current?.onFocus();
      const b = await api.startBlock({ minutes, kind, lessonId, area, open, projectId });
      update({ phase: 'focus', blockId: b.id, tree: b.tree, startedAt: Date.now(), planned: b.planned, kind, lessonId: lessonId ?? null, area: b.area ?? area ?? null, label: label ?? null, guard: !!guard, open: !!open, projectId });
    },
    [update],
  );

  const value = {
    state,
    now,
    running: state?.phase === 'focus',
    start,
    giveUp: () => finish('gave_up'),
    stopHere: () => finish('done'),
    startBreak: (minutes) => update({ ...state, phase: 'break', breakEndsAt: Date.now() + minutes * 60000 }),
    clear: () => update(null),
  };
  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

// The big ring with the growing tree.
// The ring. With `dial` ({ value, max, step, min, onChange }) it becomes a
// slider: drag the knob around (one turn = max minutes) or use the arrow keys.
function Ring({ progress, tree, withered, size = 230, dial, grow: growTo }) {
  const r = 100;
  const c = 2 * Math.PI * r;
  const ref = useRef(null);
  const dragging = useRef(false);
  const frac = dial ? dial.value / dial.max : progress;
  const grow = withered ? 1 : growTo ?? (dial ? 0.15 + 0.85 * frac : progress);

  const fromPointer = (e) => {
    const box = ref.current.getBoundingClientRect();
    const x = e.clientX - (box.left + box.width / 2);
    const y = e.clientY - (box.top + box.height / 2);
    let a = Math.atan2(x, -y); // 0 at the top, clockwise
    if (a < 0) a += Math.PI * 2;
    let v = Math.round(((a / (Math.PI * 2)) * dial.max) / dial.step) * dial.step;
    // Don't wrap around past the top: stick to the ends.
    if (dial.value > dial.max * 0.75 && v < dial.max * 0.25) v = dial.max;
    if (dial.value < dial.max * 0.25 && v > dial.max * 0.75) v = dial.min;
    dial.onChange(Math.max(dial.min, Math.min(dial.max, v)));
  };
  const knob = dial ? [Math.sin(frac * Math.PI * 2) * r, -Math.cos(frac * Math.PI * 2) * r] : null;

  return (
    <svg
      ref={ref}
      viewBox="-115 -115 230 230"
      width={size}
      height={size}
      className={dial ? 'dial' : undefined}
      role={dial ? 'slider' : undefined}
      aria-hidden={dial ? undefined : 'true'}
      aria-label={dial ? 'Focus minutes' : undefined}
      aria-valuemin={dial?.min}
      aria-valuemax={dial?.max}
      aria-valuenow={dial?.value}
      tabIndex={dial ? 0 : undefined}
      onKeyDown={
        dial &&
        ((e) => {
          if (['ArrowUp', 'ArrowRight'].includes(e.key)) dial.onChange(Math.min(dial.max, dial.value + dial.step));
          else if (['ArrowDown', 'ArrowLeft'].includes(e.key)) dial.onChange(Math.max(dial.min, dial.value - dial.step));
          else return;
          e.preventDefault();
        })
      }
      onPointerDown={
        dial &&
        ((e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        })
      }
      onPointerMove={dial && ((e) => dragging.current && fromPointer(e))}
      onPointerUp={dial && (() => (dragging.current = false))}
      onPointerCancel={dial && (() => (dragging.current = false))}
    >
      <circle r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle r={r} fill="none" stroke={withered ? 'var(--muted)' : 'var(--sage)'} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90)" style={{ transition: dial ? 'none' : 'stroke-dashoffset 1s linear' }} />
      {dial &&
        Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <line key={i} x1={Math.sin(a) * 88} y1={-Math.cos(a) * 88} x2={Math.sin(a) * (i % 3 ? 92 : 84)} y2={-Math.cos(a) * (i % 3 ? 92 : 84)} stroke="var(--line-2)" strokeWidth="2" />;
        })}
      <ellipse cx="0" cy="22" rx="62" ry="12" fill="var(--paper-2)" />
      <g transform="translate(0 22)">
        <Tree type={withered ? 'withered' : tree} scale={0.45 + 1.0 * grow} />
      </g>
      {knob && (
        <g style={{ cursor: 'grab' }}>
          <circle cx={knob[0]} cy={knob[1]} r="14" fill="var(--card)" stroke="var(--sage)" strokeWidth="4" />
          <circle cx={knob[0]} cy={knob[1]} r="4" fill="var(--sage)" />
        </g>
      )}
    </svg>
  );
}

const PRESETS = [25, 45, 60, 90];

export function TimerCard({ profile, areas, suggestion }) {
  const t = useTimer();
  const s = t.state;
  const [minutes, setMinutes] = useState(profile?.focusMinutes ?? 45);
  const [area, setArea] = useState('');
  const [label, setLabel] = useState('');
  const [guard, setGuard] = useState(() => localStorage.getItem('atelier.guard') === '1');
  const [openEnded, setOpenEnded] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  useEffect(() => {
    if (profile?.focusMinutes) setMinutes(profile.focusMinutes);
  }, [profile?.focusMinutes]);

  const begin = async (o = {}) => {
    setErr(null);
    try {
      localStorage.setItem('atelier.guard', guard ? '1' : '0');
      await t.start({ minutes, area: area || undefined, label: label || undefined, guard, ...o });
    } catch (e) {
      setErr(e.message);
    }
  };

  if (s?.phase === 'focus' && s.open) {
    // Open-ended (free drawing): counts up, the tree grows over 90 minutes, stop any time.
    const elapsed = t.now - s.startedAt;
    const hourFrac = (elapsed % 3600000) / 3600000;
    return (
      <div className="card timer-card">
        <div className="timer-ring">
          <Ring progress={hourFrac} tree={s.tree} grow={Math.min(1, elapsed / 5400000)} />
          <div className="timer-time">{fmt(elapsed)}</div>
        </div>
        <div>
          <div className="kicker">Free drawing · open-ended</div>
          <h2>{s.label ?? 'Free drawing'}</h2>
          <p className="muted">No limit: draw as long as you like and stop when you’re done. The ring goes round once an hour; your tree grows the longer you stay.</p>
          <div className="row">
            <button className="btn primary" onClick={t.stopHere}>
              Done for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (s?.phase === 'focus') {
    const total = s.planned * 60000;
    const left = s.startedAt + total - t.now;
    const progress = Math.min(1, 1 - left / total);
    const elapsedMin = (t.now - s.startedAt) / 60000;
    return (
      <div className="card timer-card">
        <div className="timer-ring">
          <Ring progress={progress} tree={s.tree} />
          <div className="timer-time">{fmt(left)}</div>
        </div>
        <div>
          <div className="kicker">Focus · {TREE_INFO[s.tree]?.name} growing</div>
          <h2>{s.label ?? 'Drawing time'}</h2>
          <p className="muted">
            Stay with this one thing until the bell. {s.guard ? 'Phone guard is on: leaving this page for more than 15 seconds withers the tree.' : 'Your tree grows as you draw.'}
          </p>
          <div className="row">
            {elapsedMin >= 10 && (
              <button className="btn" onClick={t.stopHere}>
                Finish here (keep the tree)
              </button>
            )}
            {!confirmGiveUp ? (
              <button className="btn ghost" onClick={() => setConfirmGiveUp(true)}>
                Give up
              </button>
            ) : (
              <>
                <span className="small">The tree will wither. Sure?</span>
                <button className="btn small" onClick={() => { setConfirmGiveUp(false); t.giveUp(); }}>
                  Yes, give up
                </button>
                <button className="btn small primary" onClick={() => setConfirmGiveUp(false)}>
                  Keep going
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (s?.phase === 'done' || s?.phase === 'withered') {
    const ok = s.phase === 'done';
    return (
      <div className="card timer-card">
        <div className="timer-ring">
          <Ring progress={1} tree={s.tree} withered={!ok} />
        </div>
        <div>
          <div className="kicker">{ok ? 'Block complete' : 'Tree withered'}</div>
          <h2>{ok ? `A ${TREE_INFO[s.tree]?.name.toLowerCase()} for your valley` : 'That one didn’t make it'}</h2>
          <p className="muted">
            {ok
              ? `${s.minutes} focused minutes. Take a real break: stand up, look into the distance, drink some water.`
              : s.reason ?? 'It stays in your valley as a reminder, and that’s fine. The next one grows.'}
          </p>
          <div className="row">
            {ok && (
              <button className="btn primary" onClick={() => t.startBreak(profile?.breakMinutes ?? 10)}>
                Start a {profile?.breakMinutes ?? 10}-minute break
              </button>
            )}
            <button className="btn" onClick={() => { t.clear(); }}>
              {ok ? 'Skip the break' : 'Try again'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (s?.phase === 'break' || s?.phase === 'breakOver') {
    const over = s.phase === 'breakOver';
    return (
      <div className="card timer-card">
        <div className="timer-ring">
          <svg viewBox="-115 -115 230 230" width="230" height="230" aria-hidden="true">
            <circle r="100" fill="none" stroke="var(--line)" strokeWidth="8" />
            <circle r="100" fill="none" stroke="var(--blue)" strokeWidth="8" strokeLinecap="round" strokeDasharray={628} strokeDashoffset={over ? 0 : 628 * ((s.breakEndsAt - t.now) / ((profile?.breakMinutes ?? 10) * 60000))} transform="rotate(-90)" />
            <text y="-8" textAnchor="middle" fontSize="40">☕</text>
          </svg>
          {!over && <div className="timer-time">{fmt(s.breakEndsAt - t.now)}</div>}
        </div>
        <div>
          <div className="kicker">{over ? 'Break over' : 'Break'}</div>
          <h2>{over ? 'Ready for the next block?' : 'Rest your eyes and hand'}</h2>
          <p className="muted">Breaks help what you just practised settle in. No phone scrolling if you can manage it.</p>
          <div className="row">
            <button className="btn primary" onClick={() => begin({ label: s.label ?? undefined, area: s.area ?? undefined })}>
              Next {minutes}-minute block
            </button>
            <button className="btn" onClick={t.clear}>
              Done for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card timer-card">
      <div className="timer-ring">
        <Ring progress={0} tree={suggestion?.tree ?? 'sapling'} dial={{ value: minutes, min: 5, max: 180, step: 5, onChange: setMinutes }} />
        <div className="timer-time">{openEnded ? '∞' : minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:00` : `${minutes}:00`}</div>
      </div>
      <div>
        <div className="kicker">Focus timer</div>
        <h2>Plant a tree, then draw</h2>
        <p className="muted">One block, one thing. When the bell rings, your tree joins the valley. Drag the ring to set any length.</p>
        <div className="timer-presets" role="group" aria-label="Minutes">
          {[...new Set([...PRESETS, profile?.focusMinutes].filter(Boolean))].sort((a, b) => a - b).map((m) => (
            <button key={m} className={m === minutes && !openEnded ? 'active' : ''} onClick={() => { setMinutes(m); setOpenEnded(false); }}>
              {m} min
            </button>
          ))}
          <button className={openEnded ? 'active' : ''} onClick={() => setOpenEnded(!openEnded)} title="Free drawing: counts up, stop whenever you like">
            ∞ Open
          </button>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <input type="text" placeholder="What are you drawing? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '1 1 200px' }} />
          <select value={area} onChange={(e) => setArea(e.target.value)} style={{ flex: '0 1 180px' }} aria-label="Skill area">
            <option value="">Any area (meadow)</option>
            {(areas ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => begin(openEnded ? { open: true, minutes: 240, kind: 'free' } : {})}>
            {openEnded ? 'Start open-ended' : 'Start focus'}
          </button>
          <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={guard} onChange={(e) => setGuard(e.target.checked)} /> Phone guard
          </label>
        </div>
        {err && <p className="error small">{err}</p>}
      </div>
    </div>
  );
}

// A small pill in the corner while a block or break runs.
export function TimerMini() {
  const t = useTimer();
  const s = t.state;
  if (!s || !['focus', 'break'].includes(s.phase)) return null;
  const focus = s.phase === 'focus';
  const left = focus ? (s.open ? t.now - s.startedAt : s.startedAt + s.planned * 60000 - t.now) : s.breakEndsAt - t.now;
  const progress = focus ? 1 - left / (s.planned * 60000) : 1;
  return (
    <a className="timer-mini" href="#/" aria-label="Open the timer">
      {focus ? <TreeIcon type={s.tree} size={34} grow={progress} /> : <span style={{ fontSize: 22, padding: '0 4px' }}>☕</span>}
      {fmt(left)}
    </a>
  );
}
