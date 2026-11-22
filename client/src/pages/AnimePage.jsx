import { useCallback, useEffect, useMemo, useState } from 'react';
import { animeSearch, api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { STATUS_LABELS, animeMeta, parseDate, plural } from '../util.js';
import SearchBox from '../components/SearchBox.jsx';
import Stars from '../components/Stars.jsx';
import Modal from '../components/Modal.jsx';

const TABS = ['watched', 'watching', 'dropped'];

function QuickAdd({ result, onSave, onClose }) {
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
                {STATUS_LABELS[s]}
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
  return (
    <li className="anime-card">
      <a href={`#/anime/${a.id}`} className="anime-card-cover" style={{ '--cover-color': a.color || 'var(--surface-2)' }}>
        {a.cover && <img src={a.cover} alt={a.title} loading="lazy" />}
        {item.review && (
          <span className="card-flag" title="Has a review">
            📝
          </span>
        )}
      </a>
      <div className="anime-card-body">
        <a href={`#/anime/${a.id}`} className="anime-card-title" title={a.title}>
          {a.title}
        </a>
        <div className="muted tiny">{animeMeta(a)}</div>
        <Stars value={item.rating} readOnly={!editable} size={17} onChange={(rating) => onChange({ rating })} />
        {item.status === 'watching' && (
          <div className="progress">
            {editable && (
              <button className="icon-btn" onClick={() => onChange({ progress: Math.max(0, item.progress - 1) })} aria-label="One episode back">
                −
              </button>
            )}
            <span className="small">
              Ep {item.progress}
              {a.episodes ? ` / ${a.episodes}` : ''}
            </span>
            {editable && (
              <button className="icon-btn" onClick={() => onChange({ progress: item.progress + 1 })} aria-label="One more episode">
                +
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// A user's anime catalogue: watched / watching / dropped, with ratings.
export default function AnimePage({ userId }) {
  const { me, users, navigate, refreshCatalogue } = useApp();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('watched');
  const [sort, setSort] = useState('recent');
  const [adding, setAdding] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const isMe = userId === me.id;
  const owner = users.find((u) => u.id === userId);

  const load = useCallback(async () => {
    try {
      setItems(await api.catalogue(userId));
    } catch (err) {
      setError(err.message);
    }
  }, [userId]);

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
    setNotice(
      status === 'watched' ? (
        <>
          Added {result.name}. <a href={`#/anime/${result.id}/suggest`}>Write a review or rank its characters →</a>
        </>
      ) : (
        `Added ${result.name}.`
      ),
    );
  };

  return (
    <section className="catalogue">
      <div className="catalogue-header">
        <h2>{isMe ? 'My anime' : `${owner?.username ?? 'Someone'}'s anime`}</h2>
        <select
          value={userId}
          onChange={(e) => navigate(Number(e.target.value) === me.id ? '#/anime' : `#/anime/u/${e.target.value}`)}
          aria-label="Whose anime"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === me.id ? 'Me' : u.username}
            </option>
          ))}
        </select>
      </div>

      {isMe && (
        <SearchBox
          search={animeSearch}
          existingIds={existingIds}
          existingLabel="Added"
          addLabel="+ Add"
          placeholder="Search for an anime you've seen or are watching…"
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
              {STATUS_LABELS[s]} <span className="muted small">{counts[s]}</span>
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
                ? 'Nothing here yet. Search above to add the anime you have seen.'
                : `No anime marked as ${STATUS_LABELS[tab].toLowerCase()}.`
              : `${owner?.username ?? 'They'} has no anime here yet.`}
          </p>
        </div>
      ) : (
        <>
          <p className="muted small">{plural(shown.length, 'anime', 'anime')}</p>
          <ul className="anime-grid">
            {shown.map((item) => (
              <AnimeCard key={item.anime.id} item={item} editable={isMe} onChange={(patch) => save(item.anime.id, patch)} />
            ))}
          </ul>
        </>
      )}

      {adding && <QuickAdd result={adding} onClose={() => setAdding(null)} onSave={(v) => quickSave(adding, v)} />}
    </section>
  );
}
