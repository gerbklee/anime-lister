const KEY = 'obscurity';

export function savedObscurity() {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 50;
  } catch {
    return 50;
  }
}

function label(v) {
  if (v <= 15) return 'Mainstream hits';
  if (v <= 40) return 'Leaning popular';
  if (v < 60) return 'Balanced';
  if (v < 85) return 'Lesser known';
  return 'Hidden gems';
}

// Re-ranks recommendations by popularity (number of AniList users):
// left favours popular anime, right favours obscure ones. At the extremes the
// most/least popular quarter is left out entirely.
export function applyObscurity(items, v) {
  if (!items.length) return items;
  const pops = items.map((i) => i.popularity || 1).sort((a, b) => a - b);
  const pick = (p) => pops[Math.min(pops.length - 1, Math.floor(pops.length * p))];
  const median = pick(0.5) || 1;
  const beta = ((50 - v) / 50) * 0.6;
  const q25 = pick(0.25);
  const q75 = pick(0.75);
  return items
    .filter((i) => (v >= 85 ? (i.popularity || 1) <= q75 : v <= 15 ? (i.popularity || 1) >= q25 : true))
    .map((i) => ({ ...i, adjusted: i.score * ((i.popularity || 1) / median) ** beta }))
    .sort((a, b) => b.adjusted - a.adjusted);
}

export default function ObscuritySlider({ value, onChange }) {
  return (
    <div className="obscurity">
      <div className="obscurity-head">
        <span className="small">Obscurity</span>
        <b className="small">{label(value)}</b>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label="Obscurity: popular to hidden gems"
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(v);
          try {
            localStorage.setItem(KEY, String(v));
          } catch {
            // not important
          }
        }}
      />
      <div className="obscurity-scale muted tiny">
        <span>Mainstream</span>
        <span>Hidden gems</span>
      </div>
    </div>
  );
}
