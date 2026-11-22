import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

const TABS = [
  { key: 'anilist', label: 'AniList' },
  { key: 'mal', label: 'MyAnimeList' },
  { key: 'fanart', label: 'Fan art' },
];

function Grid({ images, selected, onSelect }) {
  if (!images.length) return <p className="muted small">No pictures found here.</p>;
  return (
    <div className="picker-grid">
      {images.map((img) => (
        <button
          key={img.full}
          type="button"
          className={`picker-item ${selected === img.full ? 'selected' : ''}`}
          onClick={() => onSelect(img.full)}
        >
          <img src={img.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </button>
      ))}
    </div>
  );
}

function FanartTab({ characterId, selected, onSelect }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const load = async (tag) => {
    setData(null);
    setError(null);
    try {
      const d = await api.fanartImages(characterId, tag);
      setData(d);
      if (d.tag) setTagInput(d.tag);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  useEffect(() => {
    const term = tagInput.trim();
    if (term.length < 2 || term === data?.tag) return undefined;
    const t = setTimeout(() => {
      api.fanartTags(term).then(setSuggestions).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [tagInput, data?.tag]);

  return (
    <div className="fanart">
      <form
        className="tag-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (tagInput.trim()) load(tagInput.trim());
        }}
      >
        <input
          list="fanart-tags"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Safebooru tag, e.g. levi_(shingeki_no_kyojin)"
          aria-label="Safebooru tag"
          autoCapitalize="none"
        />
        <datalist id="fanart-tags">
          {suggestions.map((s) => (
            <option key={s.tag} value={s.tag}>
              {s.count} pictures
            </option>
          ))}
        </datalist>
        <button className="btn ghost" type="submit">
          Search
        </button>
      </form>
      {data?.candidates?.length > 0 && (
        <div className="tag-chips">
          {data.candidates.slice(0, 6).map((c) => (
            <button
              key={c.tag}
              type="button"
              className={`chip small ${c.tag === data.tag ? 'active' : ''}`}
              onClick={() => load(c.tag)}
            >
              {c.tag} <span className="muted">{c.count}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="error-text small">{error}</p>}
      {!data && !error && <p className="muted small">Looking for fan art…</p>}
      {data && !data.tag && <p className="muted small">No matching tag found. Try searching for one above.</p>}
      {data?.tag && (
        <Grid images={data.images.map((i) => ({ thumb: i.thumb, full: i.full }))} selected={selected} onSelect={onSelect} />
      )}
      <p className="muted tiny">Fan art from Safebooru (work-safe images only). Matching is by tag, so check it's the right character.</p>
    </div>
  );
}

function SimpleTab({ load, selected, onSelect }) {
  const [images, setImages] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => !cancelled && setImages(d.images.map((u) => ({ thumb: u, full: u }))))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [load]);
  if (error) return <p className="error-text small">{error}</p>;
  if (!images) return <p className="muted small">Loading pictures…</p>;
  return <Grid images={images} selected={selected} onSelect={onSelect} />;
}

// Lets the user pick a picture of a character from AniList, MyAnimeList or Safebooru.
export default function ImagePicker({ characterId, title, onPick, onReset, onClose }) {
  const [tab, setTab] = useState('anilist');
  const [visited, setVisited] = useState({ anilist: true });
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Stable loaders so tabs keep their results when switching back and forth.
  const [loaders] = useState(() => ({
    anilist: () => api.anilistImages(characterId),
    mal: () => api.malImages(characterId),
  }));

  const choose = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => {
              setTab(t.key);
              setVisited((v) => ({ ...v, [t.key]: true }));
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="picker-body">
        {visited.anilist && (
          <div hidden={tab !== 'anilist'}>
            <SimpleTab load={loaders.anilist} selected={selected} onSelect={setSelected} />
          </div>
        )}
        {visited.mal && (
          <div hidden={tab !== 'mal'}>
            <SimpleTab load={loaders.mal} selected={selected} onSelect={setSelected} />
          </div>
        )}
        {visited.fanart && (
          <div hidden={tab !== 'fanart'}>
            <FanartTab characterId={characterId} selected={selected} onSelect={setSelected} />
          </div>
        )}
      </div>
      {error && <p className="error-text small">{error}</p>}
      <div className="modal-actions">
        {onReset && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => choose(onReset)}>
            Use original picture
          </button>
        )}
        <div className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!selected || busy} onClick={() => choose(() => onPick(selected))}>
          {busy ? 'Saving…' : 'Use this picture'}
        </button>
      </div>
    </Modal>
  );
}
