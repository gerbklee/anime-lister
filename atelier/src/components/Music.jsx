import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Music while you draw: Spotify's embedded player (no login to Atelier, no
// developer app). It lives in a small dock that stays mounted on every page,
// so music keeps playing while you move around. The focus timer drives it:
// your focus playlist starts with a block, the break playlist (or a pause)
// comes with the bell. Full tracks play when you're logged in to Spotify in
// this browser; otherwise Spotify plays 30-second previews.
// Settings are per device (localStorage): a phone and a desktop can differ.

const KEY = 'atelier.music';
const load = () => {
  try {
    return { auto: true, open: false, focusUrl: '', breakUrl: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { auto: true, open: false, focusUrl: '', breakUrl: '' };
  }
};

// "https://open.spotify.com/playlist/ID?si=…" or "spotify:playlist:ID" -> "spotify:playlist:ID"
export function spotifyUri(url) {
  const s = String(url ?? '').trim();
  let m = s.match(/^spotify:(playlist|album|track|artist|show|episode):([A-Za-z0-9]+)$/);
  if (m) return `spotify:${m[1]}:${m[2]}`;
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

const MusicContext = createContext(null);
export const useMusic = () => useContext(MusicContext);

let apiPromise = null;
function spotifyApi() {
  apiPromise ??= new Promise((resolve, reject) => {
    window.onSpotifyIframeApiReady = (api) => resolve(api);
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('Spotify couldn’t be loaded'));
    };
    document.body.appendChild(s);
  });
  return apiPromise;
}

export function MusicProvider({ children }) {
  const [settings, setSettings] = useState(load);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);
  const host = useRef(null);
  const controller = useRef(null);
  const current = useRef(null);

  const save = useCallback((patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const focusUri = spotifyUri(settings.focusUrl);
  const breakUri = spotifyUri(settings.breakUrl);

  // Create the player once there is something to play.
  useEffect(() => {
    if (!focusUri || controller.current || !host.current) return;
    let cancelled = false;
    spotifyApi()
      .then((api) => {
        if (cancelled || controller.current) return;
        const el = document.createElement('div');
        host.current.appendChild(el);
        api.createController(el, { uri: focusUri, width: '100%', height: 80 }, (c) => {
          controller.current = c;
          current.current = focusUri;
          c.addListener('playback_update', (e) => setPlaying(!e.data.isPaused));
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [focusUri]);

  // A new focus playlist in Settings replaces the loaded one.
  useEffect(() => {
    const c = controller.current;
    if (c && focusUri && current.current !== focusUri && !playing) {
      c.loadUri(focusUri);
      current.current = focusUri;
    }
  }, [focusUri, playing]);

  const playUri = useCallback((uri) => {
    const c = controller.current;
    if (!c || !uri) return;
    if (current.current !== uri) {
      c.loadUri(uri);
      current.current = uri;
      setTimeout(() => c.play(), 700);
    } else if (typeof c.resume === 'function') c.resume();
    else c.play();
  }, []);
  const pause = useCallback(() => {
    const c = controller.current;
    if (!c) return;
    if (typeof c.pause === 'function') c.pause();
    else if (playing) c.togglePlay();
  }, [playing]);

  const value = {
    settings,
    save,
    playing,
    error,
    ready: !!focusUri,
    // Called by the timer.
    onFocus: () => settings.auto && playUri(focusUri),
    onBreak: () => {
      if (!settings.auto) return;
      if (breakUri) playUri(breakUri);
      else pause();
    },
    onStop: () => settings.auto && pause(),
    toggle: () => controller.current?.togglePlay(),
  };

  return (
    <MusicContext.Provider value={value}>
      {children}
      {focusUri && (
        <div className={`music-dock ${settings.open ? 'open' : ''}`}>
          <button className="music-toggle" onClick={() => save({ open: !settings.open })} aria-expanded={settings.open} title={settings.open ? 'Hide the player' : 'Show the player'}>
            {playing ? '♫' : '♪'}
          </button>
          {/* Always mounted (hidden when closed) so the music keeps playing. */}
          <div className="music-player" ref={host} />
        </div>
      )}
    </MusicContext.Provider>
  );
}

// The settings block (used on the Settings page).
export function MusicSettings() {
  const m = useMusic();
  const [focus, setFocus] = useState(m.settings.focusUrl);
  const [brk, setBrk] = useState(m.settings.breakUrl);
  const bad = (v) => v && !spotifyUri(v);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label className="field">
        Focus playlist (Spotify link)
        <input type="text" placeholder="https://open.spotify.com/playlist/…" value={focus} onChange={(e) => setFocus(e.target.value)} onBlur={() => !bad(focus) && m.save({ focusUrl: focus })} />
        {bad(focus) && <span className="tiny error">That doesn’t look like a Spotify link (playlist, album or track).</span>}
      </label>
      <label className="field">
        Break playlist (optional)
        <input type="text" placeholder="Leave empty to pause during breaks" value={brk} onChange={(e) => setBrk(e.target.value)} onBlur={() => !bad(brk) && m.save({ breakUrl: brk })} />
        {bad(brk) && <span className="tiny error">That doesn’t look like a Spotify link.</span>}
      </label>
      <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={m.settings.auto} onChange={(e) => m.save({ auto: e.target.checked })} /> Start and stop the music with the focus timer
      </label>
      <p className="tiny muted" style={{ margin: 0 }}>
        In Spotify: ⋯ on a playlist → Share → Copy link. Full tracks play when you’re logged in to Spotify in this browser (open.spotify.com); otherwise Spotify plays 30-second previews. Saved on this device only.
      </p>
    </div>
  );
}
