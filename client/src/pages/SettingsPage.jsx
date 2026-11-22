import { useEffect, useState } from 'react';
import { api, characterSearch } from '../api.js';
import { useApp } from '../AppContext.jsx';
import Avatar from '../components/Avatar.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ImagePicker from '../components/ImagePicker.jsx';
import Modal from '../components/Modal.jsx';
import SearchBox from '../components/SearchBox.jsx';
import AppSettings from '../components/AppSettings.jsx';

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

// Per person: suggestive (not explicit) fan art, only for known adult characters.
function SpicySetting() {
  const { me, setMe } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const on = !!me.spicyArt;
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.setSpicy(!on);
      setMe({ ...me, spicyArt: r.spicyArt });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card settings-card">
      <h3>🌶️ Spicy art</h3>
      <p className="muted small">
        Adds suggestive fan art (fanservice, swimsuits, lingerie, suggestive poses) from Danbooru, Zerochan and Wallhaven. Never nudity or explicit
        content. Only for characters the app knows are adults (18+ on AniList, in their description or on MyAnimeList); everyone else keeps the normal art. This only changes your account;
        spicy pictures you save stay hidden for anyone who has this switched off.
      </p>
      <label className="switch-row">
        <input type="checkbox" checked={on} onChange={toggle} disabled={busy} />
        <span>{on ? 'On' : 'Off'}</span>
      </label>
      {error && <p className="error-text small">{error}</p>}
      {on && <AgeOverview />}
    </div>
  );
}

const BASIS = { anilist: 'AniList', description: 'description', myanimelist: 'MyAnimeList' };

// What the adults-only rule knows about the characters in your lists.
function AgeOverview() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.spicyAges().then(setData).catch(() => setData(null));
  }, []);
  if (!data) return null;
  const chip = (c, label) => (
    <a key={c.id} className="age-chip" href={`#/character/${c.id}`} title={label}>
      {c.image && <img src={c.image} alt="" />}
      <span>{c.name.split(' ')[0]}</span>
      {label && <span className="muted tiny">{label}</span>}
    </a>
  );
  return (
    <div className="age-overview">
      <p className="small">
        ✓ <b>{data.adults.length}</b> adults · 🚫 <b>{data.minors.length}</b> under 18 · ❓ <b>{data.unknown.length}</b> no known age
      </p>
      {data.adults.length > 0 && (
        <div className="age-chips">{data.adults.map((c) => chip(c, `${Math.round(c.age)}${c.basis && c.basis !== 'anilist' ? ` · ${BASIS[c.basis]}` : ''}`))}</div>
      )}
      {data.unknown.length > 0 && (
        <>
          <p className="muted small">
            No age found on AniList, in the description or on MyAnimeList yet, so these get normal art only. They're checked again every few days
            {data.unknown.some((c) => !c.checked) ? ' (some are still being checked right now)' : ''}.
          </p>
          <div className="age-chips">{data.unknown.map((c) => chip(c, c.checked ? null : 'checking…'))}</div>
        </>
      )}
    </div>
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
        <h3>🎨 Appearance</h3>
        <ThemeToggle />
      </div>
      <SpicySetting />
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

      <AppSettings />

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
