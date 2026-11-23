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

// Art sources: the (server-wide) Pixiv connection for the Art search.
function ArtSourcesSetting() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [loginUrl, setLoginUrl] = useState(null);
  const [code, setCode] = useState('');
  useEffect(() => {
    api.studioStatus().then(setStatus).catch(() => {});
  }, []);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const startPixiv = () =>
    run(async () => {
      const r = await api.pixivLogin();
      setLoginUrl(r.url);
      window.open(r.url, '_blank', 'noopener');
    });
  const finishPixiv = (e) => {
    e.preventDefault();
    run(async () => {
      await api.pixivConnect(code);
      setLoginUrl(null);
      setCode('');
      setStatus(await api.studioStatus());
    });
  };
  const disconnectPixiv = () =>
    run(async () => {
      if (!window.confirm('Disconnect Pixiv? The Art search stops searching Pixiv until it is connected again.')) return;
      await api.pixivDisconnect();
      setStatus(await api.studioStatus());
    });

  return (
    <div className="card settings-card">
      <h3>🎨 Art sources</h3>
      <p className="muted small">
        The Art search looks through Danbooru, Yande.re, Konachan, Zerochan and Wallhaven. Pixiv (and Gelbooru) need a login first.
      </p>
      {status && (
        <div className="studio-settings">
          <p className="small">
            <b>Pixiv:</b>{' '}
            {status.pixiv.connected ? (
              <>
                connected{status.pixiv.user ? ` as ${status.pixiv.user}` : ''}{' '}
                <button type="button" className="link-btn" onClick={disconnectPixiv} disabled={busy}>
                  disconnect
                </button>
              </>
            ) : (
              'not connected'
            )}
          </p>
          {!status.pixiv.connected && !loginUrl && (
            <button type="button" className="btn small-btn" onClick={startPixiv} disabled={busy}>
              Connect Pixiv
            </button>
          )}
          {loginUrl && (
            <form onSubmit={finishPixiv} className="verify-adult">
              <ol className="small">
                <li>
                  A Pixiv login page opened (or{' '}
                  <a href={loginUrl} target="_blank" rel="noreferrer">
                    open it here
                  </a>
                  ). <b>Before logging in</b>, open the browser's developer tools (F12) on that tab, on the <b>Network</b> tab.
                </li>
                <li>Log in. The page then tries to open a <code>pixiv://account/login?code=…</code> address and stops.</li>
                <li>
                  In the Network list, find the request whose address contains <code>callback?state=</code> or <code>code=</code>, copy that address, and paste it here. Be quick:
                  the code is only valid for about a minute.
                </li>
              </ol>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="pixiv://account/login?code=… or just the code" required />
              <button type="submit" className="primary" disabled={busy || !code.trim()}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </form>
          )}
          <p className="muted tiny">
            The Pixiv connection is used for everyone on this server; the login token stays on the server. Pixiv shows only work-safe
            pictures in the Art search.
            {status.sources.some((s) => s.key === 'gelbooru' && !s.available) && ' Gelbooru needs GELBOORU_API_KEY and GELBOORU_USER_ID in the server config.'}
          </p>
        </div>
      )}
      {error && <p className="error-text small">{error}</p>}
    </div>
  );
}

const SPICY_LEVELS = [
  { level: 0, label: 'Off' },
  { level: 1, label: '🌶️ Spicy' },
  { level: 2, label: '🔞 Explicit' },
];

// Per person: suggestive or explicit fan art, only for known adult characters.
function SpicySetting() {
  const { me, setMe } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const level = Number(me.spicyArt) || 0;
  const on = level > 0;
  const choose = async (next) => {
    if (next === level) return;
    if (next === 2 && !window.confirm('Explicit shows nudity and sexual fan art of adult characters. Only switch this on if you are 18 or older.')) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.setSpicy(next);
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
        <b>Spicy</b> adds suggestive fan art (fanservice, swimsuits, lingerie, suggestive poses) from Danbooru, Zerochan and Wallhaven, without nudity.{' '}
        <b>Explicit</b> also adds nudity and sexual fan art (Danbooru questionable/explicit, Zerochan nudity). Both are only for characters the app
        knows are adults (18+ on AniList, in their description, on MyAnimeList, or verified below), never with tags that suggest a minor; everyone
        else keeps the normal art. This only changes your account; pictures you save stay hidden for anyone on a lower level.
      </p>
      <div className="segmented" role="radiogroup" aria-label="Spicy art level">
        {SPICY_LEVELS.map((l) => (
          <button
            key={l.level}
            type="button"
            role="radio"
            aria-checked={level === l.level}
            className={level === l.level ? 'active' : ''}
            onClick={() => choose(l.level)}
            disabled={busy}
          >
            {l.label}
          </button>
        ))}
      </div>
      {error && <p className="error-text small">{error}</p>}
      {on && <AgeOverview />}
    </div>
  );
}

const BASIS = { anilist: 'AniList', description: 'description', myanimelist: 'MyAnimeList', manual: 'verified' };

const adultLabel = (c) =>
  `${Math.round(c.age)}${c.basis === 'manual' ? ` · verified by ${c.verifiedBy ?? 'someone'}` : c.basis && c.basis !== 'anilist' ? ` · ${BASIS[c.basis]}` : ''}`;

// Verify a character with no known age as an adult, by hand.
// `remaining`: how many unknown characters come after this one ("Verify & next").
function VerifyAdult({ character, remaining = 0, onClose, onDone, onSkip }) {
  const [age, setAge] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const n = Number(age);
  const valid = Number.isInteger(n) && n >= 18 && sure;
  const submit = async (e, next = remaining > 0) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.verifyAdult(character.id, n);
      onDone(character, n, next);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Verify ${character.name} as an adult`} onClose={onClose}>
      {character.image && <img className="verify-adult-img" src={character.image} alt="" />}
      <form onSubmit={submit} className="verify-adult">
        <p className="muted small">
          No age was found on AniList, in their description or on MyAnimeList. Only verify if you know from the source material that this character
          is an adult (18+). This applies for everyone using this app, and shows that you verified it. If a source later gives an age, that age
          wins.
        </p>
        <label>
          Age in canon
          <input type="number" min="18" step="1" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 24" required autoFocus />
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span className="small">I've checked that {character.name} is an adult in canon, not a younger version.</span>
        </label>
        {error && <p className="error-text small">{error}</p>}
        <div className="verify-adult-actions">
          {remaining > 0 && (
            <button type="submit" className="primary" disabled={!valid || busy}>
              {busy ? 'Saving…' : `Verify & next (${remaining} left)`}
            </button>
          )}
          <button type="button" className={remaining > 0 ? '' : 'primary'} disabled={!valid || busy} onClick={(e) => submit(e, false)}>
            {remaining > 0 ? 'Verify & close' : busy ? 'Saving…' : 'Verify as adult'}
          </button>
          {remaining > 0 && (
            <button type="button" className="ghost" onClick={onSkip} disabled={busy}>
              Skip / not sure
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// What the adults-only rule knows about the characters in your lists.
function AgeOverview() {
  const [data, setData] = useState(null);
  const { me } = useApp();
  const [verifying, setVerifying] = useState(null);
  const [skipped, setSkipped] = useState(new Set());
  const [error, setError] = useState(null);
  const load = () => api.spicyAges().then(setData).catch(() => setData(null));
  useEffect(() => {
    load();
  }, []);
  if (!data) return null;
  // Checked unknown characters after `c` in the list, minus skipped ones.
  const nextUnknown = (c, skip) => {
    const list = data.unknown.filter((u) => u.checked);
    const i = list.findIndex((u) => u.id === c.id);
    return list.slice(i + 1).filter((u) => !skip.has(u.id));
  };
  const unverify = async (c) => {
    setError(null);
    try {
      await api.unverifyAdult(c.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const chip = (c, label, action) => (
    <span key={c.id} className="age-chip">
      <a href={`#/character/${c.id}`} title={label}>
        {c.image && <img src={c.image} alt="" />}
        <span>{c.name.split(' ')[0]}</span>
        {label && <span className="muted tiny">{label}</span>}
      </a>
      {action}
    </span>
  );
  return (
    <div className="age-overview">
      <p className="small">
        ✓ <b>{data.adults.length}</b> adults · 🚫 <b>{data.minors.length}</b> under 18 · ❓ <b>{data.unknown.length}</b> no known age
      </p>
      {data.adults.length > 0 && (
        <div className="age-chips">
          {data.adults.map((c) =>
            chip(
              c,
              adultLabel(c),
              c.basis === 'manual' && (
                <button type="button" className="age-chip-action" title="Undo verification" onClick={() => unverify(c)}>
                  ✕
                </button>
              ),
            ),
          )}
        </div>
      )}
      {error && <p className="error-text small">{error}</p>}
      {data.unknown.length > 0 && (
        <>
          <p className="muted small">
            No age found on AniList, in the description or on MyAnimeList yet, so these get normal art only. They're checked again every few days
            {data.unknown.some((c) => !c.checked) ? ' (some are still being checked right now)' : ''}. If you know one is an adult, tap ✓ to verify
            them.
          </p>
          <div className="age-chips">
            {data.unknown.map((c) =>
              chip(
                c,
                c.checked ? null : 'checking…',
                c.checked && (
                  <button type="button" className="age-chip-action" title="Verify as adult" onClick={() => setVerifying(c)}>
                    ✓
                  </button>
                ),
              ),
            )}
          </div>
        </>
      )}
      {verifying && (
        <VerifyAdult
          key={verifying.id}
          character={verifying}
          remaining={nextUnknown(verifying, skipped).length}
          onClose={() => {
            setVerifying(null);
            setSkipped(new Set());
          }}
          onSkip={() => {
            const s = new Set(skipped).add(verifying.id);
            setSkipped(s);
            setVerifying(nextUnknown(verifying, s)[0] ?? null);
          }}
          onDone={(c, age, next) => {
            // Move the character to the adults locally instead of reloading everything.
            const after = nextUnknown(c, skipped)[0] ?? null;
            setData((d) => ({
              ...d,
              unknown: d.unknown.filter((u) => u.id !== c.id),
              adults: [...d.adults, { ...c, age, basis: 'manual', verifiedBy: me.username }],
            }));
            setVerifying(next ? after : null);
            if (!next) setSkipped(new Set());
          }}
        />
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
      <ArtSourcesSetting />
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
