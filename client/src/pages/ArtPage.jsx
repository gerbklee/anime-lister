import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { plural, timeAgo } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import Menu from '../components/Menu.jsx';
import { FanartGrid } from '../components/FanartBrowser.jsx';
import FanartViewer from '../components/FanartViewer.jsx';
import { useArtActions } from '../components/ArtTools.jsx';
import GalleryPage from './GalleryPage.jsx';

const COLOURS = [
  ['red', '#e5484d'], ['orange', '#f28c28'], ['yellow', '#f5c518'], ['green', '#30a46c'], ['blue', '#3e63dd'],
  ['purple', '#8e4ec6'], ['pink', '#e93d82'], ['black', '#222'], ['white', '#f4f4f4'], ['pastel', 'linear-gradient(135deg,#ffd1dc,#c9e4ff,#d5f5d0)'],
];
const KIND_ICONS = { character: '👤', ship: '💕', series: '🎬', artist: '🖌️', tag: '🏷️' };
const SEARCH_KEY = 'art-search';

function loadSearch() {
  try {
    return { chips: [], color: '', sort: 'best', shape: '', quality: '', solo: false, ...JSON.parse(sessionStorage.getItem(SEARCH_KEY) ?? '{}') };
  } catch {
    return { chips: [], color: '', sort: 'best', shape: '', quality: '', solo: false };
  }
}

// A grid that opens the art viewer.
function ArtGrid({ items, tools, emptyText, extraActions = [], onSave }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <FanartGrid items={items} onOpen={setOpen} emptyText={emptyText} />
      {open != null && items[open] && (
        <FanartViewer
          items={items}
          index={Math.min(open, items.length - 1)}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onSave={onSave}
          {...tools.viewerProps}
          actions={[...extraActions, ...tools.viewerProps.actions]}
          showSubject
        />
      )}
    </>
  );
}

// ---- Search ------------------------------------------------------------------------------------

function ChipInput({ chips, onChange }) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      api
        .artAutocomplete(term, controller.signal)
        .then((d) => {
          setSuggestions(d.suggestions);
          setActive(0);
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [text]);

  const add = (chip) => {
    if (!chips.some((c) => c.tag === chip.tag)) onChange([...chips, chip].slice(0, 6));
    setText('');
    setSuggestions([]);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, suggestions.length - 1));
    if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[active]) add(suggestions[active]);
      else if (text.trim()) add({ tag: text.trim().toLowerCase().replace(/\s+/g, '_'), label: text.trim(), kind: 'tag' });
    }
    if (e.key === 'Backspace' && !text && chips.length) onChange(chips.slice(0, -1));
  };

  return (
    <div className="chip-input">
      <div className="chip-input-box">
        <span aria-hidden="true">🔍</span>
        {chips.map((c) => (
          <span key={c.tag} className={`chip kind-${c.kind}`}>
            {KIND_ICONS[c.kind] ?? '🏷️'} {c.label}
            <button type="button" className="chip-remove" onClick={() => onChange(chips.filter((x) => x.tag !== c.tag))} aria-label={`Remove ${c.label}`}>
              ✕
            </button>
          </span>
        ))}
        <input
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={chips.length ? 'Add more…' : 'Character, ship, series, artist, "rain", "kimono"…'}
          aria-label="Search art"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="suggestions chip-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.tag} role="option" aria-selected={i === active} className={`suggestion ${i === active ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
              <span className="chip-kind">{KIND_ICONS[s.kind]}</span>
              <span className="suggestion-text">
                <span className="suggestion-name">{s.label}</span>
                <span className="muted tiny">
                  {s.kind}
                  {s.count != null ? ` · ${s.count.toLocaleString()} pictures` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchView({ search, setSearch, similar, clearSimilar, tools }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [link, setLink] = useState('');

  const params = useCallback(
    (p) => ({
      tags: search.chips.map((c) => c.tag).join(','),
      ...(search.color ? { color: search.color } : {}),
      sort: search.sort,
      ...(search.shape ? { shape: search.shape } : {}),
      ...(search.quality ? { quality: search.quality } : {}),
      ...(search.solo ? { solo: 1 } : {}),
      page: p,
    }),
    [search],
  );

  useEffect(() => {
    setError(null);
    setData(null);
    setPage(1);
    if (similar) {
      api
        .artSimilar(similar.item.id, similar.mode)
        .then((d) => setData({ items: d.items, hasMore: false, tags: d.tags }))
        .catch((err) => setError(err.message));
      return;
    }
    if (!search.chips.length && !search.color) return;
    api
      .artSearch(params(1))
      .then(setData)
      .catch((err) => setError(err.message));
  }, [search, similar, params]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const d = await api.artSearch(params(page + 1));
      setData((cur) => ({ ...d, items: [...cur.items, ...d.items.filter((n) => !cur.items.some((o) => o.id === n.id))] }));
      setPage((p) => p + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const set = (patch) => setSearch((s) => ({ ...s, ...patch }));
  const activeFilters = [search.sort !== 'best', !!search.shape, !!search.quality, search.solo].filter(Boolean).length;
  const modeLabels = { artist: `More by ${similar?.item.artist}`, characters: 'More with these characters', tags: 'More like this' };

  return (
    <div className="art-search">
      {similar ? (
        <div className="similar-head card">
          <img src={similar.item.thumb} alt="" />
          <div>
            <b>{modeLabels[similar.mode]}</b>
            {data?.tags && <div className="muted tiny">{data.tags.map((t) => t.replace(/_/g, ' ')).join(' + ')}</div>}
          </div>
          <button type="button" className="icon-btn" onClick={clearSimilar} aria-label="Back to search">
            ✕
          </button>
        </div>
      ) : (
        <>
          <ChipInput chips={search.chips} onChange={(chips) => set({ chips })} />
          <div className="colour-dots" role="radiogroup" aria-label="Colour">
            {COLOURS.map(([name, css]) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={search.color === name}
                aria-label={name}
                title={name}
                className={`colour-dot ${search.color === name ? 'on' : ''}`}
                style={{ background: css }}
                onClick={() => set({ color: search.color === name ? '' : name })}
              />
            ))}
          </div>
          <FilterPanel active={activeFilters} onReset={() => set({ sort: 'best', shape: '', quality: '', solo: false })} summary={data ? plural(data.items.length, 'picture') : null}>
            <div className="segmented small" role="radiogroup" aria-label="Sort">
              {[
                ['best', '⭐ Best'],
                ['new', '🆕 Newest'],
              ].map(([k, l]) => (
                <button key={k} type="button" className={search.sort === k ? 'active' : ''} onClick={() => set({ sort: k })}>
                  {l}
                </button>
              ))}
            </div>
            <div className="segmented small" role="radiogroup" aria-label="Shape">
              {[
                ['', 'Any shape'],
                ['portrait', 'Portrait'],
                ['landscape', 'Landscape'],
                ['phone', '📱 Phone'],
              ].map(([k, l]) => (
                <button key={k} type="button" className={search.shape === k ? 'active' : ''} onClick={() => set({ shape: k })}>
                  {l}
                </button>
              ))}
            </div>
            <div className="segmented small" role="radiogroup" aria-label="Quality">
              {[
                ['', 'Any size'],
                ['hd', 'HD'],
                ['4k', '4K'],
              ].map(([k, l]) => (
                <button key={k} type="button" className={search.quality === k ? 'active' : ''} onClick={() => set({ quality: k })}>
                  {l}
                </button>
              ))}
            </div>
            <label className="check small">
              <input type="checkbox" checked={search.solo} onChange={(e) => set({ solo: e.target.checked })} /> Solo only
            </label>
          </FilterPanel>
        </>
      )}

      {error && <div className="banner error">{error}</div>}
      {!similar && !search.chips.length && !search.color ? (
        <div className="art-search-empty">
          <p className="muted">Combine anything: a character, a ship, a series, an artist, and things in the picture like “rain”, “kimono” or “smile”. Or pick a colour.</p>
          <form
            className="trope-custom"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) tools.openWhatIs(link.trim());
            }}
          >
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="❓ Paste a picture link to find out what it is" aria-label="Picture link" />
            <button type="submit" className="btn ghost" disabled={!link.trim()}>
              Look up
            </button>
          </form>
        </div>
      ) : !data && !error ? (
        <p className="muted">Searching…</p>
      ) : (
        data && (
          <>
            <ArtGrid items={data.items} tools={tools} emptyText="Nothing found. Try fewer or different words." />
            {data.hasMore && (
              <button type="button" className="btn ghost wide load-more" onClick={more} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )
      )}
    </div>
  );
}

// ---- Home --------------------------------------------------------------------------------------

function Section({ title, link, linkLabel = 'See all →', children }) {
  return (
    <section className="art-section">
      <div className="art-section-head">
        <h3>{title}</h3>
        {link && (
          <a href={link} className="link-btn small">
            {linkLabel}
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    fn()
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((error) => !cancelled && setState({ data: null, error: error.message }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function BoardCard({ b }) {
  return (
    <a href={`#/art/board/${b.id}`} className="board-card">
      <span className={`board-covers n${Math.min(4, b.covers.length)}`}>
        {b.covers.length ? b.covers.map((c, i) => <img key={i} src={c} alt="" loading="lazy" />) : <span className="board-empty">{b.emoji ?? '📌'}</span>}
      </span>
      <span className="board-card-name">
        {b.emoji ? `${b.emoji} ` : ''}
        {b.name}
      </span>
      <span className="muted tiny">
        {plural(b.count, 'picture')}
        {b.isShared ? ' · 👥' : ''}
      </span>
    </a>
  );
}

function HomeView({ tools, goSearch }) {
  const { navigate } = useApp();
  const daily = useLoad(() => api.artDaily(), []);
  const forYou = useLoad(() => api.artForYou(), []);
  const trending = useLoad(() => api.artTrending(), []);
  const boards = useLoad(() => api.boards(), []);
  const gallery = useLoad(() => api.gallery(), []);
  const follows = useLoad(() => api.follows(), []);
  const [showAll, setShowAll] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const d = daily.data;

  return (
    <div className="art-home">
      <button type="button" className="art-search-launch" onClick={() => navigate('#/art/search')}>
        <span aria-hidden="true">🔍</span> Search art: characters, ships, artists, “rain”, colours…
      </button>

      {d?.item && (
        <div className="daily-card" onClick={() => setDailyOpen(true)} role="button" tabIndex={0}>
          <img src={d.item.full} alt="" referrerPolicy="no-referrer" />
          <div className="daily-info">
            <span className="daily-kicker">✨ Art of the day</span>
            <b>{d.subjectName}</b>
            {d.item.artist && <span className="tiny">by {d.item.artist}</span>}
          </div>
        </div>
      )}
      {dailyOpen && d?.item && (
        <FanartViewer items={[{ ...d.item, subject: d.subject, subjectName: d.subjectName }]} index={0} onIndex={() => {}} onClose={() => setDailyOpen(false)} {...tools.viewerProps} showSubject />
      )}

      <Section title="💘 For you">
        {forYou.error ? (
          <p className="muted small">{forYou.error}</p>
        ) : !forYou.data ? (
          <p className="muted small">
            <span className="spinner inline-small" aria-hidden="true" /> Gathering the best art of your characters…
          </p>
        ) : (
          <>
            <ArtGrid items={showAll ? forYou.data.items : forYou.data.items.slice(0, 9)} tools={tools} emptyText="Add characters to your lists to get art for you." />
            {forYou.data.items.length > 9 && (
              <button type="button" className="btn ghost wide load-more" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show less' : `Show all ${forYou.data.items.length}`}
              </button>
            )}
          </>
        )}
      </Section>

      {trending.data?.items?.length > 0 && (
        <Section title="🔥 Trending in your series">
          <ArtGrid items={trending.data.items.slice(0, 9)} tools={tools} />
        </Section>
      )}

      <Section title="📌 Boards" link="#/art/boards">
        {boards.data?.boards?.length ? (
          <div className="board-row">
            {boards.data.boards.slice(0, 6).map((b) => (
              <BoardCard key={b.id} b={b} />
            ))}
          </div>
        ) : (
          <p className="muted small">Collect pictures into boards: open any picture and tap 📌 Board.</p>
        )}
      </Section>

      {gallery.data?.items?.length > 0 && (
        <Section title="💖 Recently saved" link="#/art/gallery">
          <div className="fanart-grid">
            {gallery.data.items.slice(0, 6).map((it) => (
              <a key={it.savedId} className="fanart-cell" href="#/art/gallery">
                <img src={it.thumb} alt="" loading="lazy" />
              </a>
            ))}
          </div>
        </Section>
      )}

      <Section title="🖌️ Artists you follow" link="#/art/artists">
        {follows.data?.follows?.length ? (
          <div className="chip-row">
            {follows.data.follows.slice(0, 10).map((f) => (
              <button key={f.artist} type="button" className="chip kind-artist" onClick={() => goSearch([{ tag: f.artist, label: f.name, kind: 'artist' }])}>
                🖌️ {f.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Follow artists from any Danbooru picture (⋯ → Follow) to see their new art here.</p>
        )}
      </Section>
    </div>
  );
}

// ---- Boards ------------------------------------------------------------------------------------

function BoardsView() {
  const { navigate } = useApp();
  const [boards, setBoards] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    api
      .boards()
      .then((d) => setBoards(d.boards))
      .catch((err) => setError(err.message));
  }, []);
  const create = async (e) => {
    e.preventDefault();
    try {
      const b = await api.createBoard(name.trim());
      navigate(`#/art/board/${b.id}`);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="boards-view">
      <form className="trope-custom" onSubmit={create}>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="New board, e.g. Christmas, Our wallpapers…" aria-label="New board" />
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Create
        </button>
      </form>
      {error && <div className="banner error">{error}</div>}
      {!boards ? (
        <p className="muted">Loading…</p>
      ) : boards.length === 0 ? (
        <p className="muted">No boards yet. Boards are your own collections; share one to add pictures together.</p>
      ) : (
        <div className="board-grid">
          {boards.map((b) => (
            <BoardCard key={b.id} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardView({ id, tools }) {
  const { me, users, navigate } = useApp();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [username, setUsername] = useState('');

  const load = useCallback(() => {
    api
      .board(id)
      .then(setBoard)
      .catch((err) => setError(err.message));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="banner error">{error}</div>;
  if (!board) return <p className="muted">Loading…</p>;

  const rename = async () => {
    const name = window.prompt('Board name', board.name);
    if (!name || name === board.name) return;
    setBoard({ ...board, ...(await api.updateBoard(board.id, { name })) });
  };
  const remove = async () => {
    if (!window.confirm(`Delete the board “${board.name}” and its ${plural(board.count, 'picture')}?`)) return;
    await api.deleteBoard(board.id);
    navigate('#/art/boards');
  };
  const leave = async () => {
    if (!window.confirm(`Leave “${board.name}”?`)) return;
    await api.removeBoardMember(board.id, me.id);
    navigate('#/art/boards');
  };
  const share = async (e) => {
    e.preventDefault();
    try {
      await api.shareBoard(board.id, username.trim());
      setUsername('');
      setSharing(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const others = users.filter((u) => u.id !== me.id && u.id !== board.owner?.id && !board.members.some((m) => m.id === u.id));

  return (
    <div className="board-view">
      <a href="#/art/boards" className="back-link">
        ← Boards
      </a>
      <div className="list-header">
        <h2 className="list-name">
          {board.emoji ? `${board.emoji} ` : ''}
          {board.name}
        </h2>
        <div className="spacer" />
        <Menu
          title={board.name}
          items={[
            board.isOwner && { icon: '👥', label: 'Share…', onSelect: () => setSharing((s) => !s) },
            board.isOwner && { icon: '✏️', label: 'Rename', onSelect: rename },
            !board.isOwner && { icon: '🚪', label: 'Leave board', onSelect: leave },
            board.isOwner && 'divider',
            board.isOwner && { icon: '🗑️', label: 'Delete board', danger: true, onSelect: remove },
          ]}
        />
      </div>
      <div className="list-subline">
        <span className="muted small">{plural(board.count, 'picture')}</span>
        <span className="avatar-stack">
          {[board.owner, ...board.members].filter(Boolean).map((u) => (
            <Avatar key={u.id} user={u} size={20} />
          ))}
        </span>
        <span className="muted small">{board.isShared ? `shared · by ${board.owner?.id === me.id ? 'you' : board.owner?.username}` : 'only you'}</span>
      </div>
      {sharing && (
        <form className="trope-custom card board-share" onSubmit={share}>
          <input list="board-share-users" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Share with (username)" autoCapitalize="none" autoFocus />
          <datalist id="board-share-users">
            {others.map((u) => (
              <option key={u.id} value={u.username} />
            ))}
          </datalist>
          <button type="submit" className="btn primary" disabled={!username.trim()}>
            Share
          </button>
        </form>
      )}
      <ArtGrid
        items={board.items}
        tools={tools}
        emptyText="Empty board. Open any picture in Art and tap 📌 Board to add it."
        extraActions={[
          {
            icon: '🗑️',
            label: 'Remove from this board',
            onSelect: async (item) => {
              await api.removeFromBoard(board.id, item.itemId);
              load();
            },
          },
        ]}
      />
    </div>
  );
}

// ---- Artists -----------------------------------------------------------------------------------

function ArtistsView({ tools, goSearch }) {
  const [follows, setFollows] = useState(null);
  const [feed, setFeed] = useState(null);
  const load = useCallback(() => {
    api.follows().then((d) => setFollows(d.follows)).catch(() => setFollows([]));
    api.artistFeed().then((d) => setFeed(d.items)).catch(() => setFeed([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const unfollow = async (f) => {
    if (!window.confirm(`Unfollow ${f.name}?`)) return;
    await api.unfollow(f.artist);
    load();
  };
  return (
    <div className="artists-view">
      {!follows ? (
        <p className="muted">Loading…</p>
      ) : follows.length === 0 ? (
        <p className="muted">You don't follow anyone yet. Open a picture, tap ⋯ → <b>Follow</b> the artist. You'll get a notification when they post new art.</p>
      ) : (
        <>
          <div className="chip-row">
            {follows.map((f) => (
              <span key={f.artist} className="chip-group">
                <button type="button" className="chip kind-artist" onClick={() => goSearch([{ tag: f.artist, label: f.name, kind: 'artist' }])}>
                  🖌️ {f.name}
                </button>
                <button type="button" className="chip small" onClick={() => unfollow(f)} aria-label={`Unfollow ${f.name}`} title="Unfollow">
                  ✕
                </button>
              </span>
            ))}
          </div>
          <h3>🆕 Latest from your artists</h3>
          {!feed ? <p className="muted small">Loading…</p> : <ArtGrid items={feed} tools={tools} emptyText="Nothing new yet." />}
        </>
      )}
    </div>
  );
}

// ---- Page --------------------------------------------------------------------------------------

export default function ArtPage({ route }) {
  const { navigate } = useApp();
  const [search, setSearchState] = useState(loadSearch);
  const [similar, setSimilar] = useState(null);
  const view = route.view ?? 'home';

  const setSearch = useCallback((fn) => {
    setSearchState((s) => {
      const next = typeof fn === 'function' ? fn(s) : fn;
      try {
        sessionStorage.setItem(SEARCH_KEY, JSON.stringify(next));
      } catch {
        // not important
      }
      return next;
    });
  }, []);

  const goSearch = useCallback(
    (chips) => {
      setSimilar(null);
      setSearch((s) => ({ ...s, chips, color: '' }));
      navigate('#/art/search');
    },
    [navigate, setSearch],
  );
  const onSimilar = useCallback(
    (item, mode) => {
      setSimilar({ item, mode });
      navigate('#/art/search');
    },
    [navigate],
  );
  const tools = useArtActions({ onSearch: goSearch, onSimilar });

  const tabs = [
    ['home', '#/art', '✨ Home'],
    ['search', '#/art/search', '🔍 Search'],
    ['boards', '#/art/boards', '📌 Boards'],
    ['gallery', '#/art/gallery', '💖 Gallery'],
    ['artists', '#/art/artists', '🖌️ Artists'],
  ];
  const activeTab = view === 'board' ? 'boards' : view;

  return (
    <section className="art-page">
      <div className="tabs compact profile-tabs" role="tablist">
        {tabs.map(([key, href, label]) => (
          <a key={key} href={href} role="tab" aria-selected={activeTab === key} className={`tab-link ${activeTab === key ? 'active' : ''}`}>
            {label}
          </a>
        ))}
      </div>
      {view === 'home' && <HomeView tools={tools} goSearch={goSearch} />}
      {view === 'search' && <SearchView search={search} setSearch={setSearch} similar={similar} clearSimilar={() => setSimilar(null)} tools={tools} />}
      {view === 'boards' && <BoardsView />}
      {view === 'board' && <BoardView key={route.boardId} id={route.boardId} tools={tools} />}
      {view === 'gallery' && <GalleryPage />}
      {view === 'artists' && <ArtistsView tools={tools} goSearch={goSearch} />}
      {tools.dialogs}
    </section>
  );
}
