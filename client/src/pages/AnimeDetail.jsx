import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { formatLabel, mediaHref, plural, statusLabel, timeAgo, parseDate } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import Stars from '../components/Stars.jsx';
import Thread from '../components/Thread.jsx';
import Reactions from '../components/Reactions.jsx';
import TrailerModal from '../components/TrailerModal.jsx';
import AddToListMenu from '../components/AddToListMenu.jsx';
import { formatPopularity } from '../components/AnimeTile.jsx';
import { CatalogueBadge } from '../components/EntryRow.jsx';
import Modal from '../components/Modal.jsx';

const SEASONS = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
const RELATIONS = {
  ADAPTATION: 'Adaptation',
  SOURCE: 'Based on',
  PREQUEL: 'Prequel',
  SEQUEL: 'Sequel',
  SIDE_STORY: 'Side story',
  SPIN_OFF: 'Spin-off',
  PARENT: 'Main story',
  ALTERNATIVE: 'Alternative version',
};

// Openings & endings from AnimeThemes; tap to play in the video pop-up.
function Themes({ animeId }) {
  const [themes, setThemes] = useState(null);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .themes(animeId)
      .then((d) => !cancelled && setThemes(d.themes))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [animeId]);
  if (themes && themes.length === 0) return null;
  return (
    <div className="card">
      <h3>🎵 Openings & endings</h3>
      {error && <p className="muted small">{error}</p>}
      {!themes && !error && <p className="muted small">Loading…</p>}
      {themes && (
        <ul className="themes">
          {themes.map((t) => (
            <li key={t.id}>
              <button type="button" className="theme" onClick={() => setPlaying(t)}>
                <span className="theme-slug">{t.slug}</span>
                <span className="theme-info">
                  <b>{t.title ?? 'Untitled'}</b>
                  <span className="muted tiny">
                    {t.artists.join(', ')}
                    {t.episodes ? ` · ep ${t.episodes}` : ''}
                    {t.spoiler ? ' · ⚠️ spoiler' : ''}
                  </span>
                </span>
                <span aria-hidden="true">▶</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {playing && (
        <Modal title={`${playing.slug} · ${playing.title ?? ''}`} onClose={() => setPlaying(null)} wide center>
          <div className="video-frame">
            <video src={playing.video} controls autoPlay playsInline />
          </div>
        </Modal>
      )}
    </div>
  );
}
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

function ReviewCard({ entry, isMine, type }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(entry.commentCount);
  return (
    <div className="review-card">
      <div className="review-head">
        <Avatar user={entry.user} size={32} />
        <div>
          <b>{isMine ? 'You' : entry.user?.username}</b>
          <div className="muted tiny">
            {statusLabel(entry.status, type)}
            {entry.status === 'watching' && ` · ${type === 'MANGA' ? 'ch' : 'ep'} ${entry.progress}`} · {timeAgo(parseDate(entry.updatedAt))}
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
  const manga = anime.type === 'MANGA';

  return (
    <div className="card my-entry">
      <h3>Your take</h3>
      <div className="segmented status-picker">
        {['watched', 'watching', 'dropped'].map((s) => (
          <button key={s} type="button" disabled={busy} className={mine?.status === s ? 'active' : ''} onClick={() => save({ status: s })}>
            {statusLabel(s, anime.type)}
          </button>
        ))}
      </div>
      {!mine && <p className="muted small">Pick a status to add it to your catalogue.</p>}

      {mine?.status === 'watching' && (
        <div className="progress-rows">
          <div className="progress">
            <button className="icon-btn" disabled={busy} onClick={() => save({ progress: Math.max(0, mine.progress - 1) })} aria-label="One back">
              −
            </button>
            <span>
              {manga ? 'Chapter' : 'Episode'} {mine.progress}
              {(manga ? anime.chapters : anime.episodes) ? ` of ${manga ? anime.chapters : anime.episodes}` : ''}
            </span>
            <button className="icon-btn" disabled={busy} onClick={() => save({ progress: mine.progress + 1 })} aria-label="One more">
              +
            </button>
          </div>
          {manga && (
            <div className="progress">
              <button className="icon-btn" disabled={busy} onClick={() => save({ progressVolumes: Math.max(0, (mine.progressVolumes ?? 0) - 1) })} aria-label="One volume back">
                −
              </button>
              <span>
                Volume {mine.progressVolumes ?? 0}
                {anime.volumes ? ` of ${anime.volumes}` : ''}
              </span>
              <button className="icon-btn" disabled={busy} onClick={() => save({ progressVolumes: (mine.progressVolumes ?? 0) + 1 })} aria-label="One more volume">
                +
              </button>
            </div>
          )}
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
    <a className="char-chip" href={`#/character/${c.characterId}`} title={`${c.name}: #${c.rank} in ${c.list.name}`}>
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
            <a href={`#/character/${c.id}`} className="cast-img">
              {c.image && <img src={c.image} alt="" loading="lazy" />}
            </a>
            <div className="cast-info">
              <a href={`#/character/${c.id}`} className="cast-name">
                <b>{c.name}</b>
              </a>
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

  const manga = anime.type === 'MANGA';
  const meta = [
    formatLabel(anime.format),
    anime.season && anime.seasonYear ? `${SEASONS[anime.season]} ${anime.seasonYear}` : anime.seasonYear,
    manga ? (anime.chapters ? plural(anime.chapters, 'chapter') : null) : anime.episodes ? plural(anime.episodes, 'episode') : null,
    manga && anime.volumes ? plural(anime.volumes, 'volume') : null,
    !manga && anime.duration ? `${anime.duration} min` : null,
    manga && anime.status === 'RELEASING' ? 'Publishing' : STATUS[anime.status],
    anime.studios,
  ].filter(Boolean);
  const adaptations = anime.relations.filter((r) => r.relationType === 'ADAPTATION' || r.relationType === 'SOURCE');
  const related = anime.relations.filter((r) => ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'PARENT', 'ALTERNATIVE'].includes(r.relationType));

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
        <AddToListMenu kind={manga ? 'manga' : 'anime'} itemId={anime.id} label={manga ? '📋 Manga list' : '📋 Anime list'} />
        <a className="btn ghost" href={`#/discover/similar/${anime.id}`}>
          🔎 Similar {manga ? 'manga' : 'anime'}
        </a>
        <a className="btn ghost" href={`https://anilist.co/${manga ? 'manga' : 'anime'}/${anime.id}`} target="_blank" rel="noreferrer">
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

          {!manga && <Themes animeId={anime.id} />}

          <div className="card">
            <h3>Everyone's take</h3>
            {mine?.review && <ReviewCard entry={mine} isMine type={anime.type} />}
            {others.length === 0 && !mine?.review && <p className="muted small">Nobody else has this in their catalogue yet.</p>}
            {others.map((o) => (
              <ReviewCard key={o.user.id} entry={o} type={anime.type} />
            ))}
          </div>

          {(adaptations.length > 0 || related.length > 0) && (
            <div className="card">
              <h3>{manga ? '🎬 Adapted as' : '📖 Source & related'}</h3>
              <ul className="relations">
                {[...adaptations, ...related].map((r) => (
                  <li key={`${r.relationType}-${r.id}`}>
                    <a href={mediaHref(r)} className="relation">
                      {r.cover && <img src={r.cover} alt="" loading="lazy" />}
                      <span>
                        <b>{r.title}</b>
                        <span className="muted tiny">
                          {RELATIONS[r.relationType] ?? r.relationType} · {formatLabel(r.format)}
                          {r.year ? ` · ${r.year}` : ''}
                        </span>
                      </span>
                    </a>
                    <CatalogueBadge animeId={r.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}

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
