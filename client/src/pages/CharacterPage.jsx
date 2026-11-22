import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { formatLabel, plural } from '../util.js';
import AddToListMenu from '../components/AddToListMenu.jsx';
import Menu from '../components/Menu.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';
import { CatalogueBadge } from '../components/EntryRow.jsx';
import FanartBrowser from '../components/FanartBrowser.jsx';
import CropDialog from '../components/CropDialog.jsx';

// Use a picture as this character's portrait in one or more of your lists.
function UseInListsDialog({ url, lists, onClose, onDone }) {
  const [chosen, setChosen] = useState(() => new Set(lists.map((l) => l.entryId)));
  const toggle = (id) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <CropDialog
      title="Use in my lists"
      src={url}
      saveLabel={`Use in ${chosen.size} ${chosen.size === 1 ? 'list' : 'lists'}`}
      canSave={chosen.size > 0}
      onClose={onClose}
      onSave={async (crop) => {
        for (const id of chosen) await api.updateEntry(id, { imageUrl: url, crop });
        onDone();
      }}
    >
      <div className="use-in-lists">
        {lists.map((l) => (
          <label key={l.entryId} className="check">
            <input type="checkbox" checked={chosen.has(l.entryId)} onChange={() => toggle(l.entryId)} />
            <span>
              {l.list.name}
              <span className="muted tiny">
                {' '}
                #{l.rank}
                {l.list.isShared ? ' · 👥' : ''}
              </span>
            </span>
          </label>
        ))}
      </div>
    </CropDialog>
  );
}
import { formatPopularity } from '../components/AnimeTile.jsx';
import { RichText, splitFacts } from '../components/RichText.jsx';
import { ShipCover, StatusBadge, VoteChips } from '../components/ShipBits.jsx';
import ShipBuilder from '../components/ShipBuilder.jsx';
import { compactCount } from '../util.js';

// Ships with this character, and who fans usually pair them with (Safebooru).
function ShipsCard({ c }) {
  const { navigate } = useApp();
  const [ships, setShips] = useState(null);
  const [pairings, setPairings] = useState(null);
  const [pairError, setPairError] = useState(null);
  const [builder, setBuilder] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.ships({ character: c.id }).then((d) => !cancelled && setShips(d.ships)).catch(() => !cancelled && setShips([]));
    api
      .pairings(c.id)
      .then((d) => !cancelled && setPairings(d.pairings))
      .catch((err) => !cancelled && setPairError(err.message));
    return () => {
      cancelled = true;
    };
  }, [c.id]);

  const self = { id: c.id, name: c.name, image: c.image };
  const first = c.name.split(' ')[0];
  return (
    <div className="card">
      <h3>💕 Ships</h3>
      {ships === null ? (
        <p className="muted small">Loading…</p>
      ) : ships.length === 0 ? (
        <p className="muted small">No ships with {first} yet.</p>
      ) : (
        <ul className="mini-ships">
          {ships.map((s) => (
            <li key={s.id}>
              <a href={`#/ship/${s.id}`} className="mini-ship">
                <ShipCover ship={s} className="small" />
                <span>
                  <b>{s.name}</b>
                  <span className="muted tiny">{s.members.filter((m) => m.id !== c.id).map((m) => m.name).join(', ')}</span>
                  <span className="ship-badges">
                    <StatusBadge status={s.status} />
                    <VoteChips ship={s} />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <h4 className="pairings-title">🔥 Fans ship {first} with</h4>
      {pairError ? (
        <p className="muted small">Fan art is unavailable right now.</p>
      ) : pairings === null ? (
        <p className="muted small">Looking through fan art…</p>
      ) : pairings.length === 0 ? (
        <p className="muted small">No popular pairings found.</p>
      ) : (
        <ul className="pairings">
          {pairings.map((p) => (
            <li key={p.character.id}>
              <a href={`#/character/${p.character.id}`} className="pairing-who">
                {p.character.image && <img src={p.character.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                <span>
                  <b>{p.character.name}</b>
                  {p.count != null && <span className="muted tiny">{compactCount(p.count)} pictures</span>}
                </span>
              </a>
              {p.shipId ? (
                <a className="btn ghost small-btn" href={`#/ship/${p.shipId}`}>
                  Open ship
                </a>
              ) : (
                <button type="button" className="btn ghost small-btn" onClick={() => setBuilder([self, p.character])}>
                  💕 Ship
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {builder && <ShipBuilder initial={builder} onClose={() => setBuilder(null)} onCreated={(s) => navigate(`#/ship/${s.id}`)} />}
    </div>
  );
}

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

// Pictures: our saved picks, fan art sorted by fan score, official pictures.
function Gallery({ characterId, name, lists, onListsChanged }) {
  const { me, setMe, refreshLists } = useApp();
  const [status, setStatus] = useState(null);
  const [useIn, setUseIn] = useState(null); // picture URL being used in lists
  const editable = lists.filter((l) => l.owner?.id === me.id || l.list.isShared);
  const official = useMemo(
    () => ({
      load: async () => {
        const a = await api.anilistImages(characterId).catch(() => ({ images: [] }));
        const m = await api.malImages(characterId).catch(() => ({ images: [] }));
        return { images: [...new Set([...a.images, ...m.images])] };
      },
    }),
    [characterId],
  );
  const actions = [
    {
      icon: '📋',
      label: editable.length ? 'Use in my lists…' : 'Use in my lists (add to a list first)',
      onSelect: (item, url) => (editable.length ? setUseIn(url) : setStatus(`Add ${name} to a list first (+ Add to list at the top).`)),
    },
    {
      icon: "👤",
      label: "Use as profile photo",
      onSelect: async (item, url) => {
        try {
          setMe(await api.setAvatar(url));
          refreshLists();
          setStatus("✓ Profile photo updated");
        } catch (err) {
          setStatus(err.message);
        }
      },
    },
    { icon: "↗️", label: "Open full size", onSelect: (item, url) => window.open(url, "_blank", "noopener") },
  ];
  return (
    <div className="card">
      <FanartBrowser title="🖼️ Pictures" subject={`character:${characterId}`} subjectName={name} official={official} actions={actions} allowSolo />
      {status && <p className="muted small">{status}</p>}
      {useIn && (
        <UseInListsDialog
          url={useIn}
          lists={editable}
          onClose={() => setUseIn(null)}
          onDone={() => {
            setStatus('✓ Portrait updated');
            refreshLists();
            onListsChanged();
          }}
        />
      )}
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
            <a className="btn ghost" href={`#/ships/new/${c.id}`}>
              💕 Ship with…
            </a>
            <Menu
              title={c.name}
              className="icon-btn menu-trigger bordered"
              items={[{ icon: '↗️', label: 'Open on AniList', href: c.siteUrl, external: true }]}
            />
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

          <Gallery characterId={c.id} name={c.name} lists={c.lists} onListsChanged={() => api.character(id).then(setC).catch(() => {})} />
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

          <ShipsCard c={c} />

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
