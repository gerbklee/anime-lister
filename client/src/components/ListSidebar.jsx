import { useState } from 'react';

export default function ListSidebar({ lists, selectedId, onSelect, onCreate }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">My lists</h2>
      <nav>
        <ul className="list-nav">
          {lists.map((list) => (
            <li key={list.id}>
              <button
                className={`list-link ${list.id === selectedId ? 'active' : ''}`}
                onClick={() => onSelect(list.id)}
                aria-current={list.id === selectedId ? 'page' : undefined}
              >
                <span className="list-link-name">{list.name}</span>
                <span className="count">{list.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <form className="new-list" onSubmit={submit}>
        <input
          type="text"
          placeholder="New list name…"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          aria-label="New list name"
        />
        <button className="btn primary" type="submit" disabled={!name.trim() || busy}>
          Add
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </aside>
  );
}
