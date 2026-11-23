import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { plural } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import Menu from '../components/Menu.jsx';

import { useArtActions } from '../components/ArtTools.jsx';
import { ArtResults, ArtistView, FollowingFeed, SearchView, adaptItem, artistHref, label, sendBoardToEagle, setSearchChips, staticStream, useEagle } from '../components/ArtSearch.jsx';
import GalleryPage from './GalleryPage.jsx';

// Pictures from For you, Trending and boards in the same grid and viewer as the search.
function ArtGrid({ items, tools, emptyText, extraActions = [], goSearch }) {
  const eagle = useEagle();
  const adapted = useMemo(() => items.map(adaptItem), [items]);
  return <ArtResults stream={staticStream(adapted)} size={160} tools={tools} eagle={eagle} onSearch={goSearch} emptyText={emptyText} extraActions={extraActions} />;
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

function HomeView({ tools, follows, goSearch }) {
  const { navigate } = useApp();
  const daily = useLoad(() => api.artDaily(), []);
  const forYou = useLoad(() => api.artForYou(), []);
  const trending = useLoad(() => api.artTrending(), []);
  const boards = useLoad(() => api.boards(), []);
  const gallery = useLoad(() => api.gallery(), []);
  const [showAll, setShowAll] = useState(false);
  const eagle = useEagle();
  const d = daily.data;
  const dailyItems = useMemo(() => (d?.item ? [adaptItem({ ...d.item, subject: d.subject, subjectName: d.subjectName })] : []), [d]);

  return (
    <div className="art-home">
      <button type="button" className="art-search-launch" onClick={() => navigate('#/art/search')}>
        <span aria-hidden="true">🔍</span> Search art on every site: characters, ships, artists, poses, colours…
      </button>

      {d?.item && (
        <ArtResults
          stream={staticStream(dailyItems)}
          tools={tools}
          eagle={eagle}
          onSearch={goSearch}
          renderTrigger={(open) => (
            <div className="daily-card" onClick={() => open(0)} role="button" tabIndex={0}>
              <img src={d.item.full} alt="" referrerPolicy="no-referrer" />
              <div className="daily-info">
                <span className="daily-kicker">✨ Art of the day</span>
                <b>{d.subjectName}</b>
                {d.item.artist && <span className="tiny">by {d.item.artist}</span>}
              </div>
            </div>
          )}
        />
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
            <ArtGrid items={showAll ? forYou.data.items : forYou.data.items.slice(0, 9)} tools={tools} goSearch={goSearch} emptyText="Add characters to your lists to get art for you." />
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
          <ArtGrid items={trending.data.items.slice(0, 9)} tools={tools} goSearch={goSearch} />
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
        {follows?.length ? (
          <div className="chip-row">
            {follows.slice(0, 10).map((f) => (
              <a key={f.artist} className="chip kind-artist" href={artistHref(f.artist)}>
                🖌️ {f.name}
              </a>
            ))}
          </div>
        ) : (
          <p className="muted small">Follow artists from any picture in the search (➕ Follow next to the artist) to see their new art from every site here.</p>
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

function BoardView({ id, tools, goSearch }) {
  const { me, users, navigate } = useApp();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [eagleMsg, setEagleMsg] = useState(null);
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
  const toEagle = async () => {
    setEagleMsg('Sending to Eagle…');
    try {
      const { sent, skipped } = await sendBoardToEagle(board, (n, total) => setEagleMsg(`Sending to Eagle… ${n}/${total}`));
      setEagleMsg(`🦅 ${sent} sent to the Eagle folder “${board.name}”${skipped ? ` (${skipped} unavailable)` : ''}`);
    } catch (err) {
      setEagleMsg(err.message);
    }
  };

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
            board.items.length > 0 && { icon: '🦅', label: 'Send board to Eagle', onSelect: toEagle },
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
      {eagleMsg && <p className="small muted">{eagleMsg}</p>}
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
        goSearch={goSearch}
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

// Everyone you follow, and their newest work from every site.
function ArtistsView({ tools, goSearch, follows, reloadFollows }) {
  const unfollow = async (f) => {
    if (!window.confirm(`Unfollow ${f.name}?`)) return;
    await api.unfollow(f.artist);
    reloadFollows();
  };
  return (
    <div className="artists-view studio">
      {!follows ? (
        <p className="muted">Loading…</p>
      ) : follows.length === 0 ? (
        <p className="muted">
          You don't follow anyone yet. Open a picture and tap <b>➕ Follow</b> next to the artist, or open an artist's page from any picture. You'll get a
          notification when they post new art on Danbooru.
        </p>
      ) : (
        <>
          <div className="chip-row">
            {follows.map((f) => (
              <span key={f.artist} className="chip-group">
                <a className="chip kind-artist" href={artistHref(f.artist)} title="Their work on every site">
                  🖌️ {f.name}
                  {f.artist.startsWith('pixiv:') && <span className="chip-series"> · Pixiv</span>}
                </a>
                <button type="button" className="chip small" onClick={() => unfollow(f)} aria-label={`Unfollow ${f.name}`} title="Unfollow">
                  ✕
                </button>
              </span>
            ))}
          </div>
          <h3>🆕 Latest from your artists</h3>
          <p className="muted tiny">From Danbooru, Yande.re, Konachan, Gelbooru and Pixiv (where connected), newest first.</p>
          <FollowingFeed tools={tools} onSearch={goSearch} version={follows.length} />
        </>
      )}
    </div>
  );
}

// ---- Page --------------------------------------------------------------------------------------

export default function ArtPage({ route }) {
  const { navigate } = useApp();
  const [searchKey, setSearchKey] = useState(0);
  const [follows, setFollows] = useState(null);
  const view = route.view ?? 'home';

  const reloadFollows = useCallback(() => {
    api.follows().then((d) => setFollows(d.follows)).catch(() => setFollows([]));
  }, []);
  useEffect(() => {
    reloadFollows();
  }, [reloadFollows]);

  const goSearch = useCallback(
    (chips) => {
      setSearchChips(chips);
      setSearchKey((k) => k + 1);
      navigate('#/art/search');
    },
    [navigate],
  );
  const baseTools = useArtActions();
  // Following from a picture updates the Artists tab right away.
  const tools = {
    ...baseTools,
    follow: async (artist, name) => {
      await baseTools.follow(artist, name);
      reloadFollows();
    },
  };

  const tabs = [
    ['home', '#/art', '✨ Home'],
    ['search', '#/art/search', '🔍 Search'],
    ['boards', '#/art/boards', '📌 Boards'],
    ['gallery', '#/art/gallery', '💖 Gallery'],
    ['artists', '#/art/artists', '🖌️ Artists'],
  ];
  const activeTab = view === 'board' ? 'boards' : view === 'artist' ? 'artists' : view;

  return (
    <section className="art-page">
      <div className="tabs compact profile-tabs" role="tablist">
        {tabs.map(([key, href, text]) => (
          <a key={key} href={href} role="tab" aria-selected={activeTab === key} className={`tab-link ${activeTab === key ? 'active' : ''}`}>
            {text}
          </a>
        ))}
      </div>
      {view === 'home' && <HomeView tools={tools} follows={follows} goSearch={goSearch} />}
      {view === 'search' && <SearchView key={searchKey} tools={tools} />}
      {view === 'boards' && <BoardsView />}
      {view === 'board' && <BoardView key={route.boardId} id={route.boardId} tools={tools} goSearch={goSearch} />}
      {view === 'gallery' && <GalleryPage tools={tools} goSearch={goSearch} />}
      {view === 'artists' && <ArtistsView tools={tools} goSearch={goSearch} follows={follows} reloadFollows={reloadFollows} />}
      {view === 'artist' && <ArtistView key={route.artist} artistKey={route.artist} tools={tools} onSearch={goSearch} following={follows} onFollowChange={reloadFollows} />}
      {tools.dialogs}
    </section>
  );
}
