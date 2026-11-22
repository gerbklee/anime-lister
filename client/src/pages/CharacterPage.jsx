import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { formatLabel, plural } from '../util.js';
import AddToListMenu from '../components/AddToListMenu.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';
import { CatalogueBadge } from '../components/EntryRow.jsx';
import { FanartTab, SimpleTab } from '../components/ImagePicker.jsx';
import { formatPopularity } from '../components/AnimeTile.jsx';
import { RichText, splitFacts } from '../components/RichText.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROLE_LABELS = { MAIN: 'Main', SUPPORTING: 'Supporting', BACKGROUND: 'Background' };

function birthdayText(b) {
  if (!b) return null;
  return [b.day, b.month ? MONTHS[b.month - 1] : null, b.year].filter(Boolean).join(' ');
}

function SpoilerChip({ text }) {
  const [shown, setShown] = useState(false);
  return (
    <button type="button" className={`chip small ${shown ? '' : 'chip-spoiler'}`} onClick={() => setShown(true)} title={shown ? undefined : 'Spoiler: tap to show'}>
      {shown ? text : '⚠️ spoiler name'}
    </button>
  );
}

function Lightbox({ url, name, onClose }) {
  const { setMe, refreshLists } = useApp();
  const [status, setStatus] = useState(null);
  const usePhoto = async () => {
    setStatus('Saving…');
    try {
      setMe(await api.setAvatar(url));
      refreshLists();
      setStatus('✓ Set as your profile photo');
    } catch (err) {
      setStatus(err.message);
    }
  };
  return (
    <Modal title={name} onClose={onClose} wide center>
      <div className="lightbox">
        <img src={url} alt={name} referrerPolicy="no-referrer" />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={usePhoto}>
          👤 Use as profile photo
        </button>
        <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
          Open original ↗
        </a>
        {status && <span className="muted small">{status}</span>}
      </div>
    </Modal>
  );
}

// Inline gallery with the same sources as the picture picker.
function Gallery({ characterId, name }) {
  const [tab, setTab] = useState('anilist');
  const [visited, setVisited] = useState({ anilist: true });
  const [open, setOpen] = useState(null);
  const loaders = useMemo(
    () => ({ anilist: () => api.anilistImages(characterId), mal: () => api.malImages(characterId) }),
    [characterId],
  );
  const tabs = [
    ['anilist', 'AniList'],
    ['mal', 'MyAnimeList'],
    ['fanart', 'Fan art'],
  ];
  return (
    <div className="card">
      <h3>🖼️ Pictures</h3>
      <div className="tabs compact" role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => {
              setTab(key);
              setVisited((v) => ({ ...v, [key]: true }));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="gallery-body">
        {visited.anilist && (
          <div hidden={tab !== 'anilist'}>
            <SimpleTab load={loaders.anilist} onSelect={setOpen} />
          </div>
        )}
        {visited.mal && (
          <div hidden={tab !== 'mal'}>
            <SimpleTab load={loaders.mal} onSelect={setOpen} />
          </div>
        )}
        {visited.fanart && (
          <div hidden={tab !== 'fanart'}>
            <FanartTab characterId={characterId} onSelect={setOpen} />
          </div>
        )}
      </div>
      {open && <Lightbox url={open} name={name} onClose={() => setOpen(null)} />}
    </div>
  );
}

export default function CharacterPage({ id }) {
  const { me } = useApp();
  const [c, setC] = useState(null);
  const [error, setError] = useState(null);
  const [showAllMedia, setShowAllMedia] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .character(id)
      .then((d) => !cancelled && setC(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <div className="banner error">{error}</div>;
  if (!c) return <p className="muted">Loading…</p>;

  const { facts, body } = splitFacts(c.description);
  const basics = [
    ['Gender', c.gender],
    ['Birthday', birthdayText(c.birthday)],
    ['Age', c.age],
    ['Blood type', c.bloodType],
  ].filter(([, v]) => v);
  const anime = c.appearances.filter((a) => a.type === 'ANIME');
  const manga = c.appearances.filter((a) => a.type === 'MANGA');
  const myLists = c.lists.filter((l) => l.owner?.id === me.id || l.list.isShared);
  const otherLists = c.lists.filter((l) => !myLists.includes(l));
  const mainRole = c.appearances.find((a) => a.role === 'MAIN') ? 'Main character' : c.appearances[0] ? `${ROLE_LABELS[c.appearances[0].role] ?? ''} character` : null;

  const appearanceTiles = (items) => (
    <ul className="appear-grid">
      {items.map((a) => {
        const href = a.type === 'ANIME' ? `#/anime/${a.id}` : `https://anilist.co/manga/${a.id}`;
        const external = a.type !== 'ANIME';
        return (
          <li key={a.id}>
            <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="appear">
              <span className="appear-cover" style={{ '--cover-color': a.color || 'var(--surface-2)' }}>
                {a.cover && <img src={a.cover} alt="" loading="lazy" />}
              </span>
              <span className="appear-title">{a.title}</span>
              <span className="muted tiny">
                {[formatLabel(a.format), a.seasonYear].filter(Boolean).join(' · ')} · <span className={`role-tag ${a.role?.toLowerCase()}`}>{ROLE_LABELS[a.role]}</span>
              </span>
            </a>
            {a.type === 'ANIME' && <CatalogueBadge animeId={a.id} />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="character-page">
      <div className="char-hero card">
        {c.image && <img className="char-portrait" src={c.image} alt={c.name} />}
        <div className="char-hero-text">
          <h2>{c.name}</h2>
          {c.native && <div className="muted">{c.native}</div>}
          {mainRole && anime[0] && (
            <div className="small">
              {mainRole} in <a href={`#/anime/${anime[0].id}`}>{anime[0].title}</a>
            </div>
          )}
          <div className="muted small">❤ {formatPopularity(c.favourites)} favourites on AniList</div>
          {(c.alternative.length > 0 || c.alternativeSpoiler.length > 0) && (
            <div className="alias-chips">
              <span className="muted tiny">Also known as</span>
              {c.alternative.map((n) => (
                <span key={n} className="chip small">
                  {n}
                </span>
              ))}
              {c.alternativeSpoiler.map((n) => (
                <SpoilerChip key={n} text={n} />
              ))}
            </div>
          )}
          <div className="char-actions">
            <AddToListMenu kind="character" itemId={c.id} label="+ Add to list" />
            <a className="btn ghost" href={c.siteUrl} target="_blank" rel="noreferrer">
              AniList ↗
            </a>
          </div>
        </div>
      </div>

      <div className="anime-columns">
        <div className="anime-col">
          {(basics.length > 0 || facts.length > 0) && (
            <div className="card">
              <h3>Profile</h3>
              <dl className="facts">
                {basics.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>
                      <RichText text={f.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {body && (
            <div className="card">
              <h3>About</h3>
              <p className="char-description">
                <RichText text={body} />
              </p>
            </div>
          )}

          <Gallery characterId={c.id} name={c.name} />
        </div>

        <div className="anime-col">
          {c.lists.length > 0 && (
            <div className="card">
              <h3>In lists</h3>
              <div className="char-chips">
                {[...myLists, ...otherLists].map((l) => (
                  <a key={l.entryId} className="char-chip" href={`#/list/${l.list.id}`}>
                    {l.image && <img src={l.image} alt="" loading="lazy" />}
                    <span>
                      <b>
                        #{l.rank} <span className="muted small">of {l.list.size}</span>
                      </b>
                      <span className="muted tiny">
                        {l.list.name}
                        {l.owner && l.owner.id !== me.id && ` · ${l.owner.username}`}
                        {l.list.isShared && ' · 👥'}
                      </span>
                      {l.note && <span className="tiny note-inline">“{l.note}”</span>}
                    </span>
                    {l.owner && <Avatar user={l.owner} size={20} />}
                  </a>
                ))}
              </div>
            </div>
          )}

          {c.voiceActors.length > 0 && (
            <div className="card">
              <h3>🎙️ Voice actors</h3>
              <ul className="va-list">
                {c.voiceActors.map((va) => (
                  <li key={`${va.language}-${va.id}`}>
                    <a href={`https://anilist.co/staff/${va.id}`} target="_blank" rel="noreferrer">
                      {va.image && <img src={va.image} alt="" loading="lazy" />}
                      <span>
                        <b>{va.name}</b>
                        <span className="muted tiny">
                          {va.language}
                          {va.native && va.native !== va.name ? ` · ${va.native}` : ''}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {anime.length > 0 && (
            <div className="card">
              <h3>
                🎬 Anime <span className="muted small">({anime.length})</span>
              </h3>
              {appearanceTiles(showAllMedia ? anime : anime.slice(0, 6))}
              {anime.length > 6 && (
                <button className="link-btn small" onClick={() => setShowAllMedia((s) => !s)}>
                  {showAllMedia ? 'Show less' : `Show all ${plural(anime.length, 'anime', 'anime')}`}
                </button>
              )}
            </div>
          )}

          {manga.length > 0 && (
            <div className="card">
              <h3>
                📖 Manga & novels <span className="muted small">({manga.length})</span>
              </h3>
              {appearanceTiles(manga.slice(0, 6))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
