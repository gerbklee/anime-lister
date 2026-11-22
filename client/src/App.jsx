import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { AppContext } from './AppContext.jsx';
import AuthPage from './components/AuthPage.jsx';
import Avatar from './components/Avatar.jsx';
import TabBar from './components/TabBar.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import ListsPage from './pages/ListsPage.jsx';
import WatchPage from './pages/WatchPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AnimeDetail from './pages/AnimeDetail.jsx';
import FeedPage from './pages/FeedPage.jsx';
import CharacterPage from './pages/CharacterPage.jsx';
import DiscoverPage from './pages/DiscoverPage.jsx';
import HomePage from './pages/HomePage.jsx';
import UsPage from './pages/UsPage.jsx';
import ShipPage from './pages/ShipPage.jsx';

function readRoute() {
  const h = window.location.hash.replace(/^#/, '');
  let m;
  if ((m = h.match(/^\/list\/(\d+)$/))) return { tab: 'lists', id: Number(m[1]) };
  // Anime and manga pages (not a tab of their own).
  if ((m = h.match(/^\/(anime|manga)\/(\d+)(\/suggest)?$/))) return { tab: 'anime', animeId: Number(m[2]), suggest: !!m[3] };
  // Profile: your anime catalogue and settings, or someone else's anime.
  if ((m = h.match(/^\/(?:profile|anime)\/u\/(\d+)$/))) return { tab: 'profile', view: 'anime', userId: Number(m[1]) };
  if ((m = h.match(/^\/profile\/u\/(\d+)\/(type|manga|stats)$/))) return { tab: 'profile', view: m[2], userId: Number(m[1]) };
  if ((m = h.match(/^\/profile\/(type|manga|stats)$/))) return { tab: 'profile', view: m[1] };
  if (h === '/profile' || h === '/anime') return { tab: 'profile', view: 'anime' };
  if (h === '/profile/settings' || h === '/settings') return { tab: 'profile', view: 'settings' };
  if ((m = h.match(/^\/watch\/(\d+)$/))) return { tab: 'watch', id: Number(m[1]) };
  if (h === '/watch') return { tab: 'watch' };
  if ((m = h.match(/^\/discover\/season\/(\d{4})\/(WINTER|SPRING|SUMMER|FALL)$/)))
    return { tab: 'discover', view: 'season', year: Number(m[1]), season: m[2] };
  if ((m = h.match(/^\/discover\/similar\/(\d+)$/))) return { tab: 'discover', view: 'similar', animeId: Number(m[1]) };
  if ((m = h.match(/^\/discover\/(calendar|foryou|similar)$/))) return { tab: 'discover', view: m[1] };
  if (h === '/discover' || h === '/discover/season') return { tab: 'discover', view: 'season' };
  if ((m = h.match(/^\/character\/(\d+)$/))) return { tab: 'character', id: Number(m[1]) };
  if (h === '/feed') return { tab: 'home', view: 'feed' };
  if ((m = h.match(/^\/us\/games\/(\d+)$/))) return { tab: 'us', view: 'games', gameId: Number(m[1]) };
  if ((m = h.match(/^\/us\/(compare|games|wrapped)$/))) return { tab: 'us', view: m[1] };
  if (h === '/us' || h === '/compare') return { tab: 'us', view: 'compare' };
  if (h === '/lists') return { tab: 'lists' };
  if (h === '/ships') return { tab: 'lists', ships: true };
  if ((m = h.match(/^\/ships\/new\/(\d+)$/))) return { tab: 'lists', ships: true, newWith: Number(m[1]) };
  if ((m = h.match(/^\/ship\/(\d+)$/))) return { tab: 'ship', id: Number(m[1]) };
  return { tab: 'home' };
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
  return <Main key={me.id} me={me} setMe={setMe} />;
}

function Main({ me, setMe }) {
  const [lists, setLists] = useState(null); // null = not loaded yet
  const [users, setUsers] = useState([]);
  const [catalogue, setCatalogue] = useState({});
  const [route, setRoute] = useState(readRoute);
  const [error, setError] = useState(null);

  const refreshLists = useCallback(async () => {
    try {
      const [nextLists, nextUsers] = await Promise.all([api.getLists(), api.users()]);
      setLists(nextLists);
      setUsers(nextUsers);
      setError(null);
    } catch (err) {
      if (err.status !== 401) setError(`Could not load your data: ${err.message}`);
    }
  }, []);

  const refreshCatalogue = useCallback(async () => {
    try {
      setCatalogue(await api.catalogueSummary());
    } catch {
      // badges just stay as they are
    }
  }, []);

  const navigate = useCallback((hash) => {
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(readRoute());
  }, []);

  useEffect(() => {
    refreshLists();
    refreshCatalogue();
  }, [refreshLists, refreshCatalogue]);

  // Pick up lists someone else shared with you, new avatars, etc.
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
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const ctx = useMemo(
    () => ({ me, setMe, users, usersById, lists, refreshLists, catalogue, refreshCatalogue, navigate }),
    [me, setMe, users, usersById, lists, refreshLists, catalogue, refreshCatalogue, navigate],
  );

  const logout = async () => {
    await api.logout().catch(() => {});
    window.history.replaceState(null, '', window.location.pathname);
    setMe(null);
  };

  let page;
  if (route.tab === 'lists') page = <ListsPage route={route} />;
  else if (route.tab === 'watch') page = <WatchPage route={route} />;
  else if (route.tab === 'anime') page = <AnimeDetail key={route.animeId} id={route.animeId} suggest={route.suggest} />;
  else if (route.tab === 'discover') page = <DiscoverPage route={route} />;
  else if (route.tab === 'character') page = <CharacterPage key={route.id} id={route.id} />;
  else if (route.tab === 'home') page = route.view === 'feed' ? <FeedPage /> : <HomePage />;
  else if (route.tab === 'us') page = <UsPage route={route} />;
  else if (route.tab === 'ship') page = <ShipPage key={route.id} id={route.id} />;
  else page = <ProfilePage route={route} onLogout={logout} />;

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <a className="logo" href="#/">
            <span aria-hidden="true">⭐</span> Anime Lister
          </a>
          <div className="top-nav">
            <ThemeToggle />
            <a
              href="#/profile"
              className={`nav-link ${route.tab === 'profile' && !route.userId ? 'active' : ''}`}
              title="My profile: my anime and settings"
            >
              <Avatar user={me} size={26} />
              <span className="hide-mobile">{me.username}</span>
            </a>
          </div>
        </header>
        <TabBar active={route.tab === 'ship' ? 'lists' : route.tab} />

        {error && <div className="banner error app-banner">{error}</div>}

        <div className="page">{page}</div>
      </div>
    </AppContext.Provider>
  );
}
