import { useEffect, useState } from 'react';
import { api } from '../api.js';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// "App & notifications" card in Settings.
export default function AppSettings() {
  const secure = window.isSecureContext;
  const pushSupported = secure && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [installReady, setInstallReady] = useState(!!window.__installPrompt);
  const [status, setStatus] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const onReady = () => setInstallReady(true);
    window.addEventListener('installprompt-ready', onReady);
    return () => window.removeEventListener('installprompt-ready', onReady);
  }, []);

  useEffect(() => {
    api.pushStatus().then(setStatus).catch(() => {});
    if (pushSupported) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub))
        .catch(() => {});
    }
  }, [pushSupported]);

  const install = async () => {
    const prompt = window.__installPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    window.__installPrompt = null;
    setInstallReady(false);
  };

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications were not allowed. You can allow them in the browser/phone settings.');
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api.pushKey();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await api.pushSubscribe(sub.toJSON());
      setSubscribed(true);
      setStatus(await api.pushStatus());
      setMessage({ ok: true, text: 'Notifications are on for this device.' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.pushUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setStatus(await api.pushStatus());
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (type, value) => {
    const res = await api.pushPrefs({ [type]: value });
    setStatus((s) => ({ ...s, prefs: res.prefs }));
  };

  const test = async () => {
    setMessage(null);
    try {
      await api.pushTest();
      setMessage({ ok: true, text: 'Test sent: it should appear in a few seconds.' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  };

  return (
    <div className="card settings-card">
      <h3>📱 App & notifications</h3>
      {!secure ? (
        <p className="muted small">
          Installing the app and push notifications need a secure (https) address. Open the site through its Tailscale address
          (e.g. <code>https://animelister.your-tailnet.ts.net</code>) to use them. Everything else works here as usual.
        </p>
      ) : (
        <>
          {isStandalone() ? (
            <p className="ok-text small">✓ Running as an installed app.</p>
          ) : installReady ? (
            <button className="btn primary" onClick={install}>
              📲 Install app
            </button>
          ) : isIos() ? (
            <p className="small">
              To install on iPhone/iPad: tap <b>Share</b> <span aria-hidden="true">⬆️</span> in Safari, then <b>Add to Home Screen</b>.
              Notifications on iPhone only work from the installed app.
            </p>
          ) : (
            <p className="muted small">Use your browser menu → “Install app” / “Add to Home screen”.</p>
          )}

          {pushSupported ? (
            <>
              <div className="push-row">
                {subscribed ? (
                  <>
                    <span className="ok-text small">🔔 Notifications on for this device</span>
                    <button className="btn ghost small-btn" onClick={test}>
                      Send test
                    </button>
                    <button className="btn ghost small-btn" onClick={disable} disabled={busy}>
                      Turn off here
                    </button>
                  </>
                ) : (
                  <button className="btn primary" onClick={enable} disabled={busy}>
                    🔔 Turn on notifications
                  </button>
                )}
              </div>
              {status && (
                <div className="push-prefs">
                  <span className="muted tiny">Notify me about (all your devices):</span>
                  {Object.entries(status.types).map(([type, label]) => (
                    <label key={type} className="check small">
                      <input type="checkbox" checked={status.prefs[type]} onChange={(e) => toggle(type, e.target.checked)} /> {label}
                    </label>
                  ))}
                  <span className="muted tiny">{status.devices} device(s) with notifications on.</span>
                </div>
              )}
            </>
          ) : (
            <p className="muted small">This browser doesn't support push notifications{isIos() && !isStandalone() ? ' until the app is installed' : ''}.</p>
          )}
        </>
      )}
      {message && <p className={message.ok ? 'ok-text small' : 'error-text small'}>{message.text}</p>}
    </div>
  );
}
