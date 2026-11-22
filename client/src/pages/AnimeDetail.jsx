import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { STATUS_LABELS, formatLabel, plural, timeAgo, parseDate } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import Stars from '../components/Stars.jsx';
import Thread from '../components/Thread.jsx';
import Reactions from '../components/Reactions.jsx';
import TrailerModal from '../components/TrailerModal.jsx';
import AddToListMenu from '../components/AddToListMenu.jsx';
import { formatPopularity } from '../components/AnimeTile.jsx';

const SEASONS = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
const STATUS = { FINISHED: 'Finished', RELEASING: 'Airing', NOT_YET_RELEASED: 'Not yet aired', CANCELLED: 'Cancelled', HIATUS: 'On hiatus' };

export function SpoilerText({ text, spoiler }) {
  const [shown, setShown] = useState(!spoiler);
  if (shown) return <p className="review-text">{text}</p>;
  return (
    <button type="button" className="spoiler" onClick={() => setShown(true)}>
      <span className="spoiler-blur">{text}</span>
      <span className="spoiler-label">⚠️ Contains spoilers, tap to show</span>
    </button>
  );
}

function ReviewCard({ entry, isMine }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(entry.commentCount);
  return (
    <div className="review-card">
      <div className="review-head">
        <Avatar user={entry.user} size={32} />
        <div>
          <b>{isMine ? 'You' : entry.user?.username}</b>
          <div className="muted tiny">
            {STATUS_LABELS[entry.status]}
            {entry.status === 'watching' && ` · ep ${entry.progress}`} · {timeAgo(parseDate(entry.updatedAt))}
          </div>
        </div>
        <div className="spacer" />
        <Stars value={entry.rating} readOnly size={16} />
      </div>
      {entry.review && (
        <>
          <SpoilerText text={entry.review} spoiler={entry.spoiler} />
          <div className="item-actions">
            <Reactions target={entry.thread} initial={entry.reactions} />
            <button className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              💬 {count > 0 ? plural(count, 'comment') : 'Reply'}
            </button>
          </div>
          {open && <Thread thread={entry.thread} onCount={setCount} placeholder="Reply to this review…" />}
        </>
      )}
    </div>
  );
}

function MyEntry({ anime, mine, onSaved }) {
  const [review, setReview] = useState(mine?.review ?? '');
  const [spoiler, setSpoiler] = useState(mine?.spoiler ?? false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setReview(mine?.review ?? '');
    setSpoiler(mine?.spoiler ?? false);
  }, [mine?.review, mine?.spoiler]);

  const save = async (patch) => {
    setBusy(true);
    setError(null);
    try {
      await api.setCatalogue(anime.id, patch);
      await onSaved(patch);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${anime.title} from your catalogue? Your rating and review will be deleted.`)) return;
    setBusy(true);
    try {
      await api.removeCatalogue(anime.id);
      await onSaved({});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reviewDirty = review.trim() !== (mine?.review ?? '') || spoiler !== (mine?.spoiler ?? false);

  return (
    <div className="card my-entry">
      <h3>Your take</h3>
      <div className="segmented status-picker">
        {['watched', 'watching', 'dropped'].map((s) => (
          <button key={s} type="button" disabled={busy} className={mine?.status === s ? 'active' : ''} onClick={() => save({ status: s })}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      {!mine && <p className="muted small">Pick a status to add it to your catalogue.</p>}

      {mine?.status === 'watching' && (
        <div className="progress">
          <button className="icon-btn" disabled={busy} onClick={() => save({ progress: Math.max(0, mine.progress - 1) })} aria-label="One episode back">
            −
          </button>
          <span>
            Episode {mine.progress}
            {anime.episodes ? ` of ${anime.episodes}` : ''}
          </span>
          <button className="icon-btn" disabled={busy} onClick={() => save({ progress: mine.progress + 1 })} aria-label="One more episode">
            +
          </button>
        </div>
      )}

      {mine && (
        <>
          <div className="field">
            <span>Your rating</span>
            <Stars value={mine.rating} onChange={(rating) => save({ rating })} size={30} />
          </div>
          <div className="field">
            <span>Your review</span>
            <textarea rows={4} maxLength={5000} value={review} placeholder="What did you think?" onChange={(e) => setReview(e.target.value)} />
          </div>
          <div className="review-controls">
            <label className="check">
              <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} /> Contains spoilers
            </label>
            <div className="spacer" />
            {saved && !reviewDirty && <span className="ok-text small">Saved</span>}
            <button
              className="btn primary"
              disabled={busy || !reviewDirty}
              onClick={async () => {
                if (await save({ review, spoiler })) setSaved(true);
              }}
            >
              Save review
            </button>
          </div>
          <button className="link-btn small danger-text" onClick={remove} disabled={busy}>
            Remove from my catalogue
          </button>
        </>
      )}
      {error && <p className="error-text small">{error}</p>}
    </div>
  );
}

function CharacterChip({ c, showOwner, me }) {
  return (
    <a className="char-chip" href={`#/list/${c.list.id}`} title={`${c.name} in ${c.list.name}`}>
      {c.image && <img src={c.image} alt="" loading="lazy" />}
      <span>
        <b>{c.name}</b>
        <span className="muted tiny">
          #{c.rank} of {c.list.size} · {c.list.name}
          {showOwner && c.owner && c.owner.id !== me.id && ` · ${c.owner.username}`}
        </span>
      </span>
    </a>
  );
}

const ROLE_LABELS = { MAIN: 'Main', SUPPORTING: 'Supporting', BACKGROUND: 'Background' };
const COLLAPSED = 12;
const STEP = 25;

// All characters, most important first (main → supporting → background, then
// by AniList favourites). Pages of 25 are loaded from AniList as you expand.
function Cast({ animeId, initial, ranked }) {
  const [loaded, setLoaded] = useState(initial);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(true);
  const [visible, setVisible] = useState(COLLAPSED);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadPage = useCallback(
    async (p) => {
      setLoading(true);
      setError(null);
      try {
        const d = await api.animeCharacters(animeId, p);
        setLoaded((prev) => {
          const base = p === 1 ? [] : prev;
          const seen = new Set(base.map((c) => c.id));
          return [...base, ...d.characters.filter((c) => !seen.has(c.id))];
        });
        setPage(p);
        setHasNext(d.hasNextPage);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [animeId],
  );

  // Replace the short cached list with the first full page right away.
  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const showMore = async () => {
    const next = visible + STEP;
    setVisible(next);
    if (next > loaded.length && hasNext && page > 0) await loadPage(page + 1);
  };

  if (loaded.length === 0 && !loading) {
    return error ? <p className="error-text small">{error}</p> : <p className="muted small">AniList lists no characters for this anime.</p>;
  }

  const shown = loaded.slice(0, visible);
  const canShowMore = visible < loaded.length || hasNext;

  return (
    <>
      <ul className="cast">
        {shown.map((c) => (
          <li key={c.id}>
            {c.image && <img src={c.image} alt="" loading="lazy" />}
            <div className="cast-info">
              <b>{c.name}</b>
              <span className="muted tiny">
                <span className={`role-tag ${c.role?.toLowerCase()}`}>{ROLE_LABELS[c.role] ?? c.role}</span>
                {c.favourites > 0 && ` · ❤ ${formatPopularity(c.favourites)}`}
                {ranked.has(c.id) && ' · ✓ in your lists'}
              </span>
            </div>
            <AddToListMenu kind="character" itemId={c.id} label="+ List" className="btn ghost small-btn" />
          </li>
        ))}
      </ul>
      {error && <p className="error-text small">{error}</p>}
      <div className="cast-more">
        {canShowMore && (
          <button type="button" className="btn ghost" onClick={showMore} disabled={loading}>
            {loading ? 'Loading…' : 'Show more'}
          </button>
        )}
        {visible > COLLAPSED && (
          <button type="button" className="btn ghost" onClick={() => setVisible(COLLAPSED)}>
            Show less
          </button>
        )}
        <span className="muted tiny">
          {plural(shown.length, 'character')} shown{!hasNext && visible >= loaded.length ? ' (all)' : ''}
        </span>
      </div>
    </>
  );
}

export default function AnimeDetail({ id, suggest }) {
  const { me, refreshCatalogue } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [trailer, setTrailer] = useState(false);
  const [justWatched, setJustWatched] = useState(false);
  const [showSynopsis, setShowSynopsis] = useState(false);
  const suggestRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await api.anime(id));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const showSuggest = suggest || justWatched;
  useEffect(() => {
    if (showSuggest && data && suggestRef.current) suggestRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showSuggest, data]);

  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const { anime, mine, others, characters, animeLists, watchThreads } = data;
  const myChars = characters.filter((c) => c.owner?.id === me.id);
  const otherChars = characters.filter((c) => c.owner?.id !== me.id);
  const ranked = new Set(myChars.map((c) => c.characterId));

  const onSaved = async (patch) => {
    if (patch.status === 'watched' && mine?.status !== 'watched') setJustWatched(true);
    await load();
    refreshCatalogue();
  };

  const meta = [
    formatLabel(anime.format),
    anime.season && anime.seasonYear ? `${SEASONS[anime.season]} ${anime.seasonYear}` : anime.seasonYear,
    anime.episodes ? plural(anime.episodes, 'episode') : null,
    STATUS[anime.status],
    anime.studios,
  ].filter(Boolean);

  return (
    <section className="anime-detail">
      <div
        className="anime-hero"
        style={{ '--cover-color': anime.color || 'var(--accent)', backgroundImage: anime.banner ? `url(${anime.banner})` : undefined }}
      >
        <div className="anime-hero-shade" />
        <div className="anime-hero-content">
          {anime.cover && <img className="cover" src={anime.cover} alt={anime.title} />}
          <div className="anime-hero-text">
            <h2>{anime.title}</h2>
            {anime.titleRomaji && anime.titleRomaji !== anime.title && <div className="hero-sub">{anime.titleRomaji}</div>}
            <div className="hero-meta">{meta.join(' · ')}</div>
            <div className="genre-chips">
              {anime.genres.map((g) => (
                <span key={g} className="chip small">
                  {g}
                </span>
              ))}
              {anime.averageScore && <span className="chip small">AniList {anime.averageScore}%</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="anime-actions">
        {anime.trailer && (
          <button className="btn primary" onClick={() => setTrailer(true)}>
            ▶ Watch trailer
          </button>
        )}
        <AddToListMenu kind="watchlist" itemId={anime.id} label="🍿 Watchlist" />
        <AddToListMenu kind="anime" itemId={anime.id} label="📋 Anime list" />
        <a className="btn ghost" href={`#/discover/similar/${anime.id}`}>
          🔎 Similar anime
        </a>
        <a className="btn ghost" href={`https://anilist.co/anime/${anime.id}`} target="_blank" rel="noreferrer">
          AniList ↗
        </a>
      </div>

      <div className="anime-columns">
        <div className="anime-col">
          <MyEntry anime={anime} mine={mine} onSaved={onSaved} />

          {anime.description && (
            <div className="card">
              <h3>Synopsis</h3>
              <p className={`synopsis ${showSynopsis ? 'open' : ''}`}>{anime.description}</p>
              {anime.description.length > 320 && (
                <button className="link-btn" onClick={() => setShowSynopsis((s) => !s)}>
                  {showSynopsis ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          <div className="card">
            <h3>Everyone's take</h3>
            {mine?.review && <ReviewCard entry={mine} isMine />}
            {others.length === 0 && !mine?.review && <p className="muted small">Nobody else has this in their catalogue yet.</p>}
            {others.map((o) => (
              <ReviewCard key={o.user.id} entry={o} />
            ))}
          </div>

          {watchThreads.map((t) => (
            <div className="card" key={t.thread}>
              <h3>
                💬 From the watchlist “{t.list?.name}” {t.onList ? '' : <span className="muted small">(watched)</span>}
              </h3>
              <Thread thread={t.thread} />
            </div>
          ))}
        </div>

        <div className="anime-col">
          {(characters.length > 0 || animeLists.length > 0) && (
            <div className="card">
              <h3>In your lists</h3>
              {myChars.length === 0 && animeLists.filter((l) => l.owner?.id === me.id).length === 0 && (
                <p className="muted small">None of your lists include this anime or its characters yet.</p>
              )}
              <div className="char-chips">
                {animeLists
                  .filter((l) => l.owner?.id === me.id || l.list.isShared)
                  .map((l) => (
                    <a key={l.list.id} className="char-chip" href={`#/list/${l.list.id}`}>
                      <span>
                        <b>🎬 #{l.rank}</b>
                        <span className="muted tiny">
                          of {l.list.size} · {l.list.name}
                        </span>
                      </span>
                    </a>
                  ))}
                {myChars.map((c) => (
                  <CharacterChip key={c.entryId} c={c} me={me} />
                ))}
              </div>
              {otherChars.length > 0 && (
                <>
                  <h4>In other people's lists</h4>
                  <div className="char-chips">
                    {otherChars.map((c) => (
                      <CharacterChip key={c.entryId} c={c} me={me} showOwner />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className={`card ${showSuggest ? 'highlight' : ''}`} ref={suggestRef}>
            <h3>{showSuggest ? '✨ Rank its characters?' : 'Characters'}</h3>
            {showSuggest && <p className="muted small">Add characters from {anime.title} to your character lists.</p>}
            <Cast animeId={anime.id} initial={anime.characters} ranked={ranked} />
          </div>
        </div>
      </div>

      {trailer && anime.trailer && <TrailerModal trailer={anime.trailer} title={anime.title} onClose={() => setTrailer(false)} />}
    </section>
  );
}
