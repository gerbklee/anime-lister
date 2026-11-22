import { useState } from 'react';
import { CATEGORIES, listEmoji } from '../util.js';

function Section({ title, lists, selectedId, emptyText, showOwner, hrefFor }) {
  return (
    <div className="sidebar-section">
      <h2 className="sidebar-title">{title}</h2>
      {lists.length === 0 ? (
        emptyText && <p className="muted small sidebar-empty">{emptyText}</p>
      ) : (
        <ul className="list-nav">
          {lists.map((list) => (
            <li key={list.id}>
              <a
                href={hrefFor(list)}
                className={`list-link ${list.id === selectedId ? 'active' : ''}`}
                aria-current={list.id === selectedId ? 'page' : undefined}
              >
                <span className="list-link-name">
                  {listEmoji(list) && <span className="list-emoji">{listEmoji(list)} </span>}
                  {list.name}
                  {showOwner && !list.isOwner && list.owner && <span className="muted small"> · {list.owner.username}</span>}
                </span>
                {list.unranked > 0 && (
                  <span className="count to-rank" title={`${list.unranked} new, not ranked by you yet`}>
                    +{list.unranked}
                  </span>
                )}
                <span className="count">{list.count}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Sidebar with list sections and a "new list" form.
// `watchlists` mode shows a single section (watchlists are always shared).
export default function ListSidebar({ open, lists, selectedId, onCreate, onPick, hrefFor, header, watchlists = false, withCategory = false }) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [category, setCategory] = useState('other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const mine = lists.filter((l) => l.isOwner && !l.isShared);
  const sharedLists = lists.filter((l) => l.isShared);
  const othersByOwner = new Map();
  for (const l of lists.filter((x) => !x.isOwner && !x.isShared)) {
    const owner = l.owner?.username ?? 'Unknown';
    if (!othersByOwner.has(owner)) othersByOwner.set(owner, []);
    othersByOwner.get(owner).push(l);
  }

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed, watchlists || shared, withCategory ? category : undefined);
      setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      {header}
      <nav onClick={(e) => e.target.closest('a') && onPick?.()}>
        {watchlists ? (
          <Section
            title="Watchlists"
            lists={sharedLists}
            selectedId={selectedId}
            emptyText="No watchlists yet."
            showOwner
            hrefFor={hrefFor}
          />
        ) : (
          <>
            <Section title="My lists" lists={mine} selectedId={selectedId} emptyText="No personal lists yet." hrefFor={hrefFor} />
            <Section
              title="Shared"
              lists={sharedLists}
              selectedId={selectedId}
              emptyText="No shared lists yet."
              showOwner
              hrefFor={hrefFor}
            />
            {[...othersByOwner.entries()].map(([owner, ownerLists]) => (
              <Section key={owner} title={`${owner}'s lists`} lists={ownerLists} selectedId={selectedId} hrefFor={hrefFor} />
            ))}
          </>
        )}
      </nav>

      <form className="new-list" onSubmit={submit}>
        <div className="new-list-row">
          <input
            type="text"
            placeholder={watchlists ? 'New watchlist name…' : 'New list name…'}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            aria-label="New list name"
          />
          <button className="btn primary" type="submit" disabled={!name.trim() || busy}>
            Add
          </button>
        </div>
        {!watchlists && (
          <div className="segmented" role="radiogroup" aria-label="List type">
            <button type="button" role="radio" aria-checked={!shared} className={!shared ? 'active' : ''} onClick={() => setShared(false)}>
              Personal
            </button>
            <button type="button" role="radio" aria-checked={shared} className={shared ? 'active' : ''} onClick={() => setShared(true)}>
              👥 Shared
            </button>
          </div>
        )}
        {withCategory && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            {Object.entries(CATEGORIES).map(([key, c]) => (
              <option key={key} value={key}>
                {c.emoji} {key === 'other' ? 'Other list' : `${c.label} list`}
              </option>
            ))}
          </select>
        )}
      </form>
      {error && <p className="error-text">{error}</p>}
    </aside>
  );
}
