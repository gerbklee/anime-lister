import { useState } from 'react';
import ImageCropper from './ImageCropper.jsx';
import Modal from './Modal.jsx';

export const PORTRAIT_ASPECT = 5 / 7;

// Choose the part of `src` to use as a portrait. `children` go above the
// cropper (e.g. which lists to use it in).
export default function CropDialog({ title = 'Choose the area', src, initialCrop, onSave, onClose, saveLabel = 'Save', canSave = true, children }) {
  const [crop, setCrop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(crop);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} center>
      {children}
      <ImageCropper src={src} aspect={PORTRAIT_ASPECT} initialCrop={initialCrop} onChange={setCrop} />
      {error && <div className="banner error">{error}</div>}
      <div className="modal-actions">
        <div className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!crop || busy || !canSave} onClick={save}>
          {busy ? 'Saving…' : saveLabel}
        </button>
      </div>
    </Modal>
  );
}
