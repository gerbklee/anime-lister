import { useState } from 'react';
import { api } from '../api.js';
import { editableLists, useApp } from '../AppContext.jsx';
import Menu from './Menu.jsx';

const EMPTY_HINT = {
  character: 'Create a character list in the Lists tab first.',
  anime: 'Create an anime list in the Lists tab first.',
  manga: 'Create a manga list in the Lists tab first.',
  watchlist: 'Create a watchlist in the Watchlists tab first.',
  ship: 'Create an OTP list first: Lists → 💕 Ships → sidebar.',
};

const LABELS = { adding: 'Adding…', added: '✓ Added', already: 'Already in', error: 'Failed' };

// "+ Add to list ▾": the lists of `kind` you can edit (a sheet on phones).
export default function AddToListMenu({ kind, itemId, label = '+ Add to list', className = 'btn ghost', icon = null }) {
  const { lists, refreshLists } = useApp();
  const [status, setStatus] = useState({});
  const options = editableLists(lists, kind);

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

  return (
    <Menu
      className={className}
      icon={icon}
      text={`${label} ▾`}
      label={label}
      title={label.replace(/^\+\s*/, '')}
      align="left"
      items={options.map((l) => ({
        icon: l.isShared ? '👥' : '📋',
        label: l.name,
        right: LABELS[status[l.id]] ?? String(l.count),
        disabled: !!status[l.id] && status[l.id] !== 'error',
        keepOpen: true,
        onSelect: () => add(l),
      }))}
    >
      {options.length === 0 && <p className="muted small menu-empty">{EMPTY_HINT[kind]}</p>}
    </Menu>
  );
}
