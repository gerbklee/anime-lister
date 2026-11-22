import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { POPULARITY, SHIP_STATUS, VOTES, compactCount, voteText } from '../util.js';
import Avatar from './Avatar.jsx';

// Cover picture, or the members' portraits side by side.
export function ShipCover({ ship, className = '' }) {
  if (ship.cover) {
    return <img className={`ship-cover ${className}`} src={ship.cover} alt={ship.name} loading="lazy" referrerPolicy="no-referrer" />;
  }
  return (
    <div className={`ship-cover ship-collage n${ship.members.length} ${className}`} aria-label={ship.name}>
      {ship.members.map((m) => (
        <img key={m.id} src={m.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ))}
    </div>
  );
}

export function StatusBadge({ status }) {
  const s = SHIP_STATUS[status];
  return s ? (
    <span className={`ship-badge status-${status}`} title={s.hint}>
      {s.emoji} {s.label}
    </span>
  ) : null;
}

export function PopularityBadge({ ship }) {
  const p = POPULARITY[ship.popularity];
  if (!p || ship.popularity === 'known') return null;
  return (
    <span className={`ship-badge pop-${ship.popularity}`} title={`${compactCount(ship.fanartCount)} fan art pictures on Safebooru`}>
      {p.emoji} {p.label}
    </span>
  );
}

// Big gap between two people's votes.
export const isWar = (ship) => {
  const v = ship.votes.map((x) => x.vote);
  return v.length >= 2 && Math.max(...v) - Math.min(...v) >= 2;
};

// Everyone's votes as small avatar chips.
export function VoteChips({ ship }) {
  const { me } = useApp();
  if (!ship.votes.length) return <span className="muted tiny">No votes yet</span>;
  return (
    <span className="vote-chips">
      {ship.votes.map((v) => (
        <span key={v.user?.id} className={`vote-chip v${v.vote}`} title={`${v.user?.id === me.id ? 'You' : v.user?.username}: ${voteText(v.vote)}`}>
          <Avatar user={v.user} size={18} />
          {VOTES[v.vote].emoji}
        </span>
      ))}
      {isWar(ship) && (
        <span className="ship-badge war" title="Your votes are far apart">
          ⚔️ Ship war
        </span>
      )}
    </span>
  );
}

// The Ship-o-meter: five vote buttons. Clicking your current vote removes it.
export function ShipOMeter({ ship, onChange, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const vote = async (value) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await api.voteShip(ship.id, ship.myVote === value ? null : value));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`ship-o-meter ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Your vote">
      {VOTES.map((v) => (
        <button
          key={v.value}
          type="button"
          role="radio"
          aria-checked={ship.myVote === v.value}
          className={`vote-btn v${v.value} ${ship.myVote === v.value ? 'active' : ''}`}
          onClick={() => vote(v.value)}
          title={v.label}
          disabled={busy}
        >
          <span className="vote-emoji">{v.emoji}</span>
          {!compact && <span className="vote-label">{v.label}</span>}
        </button>
      ))}
      {error && <span className="error-text small">{error}</span>}
    </div>
  );
}

export function ShipCard({ ship, onChange }) {
  return (
    <div className={`ship-card card ${isWar(ship) ? 'at-war' : ''}`}>
      <a href={`#/ship/${ship.id}`} className="ship-card-link">
        <ShipCover ship={ship} />
        <div className="ship-card-info">
          <b className="ship-name">{ship.name}</b>
          <span className="muted tiny ship-members">{ship.members.map((m) => m.name).join(' × ')}</span>
          <span className="ship-badges">
            <StatusBadge status={ship.status} />
            <PopularityBadge ship={ship} />
          </span>
          {ship.tropes?.length > 0 && (
            <span className="trope-line muted tiny">{ship.tropes.slice(0, 3).join(' · ')}</span>
          )}
        </div>
      </a>
      <div className="ship-card-foot">
        <VoteChips ship={ship} />
        {onChange && <ShipOMeter ship={ship} onChange={onChange} compact />}
      </div>
    </div>
  );
}
