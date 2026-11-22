import { useEffect, useMemo, useState } from 'react';
import { animeSearch, api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { plural } from '../util.js';
import AnimeTile, { relationText } from '../components/AnimeTile.jsx';
import TrailerModal from '../components/TrailerModal.jsx';
import TrailerReel from '../components/TrailerReel.jsx';
import ObscuritySlider, { applyObscurity, savedObscurity } from '../components/ObscuritySlider.jsx';
import SearchBox from '../components/SearchBox.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import Stars from '../components/Stars.jsx';

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SEASON_NAMES = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
const SEASON_MONTHS = { WINTER: 'Jan–Mar', SPRING: 'Apr–Jun', SUMMER: 'Jul–Sep', FALL: 'Oct–Dec' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FORMAT_FILTERS = [
  ['all', 'All'],
  ['TV', 'TV'],
  ['ONA', 'ONA'],
  ['MOVIE', 'Movie'],
  ['other', 'Other'],
];
const PAGE = 40;

const VIEWS = [
  ['season', '📅 This season', '#/discover'],
  ['calendar', '🗓️ Calendar', '#/discover/calendar'],
  ['foryou', '✨ For you', '#/discover/foryou'],
  ['similar', '🔎 Similar', '#/discover/similar'],
];

function matchesFormat(a, f) {
  if (f === 'all') return true;
  if (f === 'other') return !['TV', 'ONA', 'MOVIE'].includes(a.format);
  return a.format === f;
}

function Loading({ text }) {
  return (
    <div className="empty-state">
      <span className="spinner inline" aria-hidden="true" />
      <p className="muted">{text}</p>
    </div>
  );
}

function FormatFilter({ value, onChange }) {
  return (
    <div className="segmented compact-seg">
      {FORMAT_FILTERS.map(([key, label]) => (
        <button key={key} type="button" className={value === key ? 'active' : ''} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ---- This season ------------------------------------------------------------------------

function SeasonView({ season, year }) {
  const { navigate } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [format, setFormat] = useState('all');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState('popular');
  const [onlyMine, setOnlyMine] = useState(false);
  const [hideSeen, setHideSeen] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [reel, setReel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .discoverSeason(season, year)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [season, year]);

  const genres = useMemo(() => [...new Set((data?.items ?? []).flatMap((a) => a.genres))].sort(), [data]);

  const shown = useMemo(() => {
    const list = (data?.items ?? []).filter(
      (a) =>
        matchesFormat(a, format) &&
        (!genre || a.genres.includes(genre)) &&
        (!onlyMine || a.related.length > 0) &&
        (!hideSeen || !a.myStatus),
    );
    if (sort === 'score') list.sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
    else if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'airing')
      list.sort((a, b) => (a.nextAiring?.airingAt ?? Infinity) - (b.nextAiring?.airingAt ?? Infinity));
    return list;
  }, [data, format, genre, sort, onlyMine, hideSeen]);

  const withTrailers = shown.filter((a) => a.trailer);
  const mineCount = (data?.items ?? []).filter((a) => a.related.length > 0).length;

  const s = season ?? data?.season;
  const y = year ?? data?.year;
  const shift = (delta) => {
    if (!s) return;
    let i = SEASONS.indexOf(s) + delta;
    let ny = y;
    if (i < 0) {
      i = 3;
      ny -= 1;
    } else if (i > 3) {
      i = 0;
      ny += 1;
    }
    navigate(`#/discover/season/${ny}/${SEASONS[i]}`);
  };
  const isCurrent = data && data.current.season === s && data.current.year === y;

  return (
    <>
      <div className="season-nav">
        <button type="button" className="btn ghost" onClick={() => shift(-1)} disabled={!s} aria-label="Previous season">
          ◀
        </button>
        <h3>
          {s ? `${SEASON_NAMES[s]} ${y}` : 'This season'}
          {s && <span className="muted small"> · {SEASON_MONTHS[s]}</span>}
        </h3>
        <button type="button" className="btn ghost" onClick={() => shift(1)} disabled={!s} aria-label="Next season">
          ▶
        </button>
        {data && !isCurrent && (
          <a className="link-btn small" href="#/discover">
            Back to this season
          </a>
        )}
      </div>

      <FilterPanel
        active={[format !== 'all', !!genre, sort !== 'popular', onlyMine, hideSeen].filter(Boolean).length}
        onReset={() => {
          setFormat('all');
          setGenre('');
          setSort('popular');
          setOnlyMine(false);
          setHideSeen(false);
        }}
        summary={data ? plural(shown.length, 'anime', 'anime') : null}
      >
        <FormatFilter value={format} onChange={setFormat} />
        <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre">
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="popular">Most popular</option>
          <option value="score">Highest score</option>
          <option value="airing">Next episode soonest</option>
          <option value="title">Title</option>
        </select>
        {mineCount > 0 && (
          <label className="check small">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> ⭐ Related to my anime ({mineCount})
          </label>
        )}
        <label className="check small">
          <input type="checkbox" checked={hideSeen} onChange={(e) => setHideSeen(e.target.checked)} /> Hide my catalogue
        </label>
      </FilterPanel>

      {withTrailers.length > 0 && (
        <button type="button" className="btn primary wide trailer-all" onClick={() => setReel(0)}>
          ▶ Play all {withTrailers.length} trailers
        </button>
      )}

      {error && <div className="banner error">{error}</div>}
      {!data && !error && <Loading text="Loading the season from AniList…" />}
      {data && (
        <>
          <ul className="tile-grid">
            {shown.map((a) => (
              <AnimeTile key={a.id} a={a} onTrailer={setTrailer} />
            ))}
          </ul>
        </>
      )}

      {trailer && <TrailerModal trailer={trailer.trailer} title={trailer.title} onClose={() => setTrailer(null)} />}
      {reel !== null && (
        <TrailerReel items={withTrailers} startIndex={reel} title={`${SEASON_NAMES[s]} ${y} trailers`} onClose={() => setReel(null)} />
      )}
    </>
  );
}

// ---- Calendar ---------------------------------------------------------------------------

function bucketOf(a) {
  const sd = a.startDate;
  if (sd?.month) {
    const season = SEASONS[Math.floor((sd.month - 1) / 3)];
    return { key: sd.year * 10 + SEASONS.indexOf(season), label: `${SEASON_NAMES[season]} ${sd.year}`, sub: SEASON_MONTHS[season] };
  }
  if (a.season && a.seasonYear) {
    return { key: a.seasonYear * 10 + SEASONS.indexOf(a.season), label: `${SEASON_NAMES[a.season]} ${a.seasonYear}`, sub: SEASON_MONTHS[a.season] };
  }
  if (sd?.year) return { key: sd.year * 10 + 9, label: `${sd.year}`, sub: 'exact date not announced yet' };
  return null;
}

function dateLabel(a) {
  const sd = a.startDate;
  if (sd?.month && sd?.day) return `${MONTHS[sd.month - 1]} ${sd.day}`;
  if (sd?.month) return MONTHS[sd.month - 1];
  return null;
}

function CalendarView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [format, setFormat] = useState('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [trailer, setTrailer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .discoverUpcoming()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const mine = useMemo(() => (data?.items ?? []).filter((a) => a.related.length > 0), [data]);

  const buckets = useMemo(() => {
    const map = new Map();
    for (const a of data?.items ?? []) {
      if (!matchesFormat(a, format) || (onlyMine && !a.related.length)) continue;
      const b = bucketOf(a);
      if (!b) continue;
      if (!map.has(b.key)) map.set(b.key, { ...b, items: [] });
      map.get(b.key).items.push(a);
    }
    const fuzzy = (a) => (a.startDate ? a.startDate.year * 10000 + (a.startDate.month ?? 99) * 100 + (a.startDate.day ?? 99) : Infinity);
    return [...map.values()]
      .sort((x, y) => x.key - y.key)
      .map((b) => ({ ...b, items: b.items.sort((p, q) => fuzzy(p) - fuzzy(q) || (q.popularity ?? 0) - (p.popularity ?? 0)) }));
  }, [data, format, onlyMine]);

  return (
    <>
      {mine.length > 0 && (
        <div className="card mine-upcoming">
          <h3>⭐ Coming up from anime you've seen</h3>
          <ul className="mine-list">
            {mine.slice(0, 12).map((a) => (
              <li key={a.id}>
                <a href={`#/anime/${a.id}`}>{a.title}</a>
                <span className="muted small">
                  {' '}
                  · {relationText(a.related)} · {dateLabel(a) ? `${dateLabel(a)} ${a.startDate.year}` : bucketOf(a)?.label ?? 'TBA'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FilterPanel
        active={[format !== 'all', onlyMine].filter(Boolean).length}
        onReset={() => {
          setFormat('all');
          setOnlyMine(false);
        }}
      >
        <FormatFilter value={format} onChange={setFormat} />
        {mine.length > 0 && (
          <label className="check small">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> ⭐ Only anime related to mine
          </label>
        )}
      </FilterPanel>

      {error && <div className="banner error">{error}</div>}
      {!data && !error && <Loading text="Loading upcoming releases from AniList…" />}
      {data && buckets.length === 0 && <p className="muted">Nothing announced matches these filters.</p>}
      {buckets.map((b) => (
        <section key={b.key} className="calendar-season">
          <h3 className="calendar-head">
            {b.label} <span className="muted small">· {b.sub} · {plural(b.items.length, 'anime', 'anime')}</span>
          </h3>
          <ul className="tile-grid">
            {b.items.map((a) => (
              <AnimeTile key={a.id} a={a} onTrailer={setTrailer} dateLabel={dateLabel(a)} />
            ))}
          </ul>
        </section>
      ))}

      {trailer && <TrailerModal trailer={trailer.trailer} title={trailer.title} onClose={() => setTrailer(null)} />}
    </>
  );
}

// ---- Recommendations ----------------------------------------------------------------------

function RecommendationGrid({ items, renderNote }) {
  const [obscurity, setObscurity] = useState(savedObscurity);
  const [genre, setGenre] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [trailer, setTrailer] = useState(null);

  const genres = useMemo(() => [...new Set(items.flatMap((a) => a.genres))].sort(), [items]);
  const ranked = useMemo(
    () => applyObscurity(items.filter((a) => !genre || a.genres.includes(genre)), obscurity),
    [items, genre, obscurity],
  );

  return (
    <>
      <div className="filters rec-filters">
        <ObscuritySlider value={obscurity} onChange={setObscurity} />
        <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre">
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      {ranked.length === 0 ? (
        <p className="muted">No recommendations match these filters.</p>
      ) : (
        <ul className="tile-grid">
          {ranked.slice(0, limit).map((a) => (
            <AnimeTile key={a.id} a={a} onTrailer={setTrailer} note={renderNote?.(a)} />
          ))}
        </ul>
      )}
      {ranked.length > limit && (
        <button type="button" className="btn ghost wide" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({ranked.length - limit} left)
        </button>
      )}
      {trailer && <TrailerModal trailer={trailer.trailer} title={trailer.title} onClose={() => setTrailer(null)} />}
    </>
  );
}

function ForYouView() {
  const [type, setType] = useState('ANIME');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const word = type === 'MANGA' ? 'manga' : 'anime';

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .forYou(type)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [type]);

  const switcher = (
    <div className="segmented compact-seg type-switch">
      <button type="button" className={type === 'ANIME' ? 'active' : ''} onClick={() => setType('ANIME')}>
        🎬 Anime
      </button>
      <button type="button" className={type === 'MANGA' ? 'active' : ''} onClick={() => setType('MANGA')}>
        📖 Manga
      </button>
    </div>
  );

  if (error)
    return (
      <>
        {switcher}
        <div className="banner error">{error}</div>
      </>
    );
  if (!data)
    return (
      <>
        {switcher}
        <Loading text="Working out recommendations from your catalogue… The first time can take a few seconds." />
      </>
    );
  if (data.seedCount === 0) {
    return (
      <>
        {switcher}
        <div className="empty-state">
          <p className="muted">
            Add {word} you've {type === 'MANGA' ? 'read' : 'watched'} under{' '}
            <a href={type === 'MANGA' ? '#/profile/manga' : '#/profile'}>My {word}</a> (your profile) and rate them. Recommendations are
            based on what you liked.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {switcher}
      <p className="muted small">
        Based on {plural(data.seedCount, word, word)} you liked, using AniList's community recommendations weighted by your
        ratings. {type === 'MANGA' ? 'Manga' : 'Anime'} in your catalogue are left out.
        {data.incomplete && ' AniList is busy right now, so some recommendations are still missing. Try again in a minute.'}
      </p>
      <RecommendationGrid
        items={data.results}
        renderNote={(a) =>
          a.reasons?.length > 0 && (
            <span className="tile-reason tiny">
              Because you liked{' '}
              {a.reasons.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && (i === a.reasons.length - 1 ? ' & ' : ', ')}
                  <a href={`#/anime/${r.id}`}>{r.title}</a>
                </span>
              ))}
            </span>
          )
        }
      />
    </>
  );
}

function SimilarView({ animeId }) {
  const { me, navigate } = useApp();
  const [mine, setMine] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .catalogue(me.id)
      .then((items) =>
        setMine(
          items
            .filter((i) => i.status !== 'dropped')
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.anime.title.localeCompare(b.anime.title)),
        ),
      )
      .catch(() => setMine([]));
  }, [me.id]);

  useEffect(() => {
    if (!animeId) return undefined;
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .similar(animeId)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [animeId]);

  return (
    <>
      <div className="similar-pick">
        <select
          value={animeId ?? ''}
          onChange={(e) => e.target.value && navigate(`#/discover/similar/${e.target.value}`)}
          aria-label="Pick one of your anime"
        >
          <option value="">Pick one of your anime…</option>
          {(mine ?? []).map((i) => (
            <option key={i.anime.id} value={i.anime.id}>
              {i.anime.title}
              {i.rating ? ` (${i.rating}★)` : ''}
            </option>
          ))}
        </select>
        <span className="muted small">or</span>
        <div className="similar-search">
          <SearchBox
            search={animeSearch}
            placeholder="search any anime…"
            addLabel="Find similar"
            onAdd={async (r) => navigate(`#/discover/similar/${r.id}`)}
          />
        </div>
      </div>

      {!animeId && <p className="muted">Pick an anime to see what fans of it also liked. Anime in your catalogue are left out.</p>}
      {error && <div className="banner error">{error}</div>}
      {animeId && !data && !error && <Loading text="Finding similar anime…" />}
      {data && (
        <>
          <div className="similar-base">
            {data.base.cover && <img src={data.base.cover} alt="" />}
            <div>
              <span className="muted small">Similar to</span>
              <h3>
                <a href={`#/anime/${data.base.id}`}>{data.base.title}</a>
              </h3>
              {mine?.find((i) => i.anime.id === data.base.id)?.rating && (
                <Stars value={mine.find((i) => i.anime.id === data.base.id).rating} readOnly size={16} />
              )}
            </div>
          </div>
          {data.results.length === 0 ? (
            <p className="muted">AniList has no recommendations for this one that you haven't already seen.</p>
          ) : (
            <RecommendationGrid
              items={data.results}
              renderNote={(a) => <span className="tile-reason tiny">👍 {plural(a.votes, 'fan vote')}</span>}
            />
          )}
        </>
      )}
    </>
  );
}

// ---- Page ---------------------------------------------------------------------------------------

export default function DiscoverPage({ route }) {
  const view = route.view ?? 'season';
  return (
    <section className="discover">
      <div className="discover-header">
        <h2>Discover</h2>
      </div>
      <div className="tabs compact discover-tabs" role="tablist">
        {VIEWS.map(([key, label, href]) => (
          <a key={key} href={href} role="tab" aria-selected={view === key} className={`tab-link ${view === key ? 'active' : ''}`}>
            {label}
          </a>
        ))}
      </div>
      {view === 'season' && <SeasonView season={route.season} year={route.year} />}
      {view === 'calendar' && <CalendarView />}
      {view === 'foryou' && <ForYouView />}
      {view === 'similar' && <SimilarView animeId={route.animeId} />}
    </section>
  );
}
