import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { animeMeta } from '../util.js';
import Modal from './Modal.jsx';
import AddToListMenu from './AddToListMenu.jsx';
import { embedUrl } from './TrailerModal.jsx';

const AUTO_KEY = 'reel-auto';

// Plays a series of trailers one after another. With auto-advance on, the next
// trailer starts when a YouTube video ends (via the YouTube iframe messages).
export default function TrailerReel({ items, startIndex = 0, title, onClose }) {
  const { navigate } = useApp();
  const [index, setIndex] = useState(startIndex);
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem(AUTO_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const frameRef = useRef(null);
  const current = items[index];
  const autoRef = useRef(auto);
  autoRef.current = auto;

  const go = (delta) => setIndex((i) => Math.min(Math.max(i + delta, 0), items.length - 1));

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_KEY, auto ? 'on' : 'off');
    } catch {
      // not important
    }
  }, [auto]);

  // Detect "video ended" from the YouTube player.
  useEffect(() => {
    const onMessage = (e) => {
      let host;
      try {
        host = new URL(e.origin).hostname;
      } catch {
        return;
      }
      if (!/youtube(-nocookie)?\.com$/.test(host)) return;
      let data;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      const ended =
        (data?.event === 'onStateChange' && data.info === 0) ||
        (data?.event === 'infoDelivery' && data.info?.playerState === 0);
      if (ended && autoRef.current) setIndex((i) => (i < items.length - 1 ? i + 1 : i));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [items.length]);

  const onFrameLoad = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'listening', id: 'reel' }), '*');
    win.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }), '*');
  };

  if (!current) return null;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="video-frame">
        <iframe
          key={current.id}
          ref={frameRef}
          src={embedUrl(current.trailer, { api: true })}
          title={`${current.title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onLoad={onFrameLoad}
        />
      </div>
      <div className="reel-info">
        <div className="reel-title">
          <button
            type="button"
            className="link-btn reel-name"
            onClick={() => {
              onClose();
              navigate(`#/anime/${current.id}`);
            }}
          >
            {current.title}
          </button>
          <span className="muted small">{animeMeta(current)}</span>
        </div>
        <AddToListMenu kind="watchlist" itemId={current.id} label="🍿 To watch" className="btn ghost small-btn" />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => go(-1)} disabled={index === 0}>
          ◀ Previous
        </button>
        <span className="muted small">
          {index + 1} / {items.length}
        </span>
        <button type="button" className="btn primary" onClick={() => go(1)} disabled={index === items.length - 1}>
          Next ▶
        </button>
        <div className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-advance
        </label>
      </div>
    </Modal>
  );
}
