import { useEffect, useState } from 'react';
import { api, characterSearch } from '../api.js';
import { SHIP_STATUS, blendNames } from '../util.js';
import Modal from './Modal.jsx';
import SearchBox from './SearchBox.jsx';

// Pick 2–4 characters, name the ship and choose canon/fanon/crack.
// `initial`: characters to start with, [{ id, name, image }].
export default function ShipBuilder({ initial = [], onClose, onCreated }) {
  const [members, setMembers] = useState(initial);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [status, setStatus] = useState('fanon');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    if (!nameTouched) setName(blendNames(members.map((m) => m.name)));
    setExisting(null);
  }, [members, nameTouched]);

  const add = async (r) => {
    if (members.length >= 4 || members.some((m) => m.id === r.id)) return;
    setMembers((ms) => [...ms, { id: r.id, name: r.name, image: r.image, series: r.subtitle }]);
  };
  const remove = (id) => setMembers((ms) => ms.filter((m) => m.id !== id));

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const ship = await api.createShip(
        members.map((m) => m.id),
        name.trim(),
        status,
      );
      onCreated(ship);
    } catch (err) {
      if (err.status === 409 && err.data?.shipId) setExisting(err.data.shipId);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = members.length >= 2 && name.trim();

  return (
    <Modal title="💕 New ship" onClose={onClose} center>
      <div className="ship-builder">
        <div className="builder-members">
          {members.map((m, i) => (
            <span key={m.id} className="builder-member">
              {i > 0 && <span className="ship-x">×</span>}
              <span className="builder-chip">
                <img src={m.image} alt="" referrerPolicy="no-referrer" />
                <span>{m.name}</span>
                <button type="button" className="icon-btn" onClick={() => remove(m.id)} aria-label={`Remove ${m.name}`}>
                  ✕
                </button>
              </span>
            </span>
          ))}
          {members.length === 0 && <p className="muted small">Search for 2 to 4 characters.</p>}
        </div>

        {members.length < 4 && (
          <SearchBox
            search={characterSearch}
            existingIds={new Set(members.map((m) => m.id))}
            existingLabel="Picked"
            addLabel="+ Pick"
            onAdd={add}
            placeholder={members.length ? 'Add another character…' : 'Search for a character…'}
          />
        )}

        <label className="field">
          <span>Ship name</span>
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="e.g. NaruSasu"
          />
        </label>

        <div className="field">
          <span>What kind of ship?</span>
          <div className="segmented" role="radiogroup" aria-label="Status">
            {Object.entries(SHIP_STATUS).map(([key, s]) => (
              <button key={key} type="button" role="radio" aria-checked={status === key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)} title={s.hint}>
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        {existing && (
          <div className="banner info">
            This ship already exists. <a href={`#/ship/${existing}`} onClick={onClose}>Open it →</a>
          </div>
        )}
        {error && <div className="banner error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={create} disabled={!ready || busy}>
            {busy ? 'Shipping…' : '💕 Ship it'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
