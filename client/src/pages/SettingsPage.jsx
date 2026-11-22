import { useState } from 'react';
import { api, characterSearch } from '../api.js';
import { useApp } from '../AppContext.jsx';
import Avatar from '../components/Avatar.jsx';
import ImagePicker from '../components/ImagePicker.jsx';
import Modal from '../components/Modal.jsx';
import SearchBox from '../components/SearchBox.jsx';

// Step 1: choose a character. Step 2: choose one of their pictures.
function AvatarPicker({ onClose, onPicked }) {
  const [character, setCharacter] = useState(null);

  if (character) {
    return (
      <ImagePicker
        characterId={character.id}
        title={`Profile photo · ${character.name}`}
        onClose={onClose}
        onPick={async (url) => onPicked(await api.setAvatar(url))}
      />
    );
  }
  return (
    <Modal title="Choose a profile photo" onClose={onClose}>
      <p className="muted small">Search for a character, then pick one of their pictures.</p>
      <SearchBox search={characterSearch} onAdd={async (r) => setCharacter(r)} addLabel="Choose" placeholder="Search characters…" />
    </Modal>
  );
}

export default function SettingsPage({ onLogout }) {
  const { me, setMe, refreshLists } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [avatarError, setAvatarError] = useState(null);

  const updated = (user) => {
    setMe(user);
    refreshLists();
  };

  const removePhoto = async () => {
    try {
      updated(await api.setAvatar(null));
    } catch (err) {
      setAvatarError(err.message);
    }
  };

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
      <div className="card settings-card">
        <h3>Profile photo</h3>
        <div className="settings-user">
          <Avatar user={me} size={56} />
          <div className="settings-buttons">
            <button className="btn ghost" onClick={() => setPicking(true)}>
              🖼️ Change photo
            </button>
            {me.avatar && (
              <button className="btn ghost" onClick={removePhoto}>
                Remove photo
              </button>
            )}
          </div>
        </div>
        {avatarError && <p className="error-text small">{avatarError}</p>}
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

      <div>
        <button className="btn ghost" onClick={onLogout}>
          Log out
        </button>
      </div>

      {picking && <AvatarPicker onClose={() => setPicking(false)} onPicked={updated} />}
    </section>
  );
}
