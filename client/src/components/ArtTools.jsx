import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import ImageCropper from './ImageCropper.jsx';
import Modal from './Modal.jsx';

const pretty = (tag) => String(tag ?? '').replace(/_\(.*\)$/, '').replace(/_/g, ' ');
const artistTag = (name) => String(name ?? '').trim().replace(/\s+/g, '_');

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

// ---- What is this? -----------------------------------------------------------------------------

export function WhatIsThisDialog({ url, onClose, onSearch, onFollow }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    let stopped = false;
    api
      .whatIs(url)
      .then(({ id }) => {
        const poll = async () => {
          if (stopped) return;
          try {
            const j = await api.whatIsResult(id);
            setJob(j);
            if (j.status === 'running') timer.current = setTimeout(poll, 3000);
          } catch (err) {
            setError(err.message);
          }
        };
        poll();
      })
      .catch((err) => setError(err.message));
    return () => {
      stopped = true;
      clearTimeout(timer.current);
    };
  }, [url]);

  const results = job?.results ?? [];
  return (
    <Modal title="❓ What is this?" onClose={onClose} center>
      <div className="whatis">
        <img className="whatis-query" src={url} alt="" referrerPolicy="no-referrer" />
        {error && <div className="banner error">{error}</div>}
        {!error && (!job || job.status === 'running') && (
          <div className="whatis-waiting">
            <span className="spinner inline-small" aria-hidden="true" />
            <div>
              <b>Looking it up…</b>
              <p className="muted small">IQDB compares it with millions of pictures. When it's busy this can take 1–2 minutes; you can close this and keep browsing.</p>
              {job && <span className="muted tiny">{job.seconds}s</span>}
            </div>
          </div>
        )}
        {job?.status === 'error' && <div className="banner error">{job.error}</div>}
        {job?.status === 'done' && results.length === 0 && <p className="muted">No match found. It may be too new or not on Danbooru yet.</p>}
        {results.map((r, i) => (
          <div key={i} className="whatis-result card">
            <div className="whatis-head">
              {r.item?.thumb && <img src={r.item.thumb} alt="" />}
              <div>
                <b>{r.similarity}% match</b>
                {!r.workSafe && <span className="muted tiny"> · not work-safe, not shown</span>}
                <div className="whatis-links">
                  <a href={r.postUrl} target="_blank" rel="noreferrer">
                    Danbooru ↗
                  </a>
                  {r.sourceUrl && (
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                      Original ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="whatis-chips">
              {r.artists.map((a) => (
                <span key={a} className="chip-group">
                  <button type="button" className="chip kind-artist" onClick={() => onSearch([{ tag: a, label: pretty(a), kind: 'artist' }])}>
                    🖌️ {pretty(a)}
                  </button>
                  {onFollow && (
                    <button type="button" className="chip small" onClick={() => onFollow(a, pretty(a))} title="Follow artist">
                      + Follow
                    </button>
                  )}
                </span>
              ))}
              {r.characters.slice(0, 4).map((c) => (
                <button key={c} type="button" className="chip kind-character" onClick={() => onSearch([{ tag: c, label: pretty(c), kind: 'character' }])}>
                  👤 {pretty(c)}
                </button>
              ))}
              {r.series.slice(0, 2).map((s) => (
                <button key={s} type="button" className="chip kind-series" onClick={() => onSearch([{ tag: s, label: pretty(s), kind: 'series' }])}>
                  🎬 {pretty(s)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---- Viewer actions for art --------------------------------------------------------------------

// Everything you can do with a picture in the Art area. Returns the viewer
// props (actions + main button) and the dialogs to render.
export function useArtActions({ onSearch, onSimilar }) {
  const { setMe, refreshLists } = useApp();
  const [board, setBoard] = useState(null);
  const [wallpaper, setWallpaper] = useState(null);
  const [whatIs, setWhatIs] = useState(null);
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

  const isDanbooru = (item) => item.source === 'danbooru';
  const actions = [
    { icon: '📱', label: 'Make wallpaper', onSelect: (item) => setWallpaper(item) },
    { icon: '🖌️', label: (item) => `More by ${item.artist}`, show: (item) => isDanbooru(item) && !!item.artist, onSelect: (item) => onSimilar(item, 'artist') },
    { icon: '👥', label: 'More with these characters', show: isDanbooru, onSelect: (item) => onSimilar(item, 'characters') },
    { icon: '🧬', label: 'More like this', show: isDanbooru, onSelect: (item) => onSimilar(item, 'tags') },
    { icon: '➕', label: (item) => `Follow ${item.artist}`, show: (item) => isDanbooru(item) && !!item.artist, onSelect: (item) => follow(artistTag(item.artist), item.artist) },
    { icon: '❓', label: 'What is this?', show: (item) => !isDanbooru(item), onSelect: (item) => setWhatIs(item.remoteUrl ?? item.full) },
    {
      icon: '👤',
      label: 'Use as profile photo',
      onSelect: async (item) => {
        try {
          setMe(await api.setAvatar(item.remoteUrl ?? item.full));
          refreshLists();
          setToast('✓ Profile photo updated');
        } catch (err) {
          setToast(err.message);
        }
      },
    },
    { icon: '↗️', label: 'Open full size', onSelect: (item) => window.open(item.remoteUrl ?? item.full, '_blank', 'noopener') },
  ];

  const dialogs = (
    <>
      {board && <AddToBoardDialog item={board} onClose={() => setBoard(null)} />}
      {wallpaper && <WallpaperMaker item={wallpaper} onClose={() => setWallpaper(null)} />}
      {whatIs && (
        <WhatIsThisDialog
          url={whatIs}
          onClose={() => setWhatIs(null)}
          onFollow={follow}
          onSearch={(chips) => {
            setWhatIs(null);
            onSearch(chips);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );

  return {
    viewerProps: { actions, primary: { label: '📌 Board', onSelect: (item) => setBoard(item) } },
    openWhatIs: setWhatIs,
    dialogs,
  };
}
