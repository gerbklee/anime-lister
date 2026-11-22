import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import ListSidebar from '../components/ListSidebar.jsx';
import ListView from '../components/ListView.jsx';

const KIND_KEY = 'lists-kind';

function savedKind() {
  try {
    return localStorage.getItem(KIND_KEY) === 'anime' ? 'anime' : 'character';
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
    </div>
  );

  return (
    <div className="layout">
      <button className="list-switcher" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
        <span>
          {kind === 'anime' ? '🎬' : '👤'} {selected ? selected.name : kind === 'anime' ? 'Anime lists' : 'Character lists'}
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
            <h2>No {kind === 'anime' ? 'anime' : 'character'} lists yet</h2>
            <p className="muted">
              Create one in the sidebar, e.g. {kind === 'anime' ? '“Best openings” or “Top 10 anime”' : '“Top 10 Villains”'}.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
