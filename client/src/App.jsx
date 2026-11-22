import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import ListSidebar from './components/ListSidebar.jsx';
import ListView from './components/ListView.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

function readHash() {
  const match = window.location.hash.match(/^#\/list\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export default function App() {
  const [lists, setLists] = useState(null); // null = not loaded yet
  const [selectedId, setSelectedId] = useState(readHash);
  const [error, setError] = useState(null);

  const refreshLists = useCallback(async () => {
    try {
      setLists(await api.getLists());
      setError(null);
    } catch (err) {
      setError(`Could not load lists: ${err.message}`);
    }
  }, []);

  const selectList = useCallback((id) => {
    if (id == null) {
      window.history.replaceState(null, '', window.location.pathname);
    } else if (readHash() !== id) {
      window.location.hash = `/list/${id}`;
    }
    setSelectedId(id);
  }, []);

  useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    const onHashChange = () => setSelectedId(readHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Fall back to the first list when nothing (or a deleted list) is selected.
  useEffect(() => {
    if (!lists) return;
    if (selectedId != null && lists.some((l) => l.id === selectedId)) return;
    selectList(lists.length ? lists[0].id : null);
  }, [lists, selectedId, selectList]);

  const handleCreate = async (name) => {
    const list = await api.createList(name);
    await refreshLists();
    selectList(list.id);
  };

  const selected = lists?.find((l) => l.id === selectedId);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo">
          <span aria-hidden="true">⭐</span> Anime Lister
        </h1>
        <ThemeToggle />
      </header>

      {error && <div className="banner error">{error}</div>}

      <div className="layout">
        <ListSidebar lists={lists ?? []} selectedId={selectedId} onSelect={selectList} onCreate={handleCreate} />

        <main className="main">
          {lists === null ? (
            <p className="muted">Loading…</p>
          ) : selected ? (
            <ListView key={selected.id} listId={selected.id} onListsChanged={refreshLists} />
          ) : (
            <div className="empty-state">
              <h2>No lists yet</h2>
              <p className="muted">Create your first list in the sidebar, e.g. “Top 10 Villains”.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
