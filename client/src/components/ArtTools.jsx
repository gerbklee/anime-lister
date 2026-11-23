import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import ImageCropper from './ImageCropper.jsx';
import Modal from './Modal.jsx';


// ---- Add to board ------------------------------------------------------------------------------

export function AddToBoardDialog({ item, onClose }) {
  const [boards, setBoards] = useState(null);
  const [inBoards, setInBoards] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.boards(), api.boardsWith(item)])
      .then(([b, w]) => {
        setBoards(b.boards);
        setInBoards(new Set(w.boardIds));
      })
      .catch((err) => setError(err.message));
  }, [item]);

  const add = async (board) => {
    setBusy(board.id);
    setError(null);
    try {
      await api.addToBoard(board.id, item);
      setInBoards((s) => new Set([...s, board.id]));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };
  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const b = await api.createBoard(name.trim());
      setBoards((list) => [b, ...(list ?? [])]);
      setName('');
      await add(b);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title="📌 Add to board" onClose={onClose} center>
      {error && <div className="banner error">{error}</div>}
      <form className="trope-custom" onSubmit={create}>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="New board, e.g. Gojo aesthetics" aria-label="New board name" />
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Create
        </button>
      </form>
      {!boards ? (
        <p className="muted">Loading…</p>
      ) : boards.length === 0 ? (
        <p className="muted small">No boards yet. Create your first one above.</p>
      ) : (
        <ul className="board-pick">
          {boards.map((b) => (
            <li key={b.id}>
              <button type="button" className="menu-item" onClick={() => !inBoards.has(b.id) && add(b)} disabled={busy === b.id}>
                <span className="board-pick-cover">{b.covers[0] ? <img src={b.covers[0]} alt="" /> : <span>{b.emoji ?? '📌'}</span>}</span>
                <span className="menu-item-name">
                  {b.emoji ? `${b.emoji} ` : ''}
                  {b.name}
                  {b.isShared && <span className="muted tiny"> · 👥</span>}
                </span>
                <span className="muted small">{inBoards.has(b.id) ? '✓ Added' : busy === b.id ? 'Adding…' : b.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="modal-actions">
        <div className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

// ---- Wallpaper maker ---------------------------------------------------------------------------

const TARGETS = {
  phone: { label: '📱 Phone', aspect: 1290 / 2796 },
  desktop: { label: '🖥️ Desktop', aspect: 16 / 9 },
};

function ClockPreview({ target }) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className={`clock-preview ${target}`} aria-hidden="true">
      <span className="clock-date">{date}</span>
      <span className="clock-time">{time}</span>
    </div>
  );
}

export function WallpaperMaker({ item, onClose }) {
  const [target, setTarget] = useState(() => ((item.height ?? 1) >= (item.width ?? 1) ? 'phone' : 'desktop'));
  const [crop, setCrop] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const src = item.remoteUrl ?? item.full;

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.makeWallpaper(src, crop, target));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Make a wallpaper" onClose={onClose} center>
      {result ? (
        <div className="wallpaper-result">
          <img src={result.url} alt="Your wallpaper" className={result.target} />
          <p className="muted small">
            On iPhone: <b>press and hold the picture → “Save to Photos”</b>, then set it as wallpaper in the Photos app.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setResult(null)}>
              ← Adjust
            </button>
            <div className="spacer" />
            <a className="btn primary" href={result.url} download="anime-hub-wallpaper.jpg">
              Download
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="segmented small wallpaper-target" role="radiogroup" aria-label="Device">
            {Object.entries(TARGETS).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={target === k} className={target === k ? 'active' : ''} onClick={() => setTarget(k)}>
                {t.label}
              </button>
            ))}
          </div>
          <ImageCropper key={target} src={src} aspect={TARGETS[target].aspect} onChange={setCrop} overlay={<ClockPreview target={target} />} maxWidth={target === 'phone' ? 230 : 320} />
          {error && <div className="banner error">{error}</div>}
          <div className="modal-actions">
            <div className="spacer" />
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={make} disabled={!crop || busy}>
              {busy ? 'Making…' : 'Make wallpaper'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// Dialogs and actions the Art tab's viewer uses: boards, wallpapers, following
// artists, profile photo.
export function useArtActions() {
  const { setMe, refreshLists } = useApp();
  const [board, setBoard] = useState(null);
  const [wallpaper, setWallpaper] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const follow = async (artist, name) => {
    try {
      await api.follow(artist, name);
      setToast(`🖌️ Following ${name}`);
    } catch (err) {
      setToast(err.message);
    }
  };

  const useAsAvatar = async (url) => {
    try {
      setMe(await api.setAvatar(url));
      refreshLists();
      setToast('✓ Profile photo updated');
    } catch (err) {
      setToast(err.message);
    }
  };

  const dialogs = (
    <>
      {board && <AddToBoardDialog item={board} onClose={() => setBoard(null)} />}
      {wallpaper && <WallpaperMaker item={wallpaper} onClose={() => setWallpaper(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );

  return { openBoard: setBoard, openWallpaper: setWallpaper, follow, useAsAvatar, toast: setToast, dialogs };
}
