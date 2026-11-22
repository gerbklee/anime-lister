import { useState } from 'react';
import Avatar from './Avatar.jsx';
import Modal from './Modal.jsx';

// "Who watched it?" — all watchlist members are pre-selected.
export default function WatchedDialog({ entry, people, me, onConfirm, onClose }) {
  const manga = entry.anime?.type === "MANGA";
  const [selected, setSelected] = useState(() => new Set(people.map((p) => p.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm([...selected]);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`${manga ? "Read" : "Watched"} ${entry.name}?`} onClose={onClose}>
      <p className="muted small">
        It will be added as <b>{manga ? "Read" : "Watched"}</b> to the catalogue of everyone you select, and removed from this watchlist. Its
        comments stay on the anime's page.
      </p>
      <div className="people-picks">
        {people.map((p) => (
          <label key={p.id} className={`person-pick ${selected.has(p.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            <Avatar user={p} size={28} />
            {p.id === me.id ? 'You' : p.username}
          </label>
        ))}
      </div>
      {error && <p className="error-text small">{error}</p>}
      <div className="modal-actions">
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!selected.size || busy} onClick={confirm}>
          {busy ? "Saving…" : manga ? "✓ Mark as read" : "✓ Mark as watched"}
        </button>
      </div>
    </Modal>
  );
}
