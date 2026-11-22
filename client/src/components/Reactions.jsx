import { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMOJIS = ['❤️', '😂', '😮'];

export default function Reactions({ target, initial }) {
  const [summary, setSummary] = useState(initial ?? {});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) setSummary(initial);
  }, [initial]);

  const toggle = async (emoji) => {
    if (busy) return;
    setBusy(true);
    try {
      setSummary(await api.react(target, emoji));
    } catch {
      // ignore; the next refresh shows the real state
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="reactions">
      {EMOJIS.map((e) => {
        const r = summary[e] ?? { count: 0, mine: false };
        return (
          <button
            key={e}
            type="button"
            className={`reaction ${r.mine ? 'mine' : ''}`}
            onClick={() => toggle(e)}
            aria-pressed={r.mine}
            aria-label={`React with ${e}`}
          >
            {e}
            {r.count > 0 && <span className="reaction-count">{r.count}</span>}
          </button>
        );
      })}
    </span>
  );
}
