import { useState } from 'react';
import Avatar from './Avatar.jsx';

export default function MembersPanel({ detail, me, users, onInvite, onRemove }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const taken = new Set([detail.owner?.id, ...detail.members.map((m) => m.id)]);
  const candidates = users.filter((u) => !taken.has(u.id));

  const submit = async (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (await onInvite(name)) setUsername('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="members card">
      <div className="member-chips">
        <span className="muted small">👥 Members</span>
        {detail.owner && (
          <span className="chip">
            <Avatar user={detail.owner} size={18} />
            {detail.owner.id === me.id ? 'You' : detail.owner.username}
            <span className="muted small">owner</span>
          </span>
        )}
        {detail.members.map((m) => (
          <span className="chip" key={m.id}>
            <Avatar user={m} size={18} />
            {m.id === me.id ? 'You' : m.username}
            {detail.isOwner && (
              <button className="chip-remove" onClick={() => onRemove(m)} aria-label={`Remove ${m.username}`} title="Remove">
                ✕
              </button>
            )}
          </span>
        ))}
        {detail.members.length === 0 && <span className="muted small">Nobody invited yet.</span>}
      </div>

      {detail.isOwner && (
        <form className="invite" onSubmit={submit}>
          <input
            list="invite-candidates"
            placeholder="Invite by username…"
            value={username}
            autoCapitalize="none"
            onChange={(e) => setUsername(e.target.value)}
            aria-label="Username to invite"
          />
          <datalist id="invite-candidates">
            {candidates.map((u) => (
              <option key={u.id} value={u.username} />
            ))}
          </datalist>
          <button className="btn primary" type="submit" disabled={!username.trim() || busy}>
            Invite
          </button>
        </form>
      )}
      {error && <p className="error-text small">{error}</p>}
    </div>
  );
}
