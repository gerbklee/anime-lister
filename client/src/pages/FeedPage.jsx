import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { STATUS_LABELS, mediaHref, plural, timeAgo, voteText } from '../util.js';
import { subjectHref } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Stars from '../components/Stars.jsx';
import Thread from '../components/Thread.jsx';
import Reactions from '../components/Reactions.jsx';
import { SpoilerText } from './AnimeDetail.jsx';

const FILTERS = [
  ['everyone', 'Everyone'],
  ['others', 'Others'],
  ['me', 'Me'],
];

const AnimeLink = ({ anime }) => (anime ? <a href={mediaHref(anime)}>{anime.title}</a> : <span>an anime</span>);

function listHref(list) {
  return list.kind === 'watchlist' ? `#/watch/${list.id}` : `#/list/${list.id}`;
}

const ListLink = ({ list }) => <a href={listHref(list)}>{list.name}</a>;

const ShipLink = ({ ship }) => (ship ? <a href={`#/ship/${ship.id}`}>{ship.name}</a> : <span>a ship</span>);

function Sentence({ item, me }) {
  const { type, data, anime, list } = item;
  switch (type) {
    case 'ship_create':
      return <>shipped <ShipLink ship={item.ship} /> 💕 ({item.ship?.members.map((m) => m.name).join(' × ')})</>;
    case 'ship_vote':
      return <>voted {voteText(data.vote)} on <ShipLink ship={item.ship} /></>;
    case 'headcanon':
      return <>shared a headcanon about <ShipLink ship={item.ship} /></>;
    case 'fanart_save':
      return <>saved {plural(item.pictures?.length ?? 1, 'picture')} of <a href={subjectHref(data.subject)}>{data.name}</a></>;
    case 'anime_status':
      const manga = anime?.type === 'MANGA';
      if (data.status === 'watching') return <>started {manga ? 'reading' : 'watching'} <AnimeLink anime={anime} /></>;
      if (data.status === 'dropped') return <>dropped <AnimeLink anime={anime} /></>;
      return data.previous ? (
        <>finished <AnimeLink anime={anime} /></>
      ) : (
        <>{manga ? 'read' : 'watched'} <AnimeLink anime={anime} /></>
      );
    case 'anime_rating':
      return <>rated <AnimeLink anime={anime} /></>;
    case 'anime_review':
      return <>reviewed <AnimeLink anime={anime} /></>;
    case 'list_add':
      if (data.kind === 'ship') return <>added <a href={`#/ship/${item.itemId}`}>{data.name}</a> to <ListLink list={list} /> at #{data.rank}</>;
      return data.kind === 'anime' || data.kind === 'manga' ? (
        <>added <AnimeLink anime={anime} /> to <ListLink list={list} /> at #{data.rank}</>
      ) : (
        <>added <a href={`#/character/${item.itemId}`}>{data.name}</a> to <ListLink list={list} /> at #{data.rank}</>
      );
    case 'list_create':
      return data.kind === 'watchlist' ? (
        <>created the watchlist <ListLink list={list} /></>
      ) : (
        <>created the {{ anime: 'anime', manga: 'manga', ship: 'OTP' }[data.kind] ?? 'character'} list <ListLink list={list} /></>
      );
    case 'watchlist_add':
      return <>added <AnimeLink anime={anime} /> to the watchlist <ListLink list={list} /></>;
    case 'watchlist_comment':
      return <>commented on <AnimeLink anime={anime} /> in <ListLink list={list} /></>;
    case 'watchlist_watched': {
      const names = (item.watchers ?? []).map((u) => (u.id === me.id ? 'you' : u.username));
      return <>marked <AnimeLink anime={anime} /> as watched{names.length ? ` (${names.join(' & ')})` : ''}</>;
    }
    default:
      return <>did something</>;
  }
}

export function FeedItem({ item, me }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(item.commentCount);
  const thumb = item.anime?.cover ?? (item.type === 'list_add' ? item.data.image : null) ?? (item.ship ? item.ship.cover ?? item.ship.members[0]?.image : null);
  const thumbHref = item.anime ? mediaHref(item.anime) : item.ship ? `#/ship/${item.ship.id}` : item.list ? listHref(item.list) : null;

  return (
    <li className="feed-item card">
      <div className="feed-main">
        <Avatar user={item.user} size={36} />
        <div className="feed-text">
          <p>
            <b>{item.user?.id === me.id ? 'You' : item.user?.username}</b> <Sentence item={item} me={me} />
          </p>
          <span className="muted tiny">
            {timeAgo(item.updatedAt ?? item.createdAt)}
            {item.type === 'anime_status' && item.data.status && ` · ${STATUS_LABELS[item.data.status]}`}
          </span>
          {item.rating != null && <Stars value={item.rating} readOnly size={18} />}
          {item.review && (
            <>
              {item.review.rating != null && <Stars value={item.review.rating} readOnly size={18} />}
              <SpoilerText text={item.review.text} spoiler={item.review.spoiler} />
            </>
          )}
          {item.comment && <p className="feed-quote">“{item.comment.body}”</p>}
          {item.headcanon && <p className="feed-quote">💭 {item.headcanon.body}</p>}
          {item.pictures?.length > 0 && (
            <a className="feed-pictures" href={`#/us/gallery`}>
              {item.pictures.slice(0, 4).map((p) => (
                <img key={p.savedId} src={p.thumb} alt="" loading="lazy" />
              ))}
              {item.pictures.length > 4 && <span className="feed-more">+{item.pictures.length - 4}</span>}
            </a>
          )}
        </div>
        {thumb && thumbHref && (
          <a href={thumbHref} className="feed-thumb">
            <img src={thumb} alt="" loading="lazy" />
          </a>
        )}
      </div>
      <div className="item-actions">
        <Reactions target={item.target} initial={item.reactions} />
        <button className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          💬 {count > 0 ? count : 'Comment'}
        </button>
      </div>
      {open && <Thread thread={item.thread} onCount={setCount} />}
    </li>
  );
}

export default function FeedPage() {
  const { me } = useApp();
  const [filter, setFilter] = useState('everyone');
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.feed(filter);
      setItems(d.items);
      setNext(d.nextBefore);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [filter]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const d = await api.feed(filter, next);
      setItems((prev) => [...prev, ...d.items.filter((i) => !prev.some((p) => p.id === i.id))]);
      setNext(d.nextBefore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="feed">
      <div className="feed-header">
        <h2>Feed</h2>
        <div className="segmented">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={load} title="Refresh">
          ↻
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && (
        <div className="empty-state">
          <p className="muted">Nothing here yet. Watched anime, ratings, reviews and list activity will show up here.</p>
        </div>
      )}
      {items?.length > 0 && (
        <ul className="feed-list">
          {items.map((item) => (
            <FeedItem key={item.id} item={item} me={me} />
          ))}
        </ul>
      )}
      {next && (
        <button className="btn ghost wide" onClick={more} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Show older'}
        </button>
      )}
    </section>
  );
}
