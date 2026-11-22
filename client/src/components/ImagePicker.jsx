import { useMemo, useState } from 'react';
import { api } from '../api.js';
import FanartBrowser from './FanartBrowser.jsx';
import Modal from './Modal.jsx';

// Pick a picture of a character: your saved picks, fan art (best first) or
// the official AniList / MyAnimeList pictures.
export default function ImagePicker({ characterId, title, onPick, onReset, onClose }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const official = useMemo(
    () => ({
      load: async () => {
        const a = await api.anilistImages(characterId).catch(() => ({ images: [] }));
        const m = await api.malImages(characterId).catch(() => ({ images: [] }));
        return { images: [...new Set([...a.images, ...m.images])] };
      },
    }),
    [characterId],
  );

  const choose = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="picker-body">
        <FanartBrowser subject={`character:${characterId}`} official={official} selected={selected} onSelect={setSelected} allowSolo />
      </div>
      {error && <p className="error-text small">{error}</p>}
      <div className="modal-actions">
        {onReset && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => choose(onReset)}>
            Use original
          </button>
        )}
        <div className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!selected || busy} onClick={() => choose(() => onPick(selected))}>
          {busy ? 'Saving…' : 'Use this picture'}
        </button>
      </div>
    </Modal>
  );
}
