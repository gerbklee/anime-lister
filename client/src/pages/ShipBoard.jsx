import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { SHIP_STATUS, plural } from '../util.js';
import { ShipCard, isWar } from '../components/ShipBits.jsx';
import ShipBuilder from '../components/ShipBuilder.jsx';

const FILTERS = [
  ['all', 'All'],
  ['both', '💕 We all ship it'],
  ['wars', '⚔️ Ship wars'],
  ['mine', '🙋 Only mine'],
  ['todo', '🗳️ Not voted'],
  ...Object.entries(SHIP_STATUS).map(([k, s]) => [k, `${s.emoji} ${s.label}`]),
];

function matches(ship, filter, me) {
  const loves = ship.votes.filter((v) => v.vote >= 3);
  switch (filter) {
    case 'both':
      return ship.votes.length >= 2 && loves.length === ship.votes.length;
    case 'wars':
      return isWar(ship);
    case 'mine':
      return ship.myVote >= 3 && loves.length === 1;
    case 'todo':
      return ship.myVote == null;
    case 'canon':
    case 'fanon':
    case 'crack':
      return ship.status === filter;
    default:
      return true;
  }
}

// All ships everyone made, with votes. `newWith`: open the builder with this character.
export default function ShipBoard({ newWith }) {
  const { me, navigate } = useApp();
  const [ships, setShips] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [builder, setBuilder] = useState(null); // null = closed, else initial members

  const load = useCallback(() => {
    api
      .ships()
      .then((d) => setShips(d.ships))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!newWith) return;
    api
      .character(newWith)
      .then((c) => setBuilder([{ id: c.id ?? newWith, name: c.name, image: c.image }]))
      .catch(() => setBuilder([]));
  }, [newWith]);

  const replace = (next) => setShips((list) => list.map((s) => (s.id === next.id ? next : s)));
  const term = query.trim().toLowerCase();
  const shown = (ships ?? [])
    .filter((s) => matches(s, filter, me.id))
    .filter((s) => !term || s.name.toLowerCase().includes(term) || s.members.some((m) => m.name.toLowerCase().includes(term)));

  return (
    <section className="ship-board">
      <div className="list-header">
        <h2 className="list-name">💕 Ship board</h2>
        <span className="muted">{ships ? plural(ships.length, 'ship') : ''}</span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setBuilder([])}>
          + New ship
        </button>
      </div>
      <p className="muted small">
        Every ship you both made, with your votes. Rank your favourites in an OTP list (sidebar), or open a ship for fan art and headcanons.
      </p>

      <div className="ship-filters">
        <input type="search" placeholder="Filter by name or character…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter ships" />
        <div className="chip-row" role="tablist" aria-label="Filter">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} className={`chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}
      {!ships ? (
        <p className="muted">Loading…</p>
      ) : ships.length === 0 ? (
        <div className="empty-state">
          <h2>No ships yet</h2>
          <p className="muted">Who belongs together? Start with “+ New ship”, or use “💕 Ship with…” on a character page.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">No ships match this filter.</p>
      ) : (
        <div className="ship-grid">
          {shown.map((s) => (
            <ShipCard key={s.id} ship={s} onChange={replace} />
          ))}
        </div>
      )}

      {builder && (
        <ShipBuilder
          initial={builder}
          onClose={() => {
            setBuilder(null);
            if (newWith) navigate('#/ships');
          }}
          onCreated={(ship) => {
            setBuilder(null);
            navigate(`#/ship/${ship.id}`);
          }}
        />
      )}
    </section>
  );
}
