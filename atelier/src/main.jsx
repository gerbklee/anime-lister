import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Installable app + offline shell (needs HTTPS, e.g. the Tailscale address).
// Chrome, Edge and Android offer an install prompt; keep it for the button in Settings.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__atelierInstall = e;
  window.dispatchEvent(new Event('atelier-installable'));
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')).render(<App />);
