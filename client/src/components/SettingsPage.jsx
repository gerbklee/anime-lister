import { useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

export default function SettingsPage({ me, onLogout }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ type: 'error', text: 'The new passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setMessage({ type: 'ok', text: 'Password changed. Other devices have been logged out.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings">
      <div className="settings-user">
        <Avatar user={me} size={48} />
        <div>
          <h2>{me.username}</h2>
          <button className="btn ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      <form className="card settings-card" onSubmit={changePassword}>
        <h3>Change password</h3>
        <label className="field">
          <span>Current password</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span>New password</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </label>
        <label className="field">
          <span>Repeat new password</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {message && <p className={message.type === 'error' ? 'error-text' : 'ok-text'}>{message.text}</p>}
        <button className="btn primary" type="submit" disabled={busy || !current || !next}>
          Change password
        </button>
      </form>
    </section>
  );
}
