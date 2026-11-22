import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { formatMinutes, plural, timeAgo } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import Wrapped from '../components/Wrapped.jsx';
import ComparePage from './ComparePage.jsx';
import GamePlay from './GamePlay.jsx';

const GAME_INFO = {
  opening: { emoji: '🎵', text: 'An opening or ending plays; pick the anime. Sound on!' },
  character: { emoji: '🕵️', text: 'A blurred picture slowly sharpens; guess the character.' },
  ranked: { emoji: '💞', text: 'How well do you know each other’s lists and ratings?' },
  higherlower: { emoji: '📈', text: 'Is this anime more or less popular on AniList?' },
};

function GamesHome() {
  const { me, users, navigate } = useApp();
  const others = users.filter((u) => u.id !== me.id);
  const [picked, setOpponent] = useState(null);
  const opponent = picked ?? others[0]?.id ?? null; // users may still be loading
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null);

  const load = useCallback(() => {
    api
      .games()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (type) => {
    setCreating(type);
    setError(null);
    try {
      const g = await api.createGame(type, opponent);
      navigate(`#/us/games/${g.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(null);
    }
  };

  if (!others.length) return <p className="muted">You need someone to play against. Once another account exists, you can challenge them here.</p>;

  return (
    <div className="games-home">
      {data?.headToHead?.length > 0 && (
        <div className="h2h">
          {data.headToHead.map((h) => (
            <div key={h.opponent.id} className="card h2h-card">
              <Avatar user={me} size={36} />
              <span className="h2h-score">
                {h.wins} <span className="muted">–</span> {h.losses}
              </span>
              <Avatar user={h.opponent} size={36} />
              <span className="muted tiny">vs {h.opponent.username}{h.ties ? ` · ${plural(h.ties, 'tie')}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="games-toolbar">
        <h3>New challenge</h3>
        {others.length > 1 && (
          <select value={opponent ?? ''} onChange={(e) => setOpponent(Number(e.target.value))} aria-label="Opponent">
            {others.map((u) => (
              <option key={u.id} value={u.id}>
                vs {u.username}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <div className="banner error">{error}</div>}
      <div className="game-cards">
        {Object.entries(data?.types ?? {}).map(([type, t]) => (
          <button key={type} type="button" className="game-card card" onClick={() => create(type)} disabled={!!creating}>
            <span className="game-emoji">{GAME_INFO[type]?.emoji}</span>
            <b>{t.label}</b>
            <span className="muted small">{GAME_INFO[type]?.text}</span>
            <span className="muted tiny">{t.count} questions</span>
            <span className="btn primary small-btn">{creating === type ? 'Preparing…' : 'Challenge'}</span>
          </button>
        ))}
      </div>

      <h3>Your games</h3>
      {!data ? (
        <p className="muted">Loading…</p>
      ) : data.games.length === 0 ? (
        <p className="muted small">No games yet. Start a challenge above!</p>
      ) : (
        <ul className="game-list">
          {data.games.map((g) => {
            const mine = g.players.find((p) => p.user?.id === me.id);
            const them = g.players.filter((p) => p.user?.id !== me.id);
            const done = g.players.every((p) => p.finished);
            let status;
            if (g.myTurn) status = <span className="pill">Your turn</span>;
            else if (!done) status = <span className="muted small">Waiting for {them.map((t) => t.user?.username).join(', ')}</span>;
            else {
              const best = Math.max(...g.players.map((p) => p.score ?? 0));
              status = (
                <span className="small">
                  {mine.score === best ? (g.players.filter((p) => p.score === best).length > 1 ? '🤝 Tie' : '🏆 You won') : '😢 You lost'} ·{' '}
                  {g.players.map((p) => `${p.user?.id === me.id ? 'you' : p.user?.username} ${p.score}`).join(' – ')}
                </span>
              );
            }
            return (
              <li key={g.id}>
                <a href={`#/us/games/${g.id}`} className="game-row">
                  <span className="game-emoji small">{GAME_INFO[g.type]?.emoji}</span>
                  <span className="game-row-info">
                    <b>{g.label}</b>
                    <span className="muted tiny">
                      {g.createdBy?.id === me.id ? 'You' : g.createdBy?.username} started it · {timeAgo(g.createdAt)}
                    </span>
                  </span>
                  {status}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function togetherSlides(w, me) {
  const other = w.other.user.username;
  const slides = [
    { emoji: '💞', kicker: `Our ${w.year}`, big: `${me.username} & ${other}`, sub: 'Your year in anime, together' },
    {
      emoji: '🍿',
      kicker: 'You both finished',
      big: plural(w.watchedBoth, 'anime', 'anime'),
      sub: w.bothList.slice(0, 3).map((a) => a.title).join(' · ') || null,
      image: w.bothList[0]?.cover,
    },
    {
      emoji: '⏱️',
      kicker: 'Time spent watching',
      big: `${formatMinutes(w.me.minutes)} & ${formatMinutes(w.other.minutes)}`,
      sub: `${me.username} vs ${other}`,
    },
    { emoji: '🧪', kicker: 'Your taste match', big: `${w.tasteMatch}%`, sub: w.tasteMatch >= 70 ? 'Soulmates.' : w.tasteMatch >= 40 ? 'Pretty compatible!' : 'Opposites attract?' },
  ];
  if (w.favouriteTogether) {
    slides.push({
      kicker: 'Your favourite together',
      big: w.favouriteTogether.anime.title,
      sub: `${me.username} ${w.favouriteTogether.me} ★ · ${other} ${w.favouriteTogether.them} ★`,
      image: w.favouriteTogether.anime.cover,
    });
  }
  if (w.disagreement && w.disagreement.me !== w.disagreement.them) {
    slides.push({
      emoji: '⚔️',
      kicker: 'Your biggest argument',
      big: w.disagreement.anime.title,
      sub: `${me.username} ${w.disagreement.me} ★ vs ${other} ${w.disagreement.them} ★`,
      image: w.disagreement.anime.cover,
    });
  }
  if (w.games.played) {
    slides.push({ emoji: '🎮', kicker: 'Games this year', big: `${w.games.myWins} – ${w.games.theirWins}`, sub: `${me.username} vs ${other} · ${plural(w.games.played, 'challenge')}` });
  }
  slides.push({ emoji: '✨', kicker: `That was ${w.year}`, big: 'Here’s to next year!', sub: 'Made with ⭐ Anime Lister' });
  return slides;
}

function OurWrapped() {
  const { me, users } = useApp();
  const others = users.filter((u) => u.id !== me.id);
  const [picked, setOther] = useState(null);
  const other = picked ?? others[0]?.id ?? null; // users may still be loading
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [slides, setSlides] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!other) return;
    setData(null);
    api
      .wrappedTogether(other, year)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [other, year]);

  if (!others.length) return <p className="muted">Our Wrapped needs a second account.</p>;
  const years = Array.from({ length: 4 }, (_, k) => new Date().getFullYear() - k);

  return (
    <div className="our-wrapped">
      <div className="card wrapped-card">
        <div>
          <h3>🎁 Our Wrapped</h3>
          <p className="muted small">Your year together: shared shows, taste match, favourites and arguments.</p>
        </div>
        <div className="wrapped-controls">
          {others.length > 1 && (
            <select value={other ?? ''} onChange={(e) => setOther(Number(e.target.value))} aria-label="With">
              {others.map((u) => (
                <option key={u.id} value={u.id}>
                  with {u.username}
                </option>
              ))}
            </select>
          )}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!data} onClick={() => setSlides(togetherSlides(data, me))}>
            ▶ Play
          </button>
        </div>
      </div>
      {error && <div className="banner error">{error}</div>}
      {data && (
        <div className="stat-tiles">
          <div className="stat-tile">
            <span className="stat-value">{data.watchedBoth}</span>
            <span className="muted tiny">anime you both finished</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{data.tasteMatch}%</span>
            <span className="muted tiny">taste match</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">
              {data.games.myWins}–{data.games.theirWins}
            </span>
            <span className="muted tiny">games won</span>
          </div>
        </div>
      )}
      {slides && <Wrapped slides={slides} onClose={() => setSlides(null)} />}
    </div>
  );
}

export default function UsPage({ route }) {
  const view = route.view ?? 'compare';
  const tabs = [
    ['compare', '#/us', '📊 Compare'],
    ['games', '#/us/games', '🎮 Games'],
    ['wrapped', '#/us/wrapped', '🎁 Our Wrapped'],
  ];
  return (
    <section className="us-page">
      <div className="tabs compact profile-tabs" role="tablist">
        {tabs.map(([key, href, label]) => (
          <a key={key} href={href} role="tab" aria-selected={view === key} className={`tab-link ${view === key ? 'active' : ''}`}>
            {label}
          </a>
        ))}
      </div>
      {view === 'compare' && <ComparePage />}
      {view === 'games' && (route.gameId ? <GamePlay key={route.gameId} id={route.gameId} /> : <GamesHome />)}
      {view === 'wrapped' && <OurWrapped />}
    </section>
  );
}
