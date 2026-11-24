import { useEffect, useState } from 'react';
import { api } from '../api.js';
import BrushCard from '../components/BrushCard.jsx';

// The brush kit for the whole path, grouped by what each brush is for.
export default function Brushes() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.brushes().then(setData).catch(() => {});
  }, []);
  return (
    <div style={{ maxWidth: 820, marginTop: 10 }}>
      <a className="small" href="#/clip-studio">
        ← Clip Studio handbook
      </a>
      <div className="kicker" style={{ marginTop: 14 }}>
        Clip Studio Paint
      </div>
      <h1>Your brush kit</h1>
      <p className="muted">
        These are all the brushes the path uses, from the first line drill to your portfolio. You start with three, and each new one opens with the stage that teaches what it’s for. Every lesson lists the brushes it needs. Other brush packs are for free drawing only. The setup is in the lesson{' '}
        <a href="#/lesson/s0-brushes">Your brush kit</a>.
      </p>
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        data.slots.map((slot) => {
          const list = data.brushes.filter((b) => b.slot === slot.id);
          if (!list.length) return null;
          return (
            <section key={slot.id} className="section">
              <h2>{slot.name}</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {list.map((b) => (
                  <BrushCard key={b.id} b={b} showStages />
                ))}
              </div>
            </section>
          );
        })
      )}
      {data && (
        <p className="small muted section">
          Downloads come from{' '}
          <a href={data.assetsHome} target="_blank" rel="noreferrer">
            CLIP STUDIO ASSETS
          </a>
          . Each page shows the price (the kit picks are free downloads or cost a few Clippy). Built-in brushes ship with Clip Studio Paint. If you moved or deleted one, Sub tool palette menu → Import sub tool, or get it back from the official{" "}
          <a href="https://assets.clip-studio.com/en-us/detail?id=1842027" target="_blank" rel="noreferrer">
            Pens &amp; Brushes_Ver.1.10.9
          </a>{" "}
          pack.
        </p>
      )}
    </div>
  );
}
