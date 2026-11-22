import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { POPULARITY, SHIP_STATUS, VOTES, compactCount } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import { ShipCover } from '../components/ShipBits.jsx';

const THRESHOLD = 90; // px of drag that counts as a swipe

function cardShip(card) {
  if (card.kind === 'ship') return card.ship;
  return { id: null, name: card.members.map((m) => m.name.split(' ')[0]).join(' × '), members: card.members, cover: null, status: card.status, popularity: null };
}

function SwipeCard({ card, top, onSwipe }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const start = useRef(null);
  const s = cardShip(card);

  const onPointerDown = (e) => {
    if (!top) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  };
  const onPointerMove = (e) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    const { x, y } = drag;
    if (y < -THRESHOLD && Math.abs(y) > Math.abs(x)) onSwipe(4);
    else if (x > THRESHOLD) onSwipe(3);
    else if (x < -THRESHOLD) onSwipe(0);
    setDrag({ x: 0, y: 0, active: false });
  };

  const hint = drag.y < -THRESHOLD / 2 && Math.abs(drag.y) > Math.abs(drag.x) ? 4 : drag.x > THRESHOLD / 2 ? 3 : drag.x < -THRESHOLD / 2 ? 0 : null;
  const style = top
    ? { transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`, transition: drag.active ? 'none' : 'transform 0.25s' }
    : undefined;

  return (
    <div className={`swipe-card ${top ? 'top' : 'under'}`} style={style} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {s.cover ? <ShipCover ship={s} className="swipe-cover" /> : (
        <div className={`swipe-collage n${s.members.length}`}>
          {s.members.map((m) => (
            <img key={m.id} src={m.image} alt="" draggable={false} referrerPolicy="no-referrer" />
          ))}
        </div>
      )}
      {hint != null && <div className={`swipe-stamp v${hint}`}>{VOTES[hint].emoji} {VOTES[hint].label}</div>}
      <div className="swipe-info">
        <b className="swipe-name">{s.name}</b>
        <span className="swipe-members">{s.members.map((m) => m.name).join(' × ')}</span>
        <span className="ship-badges">
          {SHIP_STATUS[s.status] && (
            <span className={`ship-badge status-${s.status}`}>
              {SHIP_STATUS[s.status].emoji} {SHIP_STATUS[s.status].label}
            </span>
          )}
          {s.popularity && POPULARITY[s.popularity] && s.popularity !== 'known' && (
            <span className={`ship-badge pop-${s.popularity}`}>
              {POPULARITY[s.popularity].emoji} {POPULARITY[s.popularity].label}
            </span>
          )}
          {card.fanartCount != null && <span className="ship-badge">🎨 {compactCount(card.fanartCount)}</span>}
          {s.tropes?.slice(0, 2).map((t) => (
            <span key={t} className="ship-badge">
              {t}
            </span>
          ))}
        </span>
        <span className="swipe-reason">{card.reason}</span>
        {card.kind === 'ship' && card.ship.votes.length > 0 && (
          <span className="swipe-votes">
            {card.ship.votes.map((v) => (
              <span key={v.user?.id}>
                <Avatar user={v.user} size={18} /> {VOTES[v.vote].emoji}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ShipSwipe() {
  const [cards, setCards] = useState(null);
  const [error, setError] = useState(null);
  const [last, setLast] = useState(null); // { card, result } for undo
  const [match, setMatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    setError(null);
    api
      .swipeDeck()
      .then((d) => setCards(d.cards))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const swipe = async (vote) => {
    const card = cards?.[0];
    if (!card || busy) return;
    setBusy(true);
    setCards((cs) => cs.slice(1));
    try {
      const result = await api.swipe(card, vote);
      setLast({ card, result });
      setCount((c) => c + 1);
      if (result.match?.length) setMatch({ ship: result.ship, with: result.match });
    } catch (err) {
      setError(err.message);
      setCards((cs) => [card, ...cs]);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!last || busy) return;
    setBusy(true);
    try {
      await api.undoSwipe(last.result.ship.id, last.result.created, last.result.previousVote);
      setCards((cs) => [last.card, ...cs]);
      setLast(null);
      setCount((c) => Math.max(0, c - 1));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') swipe(3);
      if (e.key === 'ArrowLeft') swipe(0);
      if (e.key === 'ArrowUp') swipe(4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="ship-swipe">
      <div className="list-header">
        <a href="#/ships" className="back-link">
          ← Ship board
        </a>
        <div className="spacer" />
        {count > 0 && <span className="muted small">{count} swiped</span>}
      </div>
      <h2 className="list-name">💘 Ship swipe</h2>
      <p className="muted small">Swipe right to ship it, left for no way, up for OTP. When you both ship it, it's a match.</p>
      {error && <div className="banner error">{error}</div>}

      <div className="swipe-stage">
        {cards === null ? (
          <p className="muted">Shuffling the deck…</p>
        ) : cards.length === 0 ? (
          <div className="swipe-empty">
            <p>That's the whole deck for now. 🎉</p>
            <p className="muted small">New pairings show up as fan pairings are found for characters in your lists.</p>
            <button type="button" className="btn ghost" onClick={load}>
              Shuffle again
            </button>
          </div>
        ) : (
          cards
            .slice(0, 3)
            .reverse()
            .map((card, i, arr) => <SwipeCard key={card.key} card={card} top={i === arr.length - 1} onSwipe={swipe} />)
        )}
      </div>

      <div className="swipe-buttons">
        <button type="button" className="swipe-btn undo" onClick={undo} disabled={!last || busy} title="Undo" aria-label="Undo last swipe">
          ↺
        </button>
        <button type="button" className="swipe-btn no" onClick={() => swipe(0)} disabled={!cards?.length || busy} title="No way" aria-label="No way">
          🚫
        </button>
        <button type="button" className="swipe-btn small" onClick={() => swipe(1)} disabled={!cards?.length || busy} title="Meh" aria-label="Meh">
          🤷
        </button>
        <button type="button" className="swipe-btn small" onClick={() => swipe(2)} disabled={!cards?.length || busy} title="Cute" aria-label="Cute">
          🙂
        </button>
        <button type="button" className="swipe-btn yes" onClick={() => swipe(3)} disabled={!cards?.length || busy} title="Ship it" aria-label="Ship it">
          💕
        </button>
        <button type="button" className="swipe-btn otp" onClick={() => swipe(4)} disabled={!cards?.length || busy} title="OTP" aria-label="OTP">
          💍
        </button>
      </div>

      {match && (
        <div className="match-overlay" role="dialog" aria-label="It's a match" onClick={() => setMatch(null)}>
          <div className="match-card" onClick={(e) => e.stopPropagation()}>
            <div className="match-hearts" aria-hidden="true">
              💞
            </div>
            <h2>It's a match!</h2>
            <p>
              You and {match.with.map((u) => u.username).join(' & ')} both ship <b>{match.ship.name}</b>.
            </p>
            <ShipCover ship={match.ship} className="match-cover" />
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setMatch(null)}>
                Keep swiping
              </button>
              <a className="btn primary" href={`#/ship/${match.ship.id}`}>
                Open ship
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
