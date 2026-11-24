import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, hubUrl } from './api.js';
import { TimerMini, TimerProvider } from './components/Timer.jsx';
import { MusicProvider } from './components/Music.jsx';
import UploadStatus from './components/UploadStatus.jsx';
import Home from './pages/Home.jsx';
import Today from './pages/Today.jsx';
import PathPage from './pages/Path.jsx';
import Lesson from './pages/Lesson.jsx';
import Sketchbook from './pages/Sketchbook.jsx';
import Drawing from './pages/Drawing.jsx';
import Progress from './pages/Progress.jsx';
import Settings from './pages/Settings.jsx';
import Check from './pages/Check.jsx';
import Handbook from './pages/Handbook.jsx';
import Method from './pages/Method.jsx';
import Portfolio from './pages/Portfolio.jsx';
import { Project, Projects } from './pages/Projects.jsx';
import Compare from './pages/Compare.jsx';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [p, query = ''] = h.split('?');
  return { parts: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(query) };
}

// Theme: follows the system unless chosen (stored per browser).
function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('atelier.theme') || 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('atelier.theme', theme);
    } catch {
      // ignore
    }
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1f2430' : '#f7f1e6');
  }, [theme]);
  return [theme, setTheme];
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.login(username, password);
      onLogin();
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <form className="card" style={{ width: 'min(400px, 100%)' }} onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 6 }}>
          <img className="brand-mark" src="/favicon.svg" alt="" /> Atelier
        </div>
        <p className="muted">Your drawing school. Log in with your Anime Hub account.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <label className="field">
            Username
            <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </label>
          <label className="field">
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {err && <p className="error small">{err}</p>}
          <button className="btn primary" disabled={busy || !username || !password}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </div>
      </form>
    </div>
  );
}

const NAV = [
  ['', 'Valley'],
  ['today', 'Today'],
  ['path', 'Path'],
  ['sketchbook', 'Sketchbook'],
  ['progress', 'Progress'],
];

export default function App() {
  const [user, setUser] = useState(undefined);
  const [route, setRoute] = useState(parseHash);
  const [profile, setProfile] = useState(null);
  const [critiqueInfo, setCritiqueInfo] = useState(null);
  const [meta, setMeta] = useState(null); // { areas, stages }
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useTheme();
  const [version, setVersion] = useState(0); // bumps when blocks finish (pages reload data)

  const loadUser = useCallback(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  useEffect(loadUser, [loadUser]);

  const refreshProfile = useCallback(async () => {
    const r = await api.profile();
    setProfile(r.profile);
    setCritiqueInfo(r.critique);
    // Keep the time zone current for reminders and day boundaries.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && r.profile.tz !== tz) api.saveProfile({ tz }).then((x) => setProfile(x.profile)).catch(() => {});
    return r.profile;
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshProfile().catch(() => {});
    api.stats().then((s) => setMeta({ areas: s.areas, stages: s.stages })).catch(() => {});
  }, [user, refreshProfile]);

  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const showToast = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2800);
  }, []);

  if (user === undefined) return null;
  if (!user) return <Login onLogin={loadUser} />;

  const [page = '', id] = route.parts;
  const ctx = { user, profile, setProfile, refreshProfile, critiqueInfo, setCritiqueInfo, areas: meta?.areas ?? [], stages: meta?.stages ?? [], toast: showToast, theme, setTheme, version, bump: () => setVersion((v) => v + 1), query: route.query };

  let body;
  switch (page) {
    case 'today':
      body = <Today />;
      break;
    case 'path':
      body = <PathPage />;
      break;
    case 'lesson':
      body = <Lesson id={id} key={id} />;
      break;
    case 'sketchbook':
      body = <Sketchbook tab={id} />;
      break;
    case 'drawing':
      body = <Drawing id={id} key={id} />;
      break;
    case 'progress':
      body = <Progress />;
      break;
    case 'settings':
      body = <Settings />;
      break;
    case 'check':
      body = <Check />;
      break;
    case 'clip-studio':
      body = <Handbook />;
      break;
    case 'method':
      body = <Method />;
      break;
    case 'portfolio':
      body = <Portfolio />;
      break;
    case 'projects':
      body = <Projects />;
      break;
    case 'compare':
      body = <Compare key={window.location.hash} />;
      break;
    case 'project':
      body = <Project id={id} key={id} />;
      break;
    default:
      body = <Home />;
  }

  const active = ['projects', 'project'].includes(page) ? 'sketchbook' : ['portfolio', 'compare'].includes(page) ? 'progress' : ['lesson', 'clip-studio', 'method'].includes(page) ? 'path' : page === 'drawing' ? 'sketchbook' : page === 'check' ? 'today' : page;

  return (
    <AppContext.Provider value={ctx}>
      <MusicProvider>
      <TimerProvider onChange={ctx.bump}>
        <header className="topbar">
          <a className="brand" href="#/">
            <img className="brand-mark" src="/favicon.svg" alt="" /> Atelier
          </a>
          <nav className="nav" aria-label="Main">
            {NAV.map(([p, label]) => (
              <a key={p} href={`#/${p}`} className={active === p ? 'active' : ''}>
                {label}
              </a>
            ))}
          </nav>
          <div className="topbar-right">
            <a className="btn small ghost" href={hubUrl()} title="Back to Anime Hub">
              Anime Hub ↗
            </a>
            <a className={`btn small ${page === 'settings' ? 'primary' : ''}`} href="#/settings" aria-label="Settings" title="Settings">
              ⚙
            </a>
          </div>
        </header>
        <main className="shell">
          {body}
          <footer className="footer small muted">
            <a href="#/clip-studio">Clip Studio handbook</a> · <a href="#/method">How Atelier teaches</a> · <a href={hubUrl()}>Anime Hub</a>
          </footer>
        </main>
        {page !== '' && <TimerMini />}
        {toast && <div className="toast">{toast}</div>}
        <UploadStatus />
      </TimerProvider>
      </MusicProvider>
    </AppContext.Provider>
  );
}
