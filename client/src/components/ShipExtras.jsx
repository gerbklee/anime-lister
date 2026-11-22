import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { VOTES, timeAgo } from '../util.js';
import Avatar from './Avatar.jsx';
import Modal from './Modal.jsx';
import Reactions from './Reactions.jsx';
import Thread from './Thread.jsx';

// ---- Tropes ----------------------------------------------------------------------------------

export function TropeEditor({ ship, onChange }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(null);
  const [chosen, setChosen] = useState(ship.tropes ?? []);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => setChosen(ship.tropes ?? []), [ship.tropes]);
  useEffect(() => {
    if (open && !options) api.shipTropes().then(setOptions).catch((err) => setError(err.message));
  }, [open, options]);

  const toggle = (name) => setChosen((c) => (c.includes(name) ? c.filter((x) => x !== name) : c.length >= 10 ? c : [...c, name]));
  const addCustom = (e) => {
    e.preventDefault();
    const name = custom.trim();
    if (name.length >= 2 && !chosen.some((c) => c.toLowerCase() === name.toLowerCase())) toggle(name);
    setCustom('');
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.setShipTropes(ship.id, chosen);
      onChange(r.tropes);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const emojiOf = (name) => options?.fixed.find((t) => t.name === name)?.emoji ?? '🏷️';
  const extraChosen = chosen.filter((c) => !options?.fixed.some((t) => t.name === c) && !options?.custom.some((t) => t.name === c));

  return (
    <div className="trope-row">
      {(ship.tropes ?? []).map((t) => (
        <span key={t} className="trope-chip">
          {t}
        </span>
      ))}
      <button type="button" className="trope-chip add" onClick={() => setOpen(true)}>
        {ship.tropes?.length ? '✏️ Tropes' : '+ Add tropes'}
      </button>
      {open && (
        <Modal title="🏷️ Tropes" onClose={() => setOpen(false)}>
          <p className="muted small">Pick up to 10. They're shared, so both of you see and can change them.</p>
          {error && <div className="banner error">{error}</div>}
          {!options ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <div className="trope-options">
                {[...options.fixed, ...options.custom].map((t) => (
                  <button key={t.name} type="button" className={`trope-option ${chosen.includes(t.name) ? 'on' : ''}`} onClick={() => toggle(t.name)}>
                    {t.emoji} {t.name}
                    {t.count > 0 && <span className="muted tiny"> {t.count}</span>}
                  </button>
                ))}
                {extraChosen.map((name) => (
                  <button key={name} type="button" className="trope-option on" onClick={() => toggle(name)}>
                    {emojiOf(name)} {name}
                  </button>
                ))}
              </div>
              <form className="trope-custom" onSubmit={addCustom}>
                <input value={custom} maxLength={40} onChange={(e) => setCustom(e.target.value)} placeholder="Your own, e.g. Coffee shop AU" aria-label="Custom trope" />
                <button type="submit" className="btn ghost" disabled={custom.trim().length < 2}>
                  Add
                </button>
              </form>
            </>
          )}
          <div className="modal-actions">
            <span className="muted small">{chosen.length}/10</span>
            <div className="spacer" />
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- Moments -----------------------------------------------------------------------------------

function Moment({ m, onDelete }) {
  const { me } = useApp();
  const [shown, setShown] = useState(!m.hidden);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(m.commentCount);
  return (
    <li className="moment">
      <div className="moment-dot" aria-hidden="true" />
      <div className="moment-body">
        <div className="moment-head">
          {m.anime ? (
            <a href={`#/anime/${m.anime.id}`} className="moment-anime">
              {m.anime.title}
            </a>
          ) : (
            <span className="muted small">Somewhere</span>
          )}
          {m.episode != null && <span className="pill tiny">Ep {m.episode}</span>}
          <div className="spacer" />
          {m.user?.id === me.id && (
            <button type="button" className="icon-btn danger small" onClick={() => onDelete(m)} aria-label="Delete moment" title="Delete">
              ✕
            </button>
          )}
        </div>
        {shown ? (
          <p className="moment-text">{m.body}</p>
        ) : (
          <button type="button" className="moment-spoiler" onClick={() => setShown(true)}>
            ⚠️ {m.episode != null ? `Spoiler for episode ${m.episode}` : 'Spoiler'}: tap to show
          </button>
        )}
        <div className="entry-social">
          <Avatar user={m.user} size={16} />
          <span className="muted tiny">{timeAgo(m.createdAt)}</span>
          <Reactions target={m.thread} initial={m.reactions} emojis={['😭', '🔥', '❤️', '😳']} />
          <button type="button" className="link-btn small" onClick={() => setOpen((o) => !o)}>
            💬 {count || ''}
          </button>
        </div>
        {open && <Thread thread={m.thread} onCount={setCount} placeholder="Reply…" autoFocus />}
      </div>
    </li>
  );
}

export function MomentsCard({ ship, extra, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [animeId, setAnimeId] = useState('');
  const [episode, setEpisode] = useState('');
  const [body, setBody] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const anime = extra.memberAnime.find((a) => String(a.id) === animeId);
      await api.addMoment(ship.id, { animeId: anime?.id ?? null, animeTitle: anime?.title ?? null, episode: episode === '' ? null : Number(episode), body: body.trim(), spoiler });
      setBody('');
      setEpisode('');
      setSpoiler(false);
      setAdding(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (m) => {
    if (!window.confirm('Delete this moment?')) return;
    await api.deleteMoment(m.id).catch(() => {});
    onChanged();
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>📍 Moments</h3>
        <button type="button" className="btn ghost small-btn" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Close' : '+ Moment'}
        </button>
      </div>
      {adding && (
        <form className="moment-form" onSubmit={add}>
          <div className="moment-form-row">
            <select value={animeId} onChange={(e) => setAnimeId(e.target.value)} aria-label="Anime">
              <option value="">Anime (optional)</option>
              {extra?.memberAnime.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
            <input type="number" min="0" inputMode="numeric" placeholder="Ep." value={episode} onChange={(e) => setEpisode(e.target.value)} aria-label="Episode" />
          </div>
          <textarea rows={2} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. The rooftop scene 😭" required />
          <div className="moment-form-row">
            <label className="check small">
              <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} /> Spoiler
            </label>
            <div className="spacer" />
            <button className="btn primary small-btn" type="submit" disabled={!body.trim() || busy}>
              Add
            </button>
          </div>
          <p className="muted tiny">With an episode, it stays hidden for anyone who hasn't watched that far.</p>
          {error && <div className="banner error">{error}</div>}
        </form>
      )}
      {!extra ? (
        <p className="muted small">Loading…</p>
      ) : extra.moments.length === 0 ? (
        <p className="muted small">The moments that made you ship it: scenes, episodes, quotes.</p>
      ) : (
        <ol className="moments">
          {extra.moments.map((m) => (
            <Moment key={m.id} m={m} onDelete={remove} />
          ))}
        </ol>
      )}
    </div>
  );
}

// ---- Anthem ------------------------------------------------------------------------------------

export function AnthemCard({ ship, extra, onChanged }) {
  const [picking, setPicking] = useState(false);
  const [animeId, setAnimeId] = useState('');
  const [themes, setThemes] = useState(null);
  const [error, setError] = useState(null);
  const anthem = extra?.anthem;

  useEffect(() => {
    if (!animeId) return;
    setThemes(null);
    setError(null);
    api
      .themes(Number(animeId))
      .then((d) => setThemes(d.themes))
      .catch((err) => setError(err.message));
  }, [animeId]);

  const choose = async (t) => {
    const anime = extra.memberAnime.find((a) => String(a.id) === animeId);
    await api.setAnthem(ship.id, { animeId: anime?.id, animeTitle: anime?.title, slug: t.slug, title: t.title, artists: t.artists, video: t.video });
    setPicking(false);
    onChanged();
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>🎵 Ship anthem</h3>
        <button type="button" className="btn ghost small-btn" onClick={() => setPicking(true)}>
          {anthem ? 'Change' : 'Choose'}
        </button>
      </div>
      {anthem ? (
        <>
          <p className="small anthem-title">
            <b>{anthem.title || anthem.slug}</b>
            {anthem.artists?.length > 0 && <span className="muted"> · {anthem.artists.join(', ')}</span>}
            <span className="muted tiny"> ({anthem.animeTitle} {anthem.slug})</span>
          </p>
          <video className="anthem-video" src={anthem.video} controls preload="none" playsInline />
        </>
      ) : (
        <p className="muted small">Pick an opening or ending as this ship's theme song.</p>
      )}
      {picking && (
        <Modal title="🎵 Choose the anthem" onClose={() => setPicking(false)}>
          <select value={animeId} onChange={(e) => setAnimeId(e.target.value)} aria-label="Anime">
            <option value="">Pick an anime…</option>
            {extra?.memberAnime.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          {error && <p className="muted small">{error}</p>}
          {animeId && !themes && !error && <p className="muted small">Loading songs…</p>}
          {themes && themes.length === 0 && <p className="muted small">No openings or endings found for this one.</p>}
          {themes && (
            <ul className="anthem-options">
              {themes.map((t) => (
                <li key={t.id}>
                  <button type="button" className="menu-item" onClick={() => choose(t)}>
                    <span className="pill tiny">{t.slug}</span>
                    <span className="menu-item-name">{t.title ?? 'Untitled'}</span>
                    <span className="muted tiny">{t.artists.join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {anthem && (
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost danger"
                onClick={async () => {
                  await api.setAnthem(ship.id, null);
                  setPicking(false);
                  onChanged();
                }}
              >
                Remove anthem
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ---- Vote history ----------------------------------------------------------------------------

export function VoteHistory({ extra }) {
  const { me } = useApp();
  const rows = (extra?.history ?? []).filter((h) => h.changes.length > 1);
  if (!rows.length) return null;
  return (
    <div className="card">
      <h3>📈 Vote history</h3>
      <ul className="vote-history">
        {rows.map((h) => (
          <li key={h.user?.id}>
            <Avatar user={h.user} size={20} />
            <span className="small">{h.user?.id === me.id ? 'You' : h.user?.username}</span>
            <span className="history-steps">
              {h.changes.map((c, i) => (
                <span key={i} title={new Date(c.at).toLocaleDateString()}>
                  {i > 0 && <span className="muted"> → </span>}
                  {c.vote == null ? '·' : VOTES[c.vote].emoji}
                </span>
              ))}
            </span>
            <span className="muted tiny">{timeAgo(h.changes[h.changes.length - 1].at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
