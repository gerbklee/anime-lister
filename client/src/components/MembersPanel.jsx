import { useState } from 'react';
import Avatar from './Avatar.jsx';

// Compact members row: overlapping avatars, plus (for the owner) an icon that
// opens the member management (remove members, invite by username).
export default function MembersPanel({ detail, me, users, onInvite, onRemove, startOpen = false, manageOnly = false }) {
  const [open, setOpen] = useState(startOpen);
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const people = [detail.owner, ...detail.members].filter(Boolean);
  const taken = new Set(people.map((p) => p.id));
  const candidates = users.filter((u) => !taken.has(u.id));
  const others = people.filter((p) => p.id !== me.id).map((p) => p.username);
  const summary = others.length ? `Shared with ${others.join(', ')}` : 'Not shared with anyone yet';

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
    <div className="members">
      {!manageOnly && <div className="members-row">
        <span className="avatar-stack" aria-hidden="true">
          {people.map((p) => (
            <Avatar key={p.id} user={p} size={24} title={`${p.username}${p.id === detail.owner?.id ? ' (owner)' : ''}`} />
          ))}
        </span>
        <span className="muted small members-summary">{summary}</span>
        {detail.isOwner && (
          <button
            type="button"
            className={`icon-btn members-toggle ${open ? 'active' : ''}`}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Manage members and invite people"
            title="Manage members / invite"
          >
            👤＋
          </button>
        )}
      </div>}

      {open && detail.isOwner && (
        <div className="members-manage card">
          {detail.members.length > 0 && (
            <div className="member-chips">
              {detail.members.map((m) => (
                <span className="chip" key={m.id}>
                  <Avatar user={m} size={18} />
                  {m.username}
                  <button className="chip-remove" onClick={() => onRemove(m)} aria-label={`Remove ${m.username}`} title="Remove">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <form className="invite" onSubmit={submit}>
            <input
              list="invite-candidates"
              placeholder="Invite by username…"
              value={username}
              autoCapitalize="none"
              autoFocus
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
          {error && <p className="error-text small">{error}</p>}
        </div>
      )}
    </div>
  );
}
