import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { editableLists, useApp } from '../AppContext.jsx';

const EMPTY_HINT = {
  character: 'Create a character list in the Lists tab first.',
  anime: 'Create an anime list in the Lists tab first.',
  watchlist: 'Create a watchlist in the Watchlists tab first.',
};

// "+ Add to list ▾" button with a dropdown of the lists of `kind` you can edit.
export default function AddToListMenu({ kind, itemId, label = '+ Add to list', className = 'btn ghost' }) {
  const { lists, refreshLists } = useApp();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState({});
  const ref = useRef(null);
  const options = editableLists(lists, kind);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const add = async (list) => {
    setStatus((s) => ({ ...s, [list.id]: 'adding' }));
    try {
      await api.addEntry(list.id, itemId);
      setStatus((s) => ({ ...s, [list.id]: 'added' }));
      refreshLists();
    } catch (err) {
      setStatus((s) => ({ ...s, [list.id]: err.status === 409 ? 'already' : 'error' }));
    }
  };

  const labels = { adding: 'Adding…', added: '✓ Added', already: 'Already in', error: 'Failed' };

  return (
    <span className="menu-wrap" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label} ▾
      </button>
      {open && (
        <div className="menu" role="menu">
          {options.length === 0 && <p className="muted small menu-empty">{EMPTY_HINT[kind]}</p>}
          {options.map((l) => (
            <button
              key={l.id}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => add(l)}
              disabled={!!status[l.id] && status[l.id] !== 'error'}
            >
              <span className="menu-item-name">
                {l.isShared && '👥 '}
                {l.name}
              </span>
              <span className="muted small">{labels[status[l.id]] ?? `${l.count}`}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
