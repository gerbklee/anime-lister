import { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMOJIS = ['❤️', '😂', '😮'];

// Shows only the reactions someone used, plus a small "add" button that opens
// the emoji picker inline (so rows stay tidy).
export default function Reactions({ target, initial, emojis = EMOJIS }) {
  const [summary, setSummary] = useState(initial ?? {});
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (initial) setSummary(initial);
  }, [initial]);

  const toggle = async (emoji) => {
    setPicking(false);
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

  const used = emojis.filter((e) => (summary[e]?.count ?? 0) > 0);

  return (
    <span className="reactions">
      {used.map((e) => {
        const r = summary[e];
        return (
          <button key={e} type="button" className={`reaction ${r.mine ? 'mine' : ''}`} onClick={() => toggle(e)} aria-pressed={r.mine} aria-label={`React with ${e}`}>
            {e}
            <span className="reaction-count">{r.count}</span>
          </button>
        );
      })}
      {picking ? (
        <span className="reaction-picker" role="group" aria-label="Pick a reaction">
          {emojis.map((e) => (
            <button key={e} type="button" className={`reaction ${summary[e]?.mine ? 'mine' : ''}`} onClick={() => toggle(e)} aria-label={`React with ${e}`}>
              {e}
            </button>
          ))}
          <button type="button" className="reaction reaction-close" onClick={() => setPicking(false)} aria-label="Close">
            ✕
          </button>
        </span>
      ) : (
        <button type="button" className="reaction reaction-add" onClick={() => setPicking(true)} aria-label="Add a reaction" title="React">
          <span aria-hidden="true">☺</span>
          <span className="reaction-plus" aria-hidden="true">+</span>
        </button>
      )}
    </span>
  );
}
