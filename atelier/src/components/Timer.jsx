import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { TreeIcon, TREE_INFO, Tree } from './Tree.jsx';

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
    }
  }, [now, state, finish, update]);

  // Title shows the time left.
  useEffect(() => {
    const base = 'Atelier';
    if (state?.phase === 'focus') document.title = `${fmt(state.startedAt + state.planned * 60000 - now)} · ${base}`;
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
    async ({ minutes, kind = 'free', lessonId, area, label, guard }) => {
      const b = await api.startBlock({ minutes, kind, lessonId, area });
      update({ phase: 'focus', blockId: b.id, tree: b.tree, startedAt: Date.now(), planned: b.planned, kind, lessonId: lessonId ?? null, area: b.area ?? area ?? null, label: label ?? null, guard: !!guard });
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
function Ring({ progress, tree, withered, size = 230 }) {
  const r = 100;
  const c = 2 * Math.PI * r;
  const grow = withered ? 1 : progress;
  return (
    <svg viewBox="-115 -115 230 230" width={size} height={size} aria-hidden="true">
      <circle r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle r={r} fill="none" stroke={withered ? 'var(--muted)' : 'var(--sage)'} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} transform="rotate(-90)" style={{ transition: 'stroke-dashoffset 1s linear' }} />
      <ellipse cx="0" cy="22" rx="62" ry="12" fill="var(--paper-2)" />
      <g transform="translate(0 22)">
        <Tree type={withered ? "withered" : tree} scale={0.45 + 1.0 * grow} />
      </g>
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
        <Ring progress={0} tree={suggestion?.tree ?? 'sapling'} />
        <div className="timer-time">{minutes}:00</div>
      </div>
      <div>
        <div className="kicker">Focus timer</div>
        <h2>Plant a tree, then draw</h2>
        <p className="muted">One block, one thing. When the bell rings, your tree joins the valley.</p>
        <div className="timer-presets" role="group" aria-label="Minutes">
          {[...new Set([...PRESETS, profile?.focusMinutes].filter(Boolean))].sort((a, b) => a - b).map((m) => (
            <button key={m} className={m === minutes ? 'active' : ''} onClick={() => setMinutes(m)}>
              {m} min
            </button>
          ))}
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
          <button className="btn primary" onClick={() => begin()}>
            Start focus
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
  const left = focus ? s.startedAt + s.planned * 60000 - t.now : s.breakEndsAt - t.now;
  const progress = focus ? 1 - left / (s.planned * 60000) : 1;
  return (
    <a className="timer-mini" href="#/" aria-label="Open the timer">
      {focus ? <TreeIcon type={s.tree} size={34} grow={progress} /> : <span style={{ fontSize: 22, padding: '0 4px' }}>☕</span>}
      {fmt(left)}
    </a>
  );
}
