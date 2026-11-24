import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { GOAL, rankName } from './ranks.js';

// Watches your proven skill levels and celebrates when one goes up. The last
// levels seen are kept per user in this browser; the first look only remembers.
export default function LevelUp({ userId, version }) {
  const [shown, setShown] = useState(null);
  const last = useRef(0);
  useEffect(() => {
    if (Date.now() - last.current < 15000) return;
    last.current = Date.now();
    const key = `atelier.levels.${userId}`;
    api
      .skills()
      .then((s) => {
        let seen = null;
        try {
          seen = JSON.parse(localStorage.getItem(key) ?? 'null');
        } catch {
          // ignore
        }
        const now = Object.fromEntries(s.areas.map((a) => [a.id, a.level]));
        now.__overall = s.overall.level;
        if (seen) {
          const ups = s.areas.filter((a) => a.level > (seen[a.id] ?? 0)).map((a) => ({ name: a.name, level: a.level }));
          const title = s.overall.level > (seen.__overall ?? 0) ? s.overall.level : null;
          if (ups.length || title) setShown({ ups, title });
        }
        try {
          localStorage.setItem(key, JSON.stringify(now));
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }, [userId, version]);
  if (!shown) return null;
  return (
    <div className="levelup-backdrop" role="dialog" aria-modal="true" aria-label="Level up" onClick={() => setShown(null)}>
      <div className="levelup-card" onClick={(e) => e.stopPropagation()}>
        <div className="kicker">Level up!</div>
        {shown.ups.map((u) => (
          <p key={u.name} className="levelup-line">
            <strong>{u.name}</strong> → Lv {u.level} <span className="muted">{rankName(u.level)}</span>
          </p>
        ))}
        {shown.title && (
          <p className="small">
            Your title is now <strong>Lv {shown.title} {rankName(shown.title)}</strong>
            {shown.title < GOAL ? `, ${GOAL - shown.title} to go to ${rankName(GOAL)}` : ''}.
          </p>
        )}
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <a className="btn primary small" href="#/skills" onClick={() => setShown(null)}>
            See your skills
          </a>
          <button className="btn small" onClick={() => setShown(null)}>
            Nice
          </button>
        </div>
      </div>
    </div>
  );
}
