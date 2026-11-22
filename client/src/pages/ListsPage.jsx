import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import ListSidebar from '../components/ListSidebar.jsx';
import ListView from '../components/ListView.jsx';
import ShipBoard from './ShipBoard.jsx';
import KindToggle from '../components/KindToggle.jsx';
import ShipSwipe from './ShipSwipe.jsx';
import ShipMap from './ShipMap.jsx';

const KIND_KEY = 'lists-kind';

const KIND_INFO = {
  character: { icon: '👤', lists: 'Character lists', word: 'character', example: '“Top 10 Villains”' },
  anime: { icon: '🎬', lists: 'Anime lists', word: 'anime', example: '“Best openings” or “Top 10 anime”' },
  manga: { icon: '📖', lists: 'Manga lists', word: 'manga', example: '“Best art” or “Top 10 manga”' },
  ship: { icon: '💕', lists: 'Ships', word: 'OTP', example: '“Our OTPs” or “Crack ships”' },
};

function savedKind() {
  try {
    const k = localStorage.getItem(KIND_KEY);
    return KIND_INFO[k] ? k : 'character';
  } catch {
    return 'character';
  }
}

// Ranked lists of characters or anime.
export default function ListsPage({ route }) {
  const { lists, refreshLists, navigate } = useApp();
  const [kind, setKind] = useState(() => (route.ships ? 'ship' : savedKind()));
  const [menuOpen, setMenuOpen] = useState(false);

  const selected = lists?.find((l) => l.id === route.id && l.kind !== 'watchlist');
  const ofKind = (lists ?? []).filter((l) => l.kind === kind);

  useEffect(() => {
    if (selected && selected.kind !== kind) setKind(selected.kind);
    else if (route.ships && kind !== 'ship') setKind('ship');
  }, [selected, kind, route.ships]);

  useEffect(() => {
    try {
      localStorage.setItem(KIND_KEY, kind);
    } catch {
      // not important
    }
  }, [kind]);

  useEffect(() => setMenuOpen(false), [route.id, route.ships]);

  // No list (or a deleted one) selected: open the first of your own/shared lists.
  useEffect(() => {
    if (!lists || selected) return;
    // Ships: the board is the start page.
    if (kind === 'ship' || route.ships) {
      if (!route.ships) navigate('#/ships');
      return;
    }
    const first = lists.find((l) => l.kind === kind && (l.isOwner || l.isShared)) ?? lists.find((l) => l.kind === kind);
    if (first) navigate(`#/list/${first.id}`);
    else if (route.id) navigate('#/lists');
  }, [lists, selected, kind, route.id, route.ships, navigate]);

  const switchKind = (next) => {
    if (next === kind) return;
    setKind(next);
    if (next === 'ship') {
      navigate('#/ships');
      return;
    }
    const first = (lists ?? []).find((l) => l.kind === next && (l.isOwner || l.isShared)) ?? lists?.find((l) => l.kind === next);
    navigate(first ? `#/list/${first.id}` : '#/lists');
  };

  const handleCreate = async (name, shared, category) => {
    const list = await api.createList(name, shared, kind, category);
    await refreshLists();
    navigate(`#/list/${list.id}`);
  };

  const kindToggle = <KindToggle active={kind} onSwitch={(k) => (k === 'watchlist' ? navigate('#/watch') : switchKind(k))} />;
  const header =
    kind === 'ship' ? (
      <>
        {kindToggle}
        <a href="#/ships" className={`list-link board-link ${!selected ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
          <span className="list-link-name">💕 Ship board</span>
        </a>
      </>
    ) : (
      kindToggle
    );
  const kindInfo = KIND_INFO[kind];

  return (
    <div className="layout">
      <button className="list-switcher" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
        <span>
          {kindInfo.icon} {kindInfo.lists} <span className="muted small">· {ofKind.length}</span>
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      <ListSidebar
        open={menuOpen}
        header={header}
        lists={ofKind}
        selectedId={selected?.id ?? null}
        hrefFor={(l) => `#/list/${l.id}`}
        onCreate={handleCreate}
        withCategory={kind === 'character'}
        onPick={() => setMenuOpen(false)}
      />
      <main className="main">
        {lists === null ? (
          <p className="muted">Loading…</p>
        ) : selected ? (
          <ListView key={selected.id} listId={selected.id} onListsChanged={refreshLists} />
        ) : kind === 'ship' ? (
          route.shipView === 'swipe' ? (
            <ShipSwipe />
          ) : route.shipView === 'map' ? (
            <ShipMap />
          ) : (
            <ShipBoard key={route.newWith ?? 'board'} newWith={route.newWith} />
          )
        ) : (
          <div className="empty-state">
            <h2>No {kindInfo.word} lists yet</h2>
            <p className="muted">Create one in the sidebar, e.g. {kindInfo.example}.</p>
          </div>
        )}
      </main>
    </div>
  );
}
