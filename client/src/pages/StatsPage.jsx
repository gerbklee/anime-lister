import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { CATEGORIES, formatMinutes, mediaHref, plural } from '../util.js';
import Stars from '../components/Stars.jsx';
import Wrapped from '../components/Wrapped.jsx';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (ym) => MONTH_NAMES[Number(ym.slice(5, 7)) - 1];

function Bars({ items, labelOf, valueOf, format = (v) => v }) {
  const max = Math.max(1, ...items.map(valueOf));
  return (
    <ul className="stat-bars">
      {items.map((it) => (
        <li key={labelOf(it)}>
          <span className="stat-bar-label">{labelOf(it)}</span>
          <span className="stat-bar">
            <span style={{ width: `${(valueOf(it) / max) * 100}%` }} />
          </span>
          <span className="muted tiny">{format(valueOf(it))}</span>
        </li>
      ))}
    </ul>
  );
}

export function personalSlides(w, name) {
  const slides = [{ emoji: '🎁', kicker: `${w.year} Wrapped`, big: name, sub: w.year === new Date().getFullYear() ? 'Your year in anime & manga (so far)' : 'Your year in anime & manga' }];
  slides.push({
    emoji: '⏱️',
    kicker: 'You spent',
    big: formatMinutes(w.anime.minutes),
    sub: `watching anime · ${plural(w.anime.finished, 'anime', 'anime')} finished, ${w.anime.started} started`,
  });
  if (w.manga.chapters > 0 || w.manga.finished > 0) {
    slides.push({ emoji: '📖', kicker: 'You read', big: plural(w.manga.chapters, 'chapter'), sub: `${plural(w.manga.finished, 'manga', 'manga')} finished` });
  }
  if (w.firstOfYear) slides.push({ kicker: 'Your year started with', big: w.firstOfYear.title, image: w.firstOfYear.cover });
  if (w.topRated[0]) {
    slides.push({
      kicker: 'Your favourite this year',
      big: w.topRated[0].anime.title,
      sub: `${w.topRated[0].rating} ★${w.topRated[1] ? ` · runner-up: ${w.topRated[1].anime.title}` : ''}`,
      image: w.topRated[0].anime.cover,
    });
  }
  if (w.topGenre[0]) slides.push({ emoji: '🎭', kicker: 'Your genre of the year', big: w.topGenre[0], sub: w.topGenre.length > 1 ? `followed by ${w.topGenre.slice(1).join(' & ')}` : null });
  if (w.topStudio) slides.push({ emoji: '🏢', kicker: 'Your studio of the year', big: w.topStudio });
  if (w.busiestMonth) slides.push({ emoji: '📅', kicker: 'Your busiest month', big: monthName(w.busiestMonth.month), sub: `${plural(w.busiestMonth.count, 'thing')} logged` });
  for (const [cat, c] of Object.entries(w.favourites ?? {})) {
    slides.push({ kicker: `Your #1 ${CATEGORIES[cat]?.label ?? cat}`, big: c.name, image: c.image, emoji: CATEGORIES[cat]?.emoji });
  }
  if (w.reviews || w.charactersAdded || w.listsCreated) {
    slides.push({
      emoji: '✍️',
      kicker: 'You also',
      big: `${plural(w.reviews, 'review')} written`,
      sub: `${plural(w.charactersAdded, 'character')} added to lists · ${plural(w.listsCreated, 'new list')}`,
    });
  }
  slides.push({ emoji: '✨', kicker: `That was ${w.year}`, big: 'See you next year!', sub: 'Made with ⭐ Anime Lister' });
  return slides;
}

export default function StatsPage({ userId }) {
  const { me } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [slides, setSlides] = useState(null);
  const [loadingWrapped, setLoadingWrapped] = useState(false);
  const isMe = userId === me.id;

  useEffect(() => {
    api
      .stats(userId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [userId]);

  const openWrapped = async () => {
    setLoadingWrapped(true);
    try {
      const w = await api.wrapped(userId, year);
      setSlides(personalSlides(w, isMe ? 'You' : w.user.username));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingWrapped(false);
    }
  };

  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const o = data.overview;

  return (
    <div className="stats-page">
      <div className="card wrapped-card">
        <div>
          <h3>🎁 {isMe ? 'Your' : `${data.user.username}'s`} Wrapped</h3>
          <p className="muted small">A slideshow of the year: time spent, favourites, genres and #1s. Save slides as images.</p>
        </div>
        <div className="wrapped-controls">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {data.years.map((y) => (
              <option key={y} value={y}>
                {y}
                {y === new Date().getFullYear() ? ' (so far)' : ''}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={openWrapped} disabled={loadingWrapped}>
            {loadingWrapped ? 'Opening…' : '▶ Play Wrapped'}
          </button>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-value">{formatMinutes(o.anime.minutes)}</span>
          <span className="muted tiny">watching anime</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{o.anime.episodes}</span>
          <span className="muted tiny">episodes</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{o.anime.watched}</span>
          <span className="muted tiny">anime watched · {o.anime.watching} watching</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{o.manga.chapters}</span>
          <span className="muted tiny">chapters read · {o.manga.watched} manga finished</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{o.ratings.average ?? '–'} ★</span>
          <span className="muted tiny">average of {plural(o.ratings.count, 'rating')}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{o.reviews}</span>
          <span className="muted tiny">reviews written</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card">
          <h3>⭐ Ratings</h3>
          <div className="rating-histogram">
            {Object.entries(o.ratings.distribution)
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([stars, count]) => {
                const max = Math.max(1, ...Object.values(o.ratings.distribution));
                return (
                  <div key={stars} className="histo-col" title={`${stars} ★: ${count}`}>
                    <span className="histo-bar" style={{ height: `${(count / max) * 100}%` }} />
                    <span className="tiny muted">{Number(stars) % 1 ? '' : stars}</span>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="card">
          <h3>📅 Activity (12 months)</h3>
          <div className="rating-histogram months">
            {o.months.map((m) => {
              const max = Math.max(1, ...o.months.map((x) => x.count));
              return (
                <div key={m.month} className="histo-col" title={`${monthName(m.month)}: ${m.count}`}>
                  <span className="histo-bar" style={{ height: `${(m.count / max) * 100}%` }} />
                  <span className="tiny muted">{monthName(m.month).slice(0, 1)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3>🎭 Genres</h3>
          {o.genres.length ? <Bars items={o.genres} labelOf={(g) => g.label} valueOf={(g) => g.count} /> : <p className="muted small">No data yet.</p>}
        </div>

        <div className="card">
          <h3>🏢 Studios</h3>
          {o.studios.length ? <Bars items={o.studios} labelOf={(s) => s.label} valueOf={(s) => s.count} /> : <p className="muted small">No data yet.</p>}
        </div>

        <div className="card">
          <h3>🏆 Top rated</h3>
          {o.topRated.length === 0 && <p className="muted small">Nothing rated yet.</p>}
          <ul className="stat-covers">
            {o.topRated.map((t) => (
              <li key={t.anime.id}>
                <a href={mediaHref(t.anime)} title={t.anime.title}>
                  {t.anime.cover && <img src={t.anime.cover} alt={t.anime.title} loading="lazy" />}
                </a>
                <Stars value={t.rating} readOnly size={11} />
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>💘 Favourite characters</h3>
          {o.favouriteCharacters.length === 0 && <p className="muted small">No ranked characters yet.</p>}
          <ul className="stat-covers">
            {o.favouriteCharacters.map((c) => (
              <li key={c.id}>
                <a href={`#/character/${c.id}`} title={`${c.name}: #${c.rank} in ${c.list}`}>
                  {c.image && <img src={c.image} alt={c.name} loading="lazy" />}
                </a>
                <span className="tiny">#{c.rank}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="muted tiny">Times are estimated from episode counts and lengths. History starts from when you began using the site.</p>

      {slides && <Wrapped slides={slides} onClose={() => setSlides(null)} />}
    </div>
  );
}
