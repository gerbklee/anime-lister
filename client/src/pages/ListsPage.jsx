import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import ListSidebar from '../components/ListSidebar.jsx';
import ListView from '../components/ListView.jsx';

const KIND_KEY = 'lists-kind';

const KIND_INFO = {
  character: { icon: '👤', lists: 'Character lists', word: 'character', example: '“Top 10 Villains”' },
  anime: { icon: '🎬', lists: 'Anime lists', word: 'anime', example: '“Best openings” or “Top 10 anime”' },
  manga: { icon: '📖', lists: 'Manga lists', word: 'manga', example: '“Best art” or “Top 10 manga”' },
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
  const [kind, setKind] = useState(savedKind);
  const [menuOpen, setMenuOpen] = useState(false);

  const selected = lists?.find((l) => l.id === route.id && l.kind !== 'watchlist');
  const ofKind = (lists ?? []).filter((l) => l.kind === kind);

  useEffect(() => {
    if (selected && selected.kind !== kind) setKind(selected.kind);
  }, [selected, kind]);

  useEffect(() => {
    try {
      localStorage.setItem(KIND_KEY, kind);
    } catch {
      // not important
    }
  }, [kind]);

  useEffect(() => setMenuOpen(false), [route.id]);

  // No list (or a deleted one) selected: open the first of your own/shared lists.
  useEffect(() => {
    if (!lists || selected) return;
    const first = lists.find((l) => l.kind === kind && (l.isOwner || l.isShared)) ?? lists.find((l) => l.kind === kind);
    if (first) navigate(`#/list/${first.id}`);
    else if (route.id) navigate('#/lists');
  }, [lists, selected, kind, route.id, navigate]);

  const switchKind = (next) => {
    if (next === kind) return;
    setKind(next);
    const first = (lists ?? []).find((l) => l.kind === next && (l.isOwner || l.isShared)) ?? lists?.find((l) => l.kind === next);
    navigate(first ? `#/list/${first.id}` : '#/lists');
  };

  const handleCreate = async (name, shared, category) => {
    const list = await api.createList(name, shared, kind, category);
    await refreshLists();
    navigate(`#/list/${list.id}`);
  };

  const kindToggle = (
    <div className="segmented kind-toggle" role="tablist" aria-label="List type">
      <button type="button" role="tab" aria-selected={kind === 'character'} className={kind === 'character' ? 'active' : ''} onClick={() => switchKind('character')}>
        👤 Characters
      </button>
      <button type="button" role="tab" aria-selected={kind === 'anime'} className={kind === 'anime' ? 'active' : ''} onClick={() => switchKind('anime')}>
        🎬 Anime
      </button>
      <button type="button" role="tab" aria-selected={kind === 'manga'} className={kind === 'manga' ? 'active' : ''} onClick={() => switchKind('manga')}>
        📖 Manga
      </button>
    </div>
  );
  const kindInfo = KIND_INFO[kind];

  return (
    <div className="layout">
      <button className="list-switcher" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
        <span>
          {kindInfo.icon} {selected ? selected.name : kindInfo.lists}
        </span>
        <span aria-hidden="true">{menuOpen ? '▲' : '▼'}</span>
      </button>
      <ListSidebar
        open={menuOpen}
        header={kindToggle}
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
