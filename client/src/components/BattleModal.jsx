import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';

// "This or that": sorts characters with as few questions as possible
// (binary insertion: each character is placed by halving the range).
//
// mode 'insert': place the "to rank" characters into the existing ranking,
//               saving after each one.
// mode 'full':  re-sort the whole list from scratch; progress is kept on this
//               device so you can stop and continue later.

function normalize(st) {
  let { sorted, pending, lo, hi } = st;
  let inserted = false;
  while (pending.length && lo >= hi) {
    sorted = [...sorted];
    sorted.splice(lo, 0, pending[0]);
    pending = pending.slice(1);
    lo = 0;
    hi = sorted.length;
    inserted = true;
  }
  return { ...st, sorted, pending, lo, hi, inserted };
}

function estimate(st) {
  let total = Math.ceil(Math.log2(Math.max(st.hi - st.lo, 1) + 1));
  for (let k = 1; k < st.pending.length; k++) total += Math.ceil(Math.log2(st.sorted.length + k + 1));
  return st.pending.length ? total : 0;
}

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // not important
  }
}

function Card({ entry, onPick, side }) {
  return (
    <button type="button" className="battle-card" onClick={onPick} aria-label={`${entry.name} is better`}>
      {entry.image ? <img src={entry.image} alt="" /> : <div className="img-placeholder">?</div>}
      <b>{entry.name}</b>
      <span className="muted tiny">{entry.seriesTitle}</span>
      <span className="muted tiny battle-key">{side === 'left' ? '← key' : 'key →'}</span>
    </button>
  );
}

export default function BattleModal({ storageKey, mode, ranked, tray, onSaveOrder, onClose }) {
  const byId = useMemo(() => new Map([...ranked, ...tray].map((e) => [e.id, e])), [ranked, tray]);

  const [st, setSt] = useState(() => {
    const allIds = [...ranked, ...tray].map((e) => e.id);
    if (mode === 'full') {
      const saved = load(storageKey);
      const savedIds = saved ? [...saved.sorted, ...saved.pending] : [];
      if (saved && savedIds.length === allIds.length && savedIds.every((id) => byId.has(id))) return { ...saved, resumed: true };
      return normalize({ mode, sorted: allIds.slice(0, 1), pending: allIds.slice(1), lo: 0, hi: 1, asked: 0 });
    }
    return normalize({ mode, sorted: ranked.map((e) => e.id), pending: tray.map((e) => e.id), lo: 0, hi: ranked.length, asked: 0 });
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(() => st.pending.length === 0);

  const candidate = byId.get(st.pending[0]);
  const mid = Math.floor((st.lo + st.hi) / 2);
  const opponent = byId.get(st.sorted[mid]);
  const left = estimate(st);

  // Insert mode: the first characters may need no question at all.
  useEffect(() => {
    if (mode === 'insert' && st.inserted) onSaveOrder(st.sorted.map((id) => byId.get(id))).catch((err) => setError(err.message));
    if (st.pending.length === 0) finish(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (state) => {
    if (mode === 'full') {
      setBusy(true);
      try {
        await onSaveOrder(state.sorted.map((id) => byId.get(id)));
        store(storageKey, null);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    }
    setDone(true);
  };

  const pick = async (candidateWins) => {
    if (busy || !candidate || !opponent) return;
    let next = { ...st, asked: st.asked + 1, resumed: false };
    if (candidateWins) next.hi = mid;
    else next.lo = mid + 1;
    next = normalize(next);
    setSt(next);
    if (next.inserted && mode === 'insert') {
      setBusy(true);
      try {
        await onSaveOrder(next.sorted.map((id) => byId.get(id)));
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    }
    if (next.pending.length === 0) await finish(next);
    else if (mode === 'full') store(storageKey, { mode, sorted: next.sorted, pending: next.pending, lo: next.lo, hi: next.hi, asked: next.asked });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') pick(true);
      if (e.key === 'ArrowRight') pick(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const title = mode === 'full' ? '⚔️ Sort the whole list' : '⚔️ Battle new characters in';

  return (
    <Modal title={title} onClose={onClose} wide center>
      {done ? (
        <div className="battle-done">
          <p className="battle-emoji">🏆</p>
          <p>
            <b>Done!</b> {mode === 'full' ? 'Your ranking has been sorted.' : 'Everyone has been ranked.'} ({st.asked} questions)
          </p>
          {error && <p className="error-text small">{error}</p>}
          <button className="btn primary" onClick={onClose} disabled={busy}>
            {busy ? 'Saving…' : 'Show my ranking'}
          </button>
        </div>
      ) : (
        <>
          <p className="battle-question">
            Who's better{mode === 'insert' ? <> for <b>{candidate?.name}</b>'s spot</> : ''}?
          </p>
          {st.resumed && <p className="muted small">Continuing where you stopped last time.</p>}
          <div className="battle">
            {candidate && <Card entry={candidate} side="left" onPick={() => pick(true)} />}
            <span className="battle-vs">vs</span>
            {opponent && <Card entry={opponent} side="right" onPick={() => pick(false)} />}
          </div>
          <div className="battle-progress">
            <div style={{ width: `${(st.asked / Math.max(st.asked + left, 1)) * 100}%` }} />
          </div>
          <p className="muted small battle-meta">
            {st.asked} answered · about {left} to go · {st.pending.length} left to place
          </p>
          {error && <p className="error-text small">{error}</p>}
          <div className="modal-actions">
            <span className="muted tiny">
              {mode === 'full' ? 'Your ranking only changes when the sort is finished. You can stop and continue later.' : 'Each placed character is saved right away.'}
            </span>
            <div className="spacer" />
            <button className="btn ghost" onClick={onClose}>
              {mode === 'full' ? 'Stop for now' : 'Close'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
