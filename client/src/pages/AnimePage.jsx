import { useCallback, useEffect, useMemo, useState } from 'react';
import { animeSearch, api, mangaSearch } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { animeMeta, mediaHref, parseDate, plural, statusLabel } from '../util.js';
import SearchBox from '../components/SearchBox.jsx';
import Stars from '../components/Stars.jsx';
import Modal from '../components/Modal.jsx';

const TABS = ['watched', 'watching', 'dropped'];

function QuickAdd({ result, type, onSave, onClose }) {
  const [status, setStatus] = useState('watched');
  const [rating, setRating] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({ status, rating });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Add ${result.name}`} onClose={onClose}>
      <div className="quick-add">
        {result.image && <img className="cover small" src={result.image} alt="" />}
        <div className="quick-add-fields">
          <div className="segmented">
            {TABS.map((s) => (
              <button key={s} type="button" className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
                {statusLabel(s, type)}
              </button>
            ))}
          </div>
          <div className="field">
            <span>Your rating (optional)</span>
            <Stars value={rating} onChange={setRating} size={30} />
          </div>
        </div>
      </div>
      {error && <p className="error-text small">{error}</p>}
      <div className="modal-actions">
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Add to catalogue'}
        </button>
      </div>
    </Modal>
  );
}

function AnimeCard({ item, editable, onChange }) {
  const a = item.anime;
  const manga = a.type === 'MANGA';
  const total = manga ? a.chapters : a.episodes;
  return (
    <li className="anime-card">
      <a href={mediaHref(a)} className="anime-card-cover" style={{ '--cover-color': a.color || 'var(--surface-2)' }}>
        {a.cover && <img src={a.cover} alt={a.title} loading="lazy" />}
        {item.review && (
          <span className="card-flag" title="Has a review">
            📝
          </span>
        )}
      </a>
      <div className="anime-card-body">
        <a href={mediaHref(a)} className="anime-card-title" title={a.title}>
          {a.title}
        </a>
        <div className="muted tiny">{animeMeta(a)}</div>
        <Stars value={item.rating} readOnly={!editable} size={17} onChange={(rating) => onChange({ rating })} />
        {item.status === 'watching' && (
          <div className="progress">
            {editable && (
              <button className="icon-btn" onClick={() => onChange({ progress: Math.max(0, item.progress - 1) })} aria-label="One back">
                −
              </button>
            )}
            <span className="small">
              {manga ? 'Ch' : 'Ep'} {item.progress}
              {total ? ` / ${total}` : ''}
            </span>
            {editable && (
              <button className="icon-btn" onClick={() => onChange({ progress: item.progress + 1 })} aria-label="One more">
                +
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// A user's anime or manga catalogue: watched/read, watching/reading, dropped.
export default function AnimePage({ userId, type = 'ANIME' }) {
  const { me, users, navigate, refreshCatalogue } = useApp();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('watched');
  const [sort, setSort] = useState('recent');
  const [adding, setAdding] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const manga = type === 'MANGA';
  const word = manga ? 'manga' : 'anime';
  const isMe = userId === me.id;
  const owner = users.find((u) => u.id === userId);

  const load = useCallback(async () => {
    try {
      setItems(await api.catalogue(userId, type));
    } catch (err) {
      setError(err.message);
    }
  }, [userId, type]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { watched: 0, watching: 0, dropped: 0 };
    for (const i of items ?? []) c[i.status] += 1;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const list = (items ?? []).filter((i) => i.status === tab);
    if (sort === 'rating') list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.anime.title.localeCompare(b.anime.title));
    else if (sort === 'title') list.sort((a, b) => a.anime.title.localeCompare(b.anime.title));
    else list.sort((a, b) => parseDate(b.updatedAt) - parseDate(a.updatedAt));
    return list;
  }, [items, tab, sort]);

  const existingIds = useMemo(() => new Set((items ?? []).map((i) => i.anime.id)), [items]);

  const save = async (animeId, patch) => {
    try {
      await api.setCatalogue(animeId, patch);
      await load();
      refreshCatalogue();
    } catch (err) {
      setError(err.message);
    }
  };

  const quickSave = async (result, { status, rating }) => {
    await api.setCatalogue(result.id, rating ? { status, rating } : { status });
    await load();
    refreshCatalogue();
    setTab(status);
    const href = manga ? `#/manga/${result.id}` : `#/anime/${result.id}/suggest`;
    setNotice(
      status === 'watched' ? (
        <>
          Added {result.name}. <a href={href}>{manga ? 'Write a review →' : 'Write a review or rank its characters →'}</a>
        </>
      ) : (
        `Added ${result.name}.`
      ),
    );
  };

  const profileBase = (id) => (id === me.id ? '#/profile' : `#/profile/u/${id}`);

  return (
    <section className="catalogue">
      <div className="catalogue-header">
        <span className="muted small">Show the {word} of</span>
        <select value={userId} onChange={(e) => navigate(`${profileBase(Number(e.target.value))}${manga ? '/manga' : ''}`)} aria-label={`Whose ${word}`}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === me.id ? 'Me' : u.username}
            </option>
          ))}
        </select>
      </div>

      {isMe && (
        <SearchBox
          search={manga ? mangaSearch : animeSearch}
          existingIds={existingIds}
          existingLabel="Added"
          addLabel="+ Add"
          placeholder={manga ? "Search for a manga you've read or are reading…" : "Search for an anime you've seen or are watching…"}
          onAdd={async (r) => setAdding(r)}
        />
      )}

      {notice && (
        <div className="banner info">
          <span>{notice}</span>
          <button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {error && (
        <div className="banner error">
          <span>{error}</span>
          <button className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="catalogue-controls">
        <div className="tabs compact" role="tablist">
          {TABS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tab === s} className={tab === s ? 'active' : ''} onClick={() => setTab(s)}>
              {statusLabel(s, type)} <span className="muted small">{counts[s]}</span>
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="recent">Recently updated</option>
          <option value="rating">Rating</option>
          <option value="title">Title</option>
        </select>
      </div>

      {items === null ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <p className="muted">
            {isMe
              ? tab === 'watched'
                ? `Nothing here yet. Search above to add the ${word} you have ${manga ? 'read' : 'seen'}.`
                : `No ${word} marked as ${statusLabel(tab, type).toLowerCase()}.`
              : `${owner?.username ?? 'They'} has no ${word} here yet.`}
          </p>
        </div>
      ) : (
        <>
          <p className="muted small">{plural(shown.length, word, word)}</p>
          <ul className="anime-grid">
            {shown.map((item) => (
              <AnimeCard key={item.anime.id} item={item} editable={isMe} onChange={(patch) => save(item.anime.id, patch)} />
            ))}
          </ul>
        </>
      )}

      {adding && <QuickAdd result={adding} type={type} onClose={() => setAdding(null)} onSave={(v) => quickSave(adding, v)} />}
    </section>
  );
}
