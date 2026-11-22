import { useMemo, useState } from 'react';
import { api } from '../api.js';
import FanartBrowser from './FanartBrowser.jsx';
import ImageCropper from './ImageCropper.jsx';
import Modal from './Modal.jsx';

// Pick a picture of a character: your saved picks, fan art (best first) or
// the official AniList / MyAnimeList pictures. With `cropAspect`, a second
// step lets you choose the part of the picture to use.
export default function ImagePicker({ characterId, title, onPick, onReset, onClose, cropAspect = null }) {
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState('pick');
  const [crop, setCrop] = useState(null);
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
    <Modal title={step === 'crop' ? 'Choose the area' : title} onClose={onClose} wide>
      {step === 'pick' ? (
        <div className="picker-body">
          <FanartBrowser subject={`character:${characterId}`} official={official} selected={selected} onSelect={setSelected} allowSolo />
        </div>
      ) : (
        <ImageCropper src={selected} aspect={cropAspect} onChange={setCrop} />
      )}
      {error && <p className="error-text small">{error}</p>}
      <div className="modal-actions">
        {step === 'pick' && onReset && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => choose(onReset)}>
            Use original
          </button>
        )}
        {step === 'crop' && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep('pick')}>
            ← Back
          </button>
        )}
        <div className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        {step === 'pick' && cropAspect ? (
          <button type="button" className="btn primary" disabled={!selected} onClick={() => setStep('crop')}>
            Next: choose area
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!selected || busy || (step === 'crop' && !crop)} onClick={() => choose(() => onPick(selected, step === 'crop' ? crop : null))}>
            {busy ? 'Saving…' : 'Use this picture'}
          </button>
        )}
      </div>
    </Modal>
  );
}
