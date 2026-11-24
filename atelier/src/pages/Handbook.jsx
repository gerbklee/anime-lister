import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Guide from '../components/Guide.jsx';

// The Clip Studio Paint handbook: every guide, grouped, with the lessons that use it.
export default function Handbook() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.csp().then(setData).catch(() => {});
  }, []);
  return (
    <div style={{ maxWidth: 820, marginTop: 10 }}>
      <div className="kicker">Clip Studio Paint 5.0</div>
      <h1>The Clip Studio handbook</h1>
      <p className="muted">
        Everything in CSP you need to draw anime, from canvas setup to cel shading. Each lesson shows the guides it needs; here they are all in one place. Learn a tool when a lesson needs it, not before: the drawing is the skill, the software is the pencil.
      </p>
      <a className="lesson-row section" href="#/brushes" style={{ display: 'flex' }}>
        <span style={{ fontSize: 20 }}>🖌</span>
        <span style={{ flex: 1 }}>
          <strong>Your brush kit</strong>
          <br />
          <span className="small muted">Every brush the path uses, with links, settings and what each one is for.</span>
        </span>
        <span className="muted">→</span>
      </a>
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        data.groups.map((group) => (
          <section key={group} className="section">
            <h2>{group}</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {data.guides
                .filter((g) => g.group === group)
                .map((g) => (
                  <Guide key={g.id} g={g} showLessons />
                ))}
            </div>
          </section>
        ))
      )}
      <p className="small muted section">
        Menu names follow the English Windows version of Ver. 5.0; on macOS and tablets a few items sit in the app menu or the side panel. The official manual is at{' '}
        <a href="https://help.clip-studio.com/en-us/manual_en/" target="_blank" rel="noreferrer">
          help.clip-studio.com
        </a>
        .
      </p>
    </div>
  );
}
