import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import ListSidebar from '../components/ListSidebar.jsx';
import ListView from '../components/ListView.jsx';

// Shared "to watch" lists.
export default function WatchPage({ route }) {
  const { lists, refreshLists, navigate } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const watchlists = (lists ?? []).filter((l) => l.kind === 'watchlist');
  const selected = watchlists.find((l) => l.id === route.id);

  useEffect(() => setMenuOpen(false), [route.id]);

  useEffect(() => {
    if (!lists || selected) return;
    if (watchlists[0]) navigate(`#/watch/${watchlists[0].id}`);
    else if (route.id) navigate('#/watch');
  }, [lists, selected, watchlists, route.id, navigate]);

  const handleCreate = async (name) => {
    const list = await api.createList(name, true, 'watchlist');
    await refreshLists();
    navigate(`#/watch/${list.id}`);
  };

  return (
    <div className="layout">
      <button className="list-switcher" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
        <span>🍿 Watchlists <span className="muted small">· {watchlists.length}</span></span>
        <span aria-hidden="true">▾</span>
      </button>
      <ListSidebar
        open={menuOpen}
        watchlists
        lists={watchlists}
        selectedId={selected?.id ?? null}
        hrefFor={(l) => `#/watch/${l.id}`}
        onCreate={handleCreate}
        onPick={() => setMenuOpen(false)}
      />
      <main className="main">
        {lists === null ? (
          <p className="muted">Loading…</p>
        ) : selected ? (
          <ListView key={selected.id} listId={selected.id} onListsChanged={refreshLists} />
        ) : (
          <div className="empty-state">
            <h2>🍿 Nothing to watch yet</h2>
            <p className="muted">
              Create a watchlist in the sidebar (e.g. “Us two” or “Movie nights”) and invite someone by username. Then add
              anime you want to watch together, watch trailers and discuss them.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
