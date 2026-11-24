import { useEffect, useState } from 'react';
import { notifyWanted } from './Timer.jsx';

// Settings: install Atelier as an app, and timer notifications.
export default function AppSection() {
  const [installable, setInstallable] = useState(() => !!window.__atelierInstall);
  const [notify, setNotify] = useState(notifyWanted);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const secure = window.isSecureContext;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  useEffect(() => {
    const on = () => setInstallable(true);
    window.addEventListener('atelier-installable', on);
    return () => window.removeEventListener('atelier-installable', on);
  }, []);

  const install = async () => {
    const e = window.__atelierInstall;
    if (!e) return;
    e.prompt();
    await e.userChoice.catch(() => null);
    window.__atelierInstall = null;
    setInstallable(false);
  };
  const toggleNotify = async (on) => {
    setNotify(on);
    try {
      localStorage.setItem('atelier.notify', on ? '1' : '0');
    } catch {
      // ignore
    }
    if (on && 'Notification' in window && Notification.permission === 'default') setPerm(await Notification.requestPermission());
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <strong className="small">Install Atelier as an app</strong>
        {standalone ? (
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            ✓ You’re using the installed app.
          </p>
        ) : !secure ? (
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            Installing needs the HTTPS address (Tailscale: https://…ts.net:8443). Open Atelier there.
          </p>
        ) : installable ? (
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn small primary" onClick={install}>
              Install Atelier
            </button>
          </div>
        ) : (
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            {ios
              ? 'On iPhone/iPad: Safari → Share → “Add to Home Screen”.'
              : 'In Chrome or Edge: the install icon in the address bar, or menu → “Install Atelier”. On Android: menu → “Add to Home screen”. Firefox on desktop doesn’t install web apps; Atelier works the same in a pinned tab.'}
          </p>
        )}
      </div>
      <div>
        <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={notify} onChange={(e) => toggleNotify(e.target.checked)} /> Notify me when a focus block or break ends while Atelier is in the background
        </label>
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          {perm === 'denied'
            ? 'Notifications are blocked for this site in your browser settings.'
            : perm === 'unsupported'
              ? 'This browser doesn’t support notifications.'
              : 'Browsers check background tabs less often, so a notification can come up to a minute late.'}
        </p>
      </div>
    </div>
  );
}
