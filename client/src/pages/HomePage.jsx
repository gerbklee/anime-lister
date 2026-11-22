import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { animeMeta, listEmoji, mediaHref, plural } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import TrailerModal from '../components/TrailerModal.jsx';
import { FeedItem } from './FeedPage.jsx';

const TIMES = [
  ['short', '⏱️ ~30 min'],
  ['hour', '🕐 ~1 hour'],
  ['evening', '🌙 Evening'],
  ['weekend', '🛋️ Weekend'],
];
const MOODS = [
  ['chill', '😌 Chill'],
  ['hype', '🔥 Hype'],
  ['romance', '💕 Romance'],
  ['funny', '😂 Funny'],
  ['dark', '🖤 Dark'],
];

function dayLabel(ms) {
  const d = new Date(ms);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (ms < Date.now() && Date.now() - ms < 86_400_000) return 'Earlier';
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function Airing({ items, error }) {
  if (error) return <p className="muted small">The airing schedule is unavailable right now ({error}).</p>;
  if (!items.length) {
    return <p className="muted small">Nothing airing this week from the anime you're watching or have on a watchlist.</p>;
  }
  const groups = new Map();
  for (const s of items) {
    const label = dayLabel(s.airingAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(s);
  }
  return (
    <div className="airing-days">
      {[...groups.entries()].map(([day, list]) => (
        <div key={day} className="airing-day">
          <h4>{day}</h4>
          <ul className="airing-list">
            {list.map((s) => {
              const aired = s.airingAt < Date.now();
              const behind = s.watching && s.progress != null && s.progress < s.episode - 1;
              return (
                <li key={`${s.anime.id}-${s.episode}`} className={aired ? 'aired' : ''}>
                  <a href={mediaHref(s.anime)} className="airing-cover">
                    {s.anime.cover && <img src={s.anime.cover} alt="" loading="lazy" />}
                  </a>
                  <div className="airing-info">
                    <a href={mediaHref(s.anime)} className="airing-title">
                      {s.anime.title}
                    </a>
                    <span className="muted tiny">
                      Episode {s.episode} · {aired ? 'out now' : clock(s.airingAt)}
                      {!s.watching && ' · on your watchlist'}
                      {behind && ` · you're on ep ${s.progress}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ContinueItem({ item, onStep }) {
  const a = item.anime;
  const manga = a.type === 'MANGA';
  const [busy, setBusy] = useState(false);
  const step = async (delta) => {
    setBusy(true);
    try {
      await onStep(a.id, Math.max(0, item.progress + delta));
    } finally {
      setBusy(false);
    }
  };
  const ahead = item.others.filter((o) => o.status === 'watching' && o.progress > item.progress);
  const behind = item.others.filter((o) => o.status === 'watching' && o.progress < item.progress);
  return (
    <li className="continue-item">
      <a href={mediaHref(a)} className="continue-cover">
        {a.cover && <img src={a.cover} alt="" loading="lazy" />}
      </a>
      <div className="continue-info">
        <a href={mediaHref(a)} className="continue-title">
          {manga ? '📖 ' : ''}
          {a.title}
        </a>
        <span className="muted tiny">
          {manga ? 'Chapter' : 'Episode'} {item.progress}
          {item.total ? ` of ${item.total}` : ''}
        </span>
        {item.total > 0 && (
          <div className="continue-bar">
            <div style={{ width: `${Math.min(100, (item.progress / item.total) * 100)}%` }} />
          </div>
        )}
        {(ahead.length > 0 || behind.length > 0) && (
          <span className="tiny continue-others">
            {ahead.map((o) => (
              <span key={o.user.id}>
                <Avatar user={o.user} size={14} /> {o.user.username} is {o.progress - item.progress} ahead{' '}
              </span>
            ))}
            {behind.map((o) => (
              <span key={o.user.id}>
                <Avatar user={o.user} size={14} /> {o.user.username} is on {o.progress}{' '}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="continue-actions">
        <button className="icon-btn" disabled={busy || item.progress === 0} onClick={() => step(-1)} aria-label="One back">
          −
        </button>
        <button className="btn primary small-btn" disabled={busy} onClick={() => step(1)}>
          +1 {manga ? 'ch' : 'ep'}
        </button>
      </div>
    </li>
  );
}

// "What should we watch tonight?" with a slot-machine spin.
function Tonight() {
  const [time, setTime] = useState('hour');
  const [moods, setMoods] = useState([]);
  const [together, setTogether] = useState(true);
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(null); // cover shown during the spin
  const [error, setError] = useState(null);
  const [trailer, setTrailer] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const spin = async () => {
    setError(null);
    setResult(null);
    let data;
    try {
      data = await api.tonight({ time, moods, together });
    } catch (err) {
      setError(err.message);
      return;
    }
    if (!data.pick) {
      setResult({ empty: true });
      return;
    }
    // Spin through the candidates, slowing down, then land on the pick.
    const pool = data.candidates.length > 1 ? data.candidates : [data.pick];
    let i = 0;
    let delay = 60;
    const tick = () => {
      setSpinning(pool[i % pool.length].anime);
      i += 1;
      delay *= 1.13;
      if (delay < 420) timer.current = setTimeout(tick, delay);
      else {
        setSpinning(null);
        setResult(data);
      }
    };
    tick();
  };

  const toggleMood = (m) => setMoods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const pick = result?.pick;

  return (
    <div className="card tonight">
      <h3>🎲 What should we watch tonight?</h3>
      <div className="chip-row">
        {TIMES.map(([key, label]) => (
          <button key={key} type="button" className={`chip ${time === key ? 'active' : ''}`} onClick={() => setTime(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="chip-row">
        {MOODS.map(([key, label]) => (
          <button key={key} type="button" className={`chip ${moods.includes(key) ? 'active' : ''}`} onClick={() => toggleMood(key)}>
            {label}
          </button>
        ))}
      </div>
      <label className="check small">
        <input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} /> Together (prefer what you're both
        watching; skip shows only I'm watching)
      </label>
      <button className="btn primary wide" onClick={spin} disabled={!!spinning}>
        {spinning ? 'Spinning…' : result ? '🎲 Spin again' : '🎲 Spin'}
      </button>

      {spinning && (
        <div className="spin-window">
          {spinning.cover && <img src={spinning.cover} alt="" />}
          <span>{spinning.title}</span>
        </div>
      )}
      {error && <p className="error-text small">{error}</p>}
      {result?.empty && (
        <p className="muted small">
          Nothing to pick from yet. Add anime to a watchlist, or start watching something together.
        </p>
      )}
      {pick && !spinning && (
        <div className="tonight-pick">
          <a href={mediaHref(pick.anime)} className="tonight-cover">
            {pick.anime.cover && <img src={pick.anime.cover} alt="" />}
          </a>
          <div className="tonight-info">
            <span className="muted tiny">Tonight's pick</span>
            <a href={mediaHref(pick.anime)} className="tonight-title">
              {pick.anime.title}
            </a>
            <span className="muted tiny">{animeMeta(pick.anime)}</span>
            <b className="small">{pick.plan}</b>
            {pick.reasons.length > 0 && <span className="tiny tonight-reasons">{pick.reasons.join(' · ')}</span>}
            <div className="tonight-actions">
              {pick.anime.trailer && (
                <button className="btn ghost small-btn" onClick={() => setTrailer(pick.anime)}>
                  ▶ Trailer
                </button>
              )}
              <a className="btn ghost small-btn" href={mediaHref(pick.anime)}>
                Open
              </a>
            </div>
          </div>
        </div>
      )}
      {trailer && <TrailerModal trailer={trailer.trailer} title={trailer.title} onClose={() => setTrailer(null)} />}
    </div>
  );
}

export default function HomePage() {
  const { me, lists, refreshCatalogue } = useApp();
  const [data, setData] = useState(null);
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.home());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    api
      .feed('everyone')
      .then((d) => setFeed(d.items.slice(0, 6)))
      .catch(() => setFeed([]));
  }, [load]);

  const step = async (id, progress) => {
    await api.setCatalogue(id, { progress });
    await load();
    refreshCatalogue();
  };

  const trays = (lists ?? []).filter((l) => l.unranked > 0);
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <section className="home">
      <h2 className="home-greeting">
        {greeting}, {me.username} 👋
      </h2>
      {error && <div className="banner error">{error}</div>}

      <div className="home-grid">
        <div className="home-col">
          <div className="card">
            <h3>📺 Airing this week</h3>
            {data ? <Airing items={data.airing} error={data.airingError} /> : <p className="muted small">Loading…</p>}
          </div>

          <div className="card">
            <h3>▶️ Continue</h3>
            {!data ? (
              <p className="muted small">Loading…</p>
            ) : data.continue.length === 0 ? (
              <p className="muted small">
                Nothing in progress. Mark an anime as <i>Watching</i> or a manga as <i>Reading</i> in your profile.
              </p>
            ) : (
              <ul className="continue-list">
                {data.continue.map((c) => (
                  <ContinueItem key={c.anime.id} item={c} onStep={step} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="home-col">
          <Tonight />

          {trays.length > 0 && (
            <div className="card">
              <h3>🆕 Waiting for your ranking</h3>
              <ul className="tray-links">
                {trays.map((l) => (
                  <li key={l.id}>
                    <a href={`#/list/${l.id}`}>
                      {listEmoji(l)} {l.name}
                    </a>
                    <span className="count to-rank">+{l.unranked}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h3>📰 Latest</h3>
              <a href="#/feed" className="link-btn small">
                See all →
              </a>
            </div>
            {feed === null ? (
              <p className="muted small">Loading…</p>
            ) : feed.length === 0 ? (
              <p className="muted small">No activity yet.</p>
            ) : (
              <ul className="feed-list compact-feed">
                {feed.map((item) => (
                  <FeedItem key={item.id} item={item} me={me} />
                ))}
              </ul>
            )}
            {feed && feed.length > 0 && <p className="muted tiny">{plural(feed.length, 'recent update')}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
