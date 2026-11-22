import { useCallback, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import AuthPage from './components/AuthPage.jsx';
import Avatar from './components/Avatar.jsx';
import ComparePage from './components/ComparePage.jsx';
import ListSidebar from './components/ListSidebar.jsx';
import ListView from './components/ListView.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

function readRoute() {
  const hash = window.location.hash;
  const list = hash.match(/^#\/list\/(\d+)$/);
  if (list) return { page: 'list', id: Number(list[1]) };
  if (hash === '#/compare') return { page: 'compare' };
  if (hash === '#/settings') return { page: 'settings' };
  return { page: 'home' };
}

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = checking, null = logged out

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <p className="muted center-page">Loading…</p>;
  if (!me) return <AuthPage onAuthed={setMe} />;
  return <Main key={me.id} me={me} onLoggedOut={() => setMe(null)} />;
}

function Main({ me, onLoggedOut }) {
  const [lists, setLists] = useState(null); // null = not loaded yet
  const [users, setUsers] = useState([]);
  const [route, setRoute] = useState(readRoute);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshLists = useCallback(async () => {
    try {
      const [nextLists, nextUsers] = await Promise.all([api.getLists(), api.users()]);
      setLists(nextLists);
      setUsers(nextUsers);
      setError(null);
    } catch (err) {
      if (err.status !== 401) setError(`Could not load lists: ${err.message}`);
    }
  }, []);

  const navigate = useCallback((hash) => {
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(readRoute());
  }, []);

  useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  // Pick up lists someone else shared with you.
  useEffect(() => {
    const refreshIfVisible = () => document.visibilityState === 'visible' && refreshLists();
    const timer = setInterval(refreshIfVisible, 30_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refreshLists]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(readRoute());
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Home, or a list that no longer exists: go to the first of your own/shared lists.
  useEffect(() => {
    if (!lists || route.page === 'compare' || route.page === 'settings') return;
    if (route.page === 'list' && lists.some((l) => l.id === route.id)) return;
    const first = lists.find((l) => l.isOwner || l.isShared) ?? lists[0];
    if (first) navigate(`#/list/${first.id}`);
    else if (route.page !== 'home') navigate('#/');
  }, [lists, route, navigate]);

  const handleCreate = async (name, shared) => {
    const list = await api.createList(name, shared);
    await refreshLists();
    navigate(`#/list/${list.id}`);
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    window.history.replaceState(null, '', window.location.pathname);
    onLoggedOut();
  };

  const selected = route.page === 'list' ? lists?.find((l) => l.id === route.id) : undefined;

  let content;
  if (route.page === 'compare') {
    content = <ComparePage me={me} users={users} />;
  } else if (route.page === 'settings') {
    content = <SettingsPage me={me} onLogout={logout} />;
  } else if (lists === null) {
    content = <p className="muted">Loading…</p>;
  } else if (selected) {
    content = <ListView key={selected.id} listId={selected.id} me={me} users={users} onListsChanged={refreshLists} />;
  } else {
    content = (
      <div className="empty-state">
        <h2>No lists yet</h2>
        <p className="muted">Create your first list, e.g. “Top 10 Villains”.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="logo" href="#/">
          <span aria-hidden="true">⭐</span> Anime Lister
        </a>
        <nav className="top-nav">
          <a href="#/compare" className={`nav-link ${route.page === 'compare' ? 'active' : ''}`}>
            <span aria-hidden="true">📊</span> <span className="hide-mobile">Compare</span>
          </a>
          <ThemeToggle />
          <a
            href="#/settings"
            className={`nav-link ${route.page === 'settings' ? 'active' : ''}`}
            title="Account settings"
          >
            <Avatar user={me} size={24} />
            <span className="hide-mobile">{me.username}</span>
          </a>
        </nav>
      </header>

      {error && <div className="banner error">{error}</div>}

      <div className="layout">
        <button className="list-switcher" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
          <span>📋 {selected ? selected.name : 'Lists'}</span>
          <span aria-hidden="true">{menuOpen ? '▲' : '▼'}</span>
        </button>
        <ListSidebar
          open={menuOpen}
          lists={lists ?? []}
          selectedId={route.page === 'list' ? route.id : null}
          onCreate={handleCreate}
          onPick={() => setMenuOpen(false)}
        />
        <main className="main">{content}</main>
      </div>
    </div>
  );
}
