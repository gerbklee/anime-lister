import { formatLabel } from '../util.js';
import AddToListMenu from './AddToListMenu.jsx';
import { CatalogueBadge } from './EntryRow.jsx';

const RELATION_LABELS = {
  PREQUEL: 'New season of',
  PARENT: 'Side story of',
  SIDE_STORY: 'Related to',
  SPIN_OFF: 'Spin-off of',
  ALTERNATIVE: 'Alternative version of',
  SOURCE: 'Related to',
  SUMMARY: 'Recap of',
  CHARACTER: 'Shares characters with',
  OTHER: 'Related to',
};

export function relationText(related) {
  const r = related.find((x) => x.type === 'PREQUEL') ?? related[0];
  return `${RELATION_LABELS[r.type] ?? 'Related to'} ${r.title ?? 'an anime you know'}`;
}

export function formatPopularity(n) {
  if (!n) return '–';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function airingText(a) {
  if (a.nextAiring?.airingAt) {
    const days = Math.round((a.nextAiring.airingAt * 1000 - Date.now()) / 86_400_000);
    const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    return `Ep ${a.nextAiring.episode} ${when}`;
  }
  return null;
}

// Cover card used in Discover. `note` adds a line (e.g. "Because you liked …").
export default function AnimeTile({ a, onTrailer, note, dateLabel }) {
  const meta = [formatLabel(a.format), a.episodes ? `${a.episodes} ep` : null, a.studio].filter(Boolean).join(' · ');
  const airing = airingText(a);
  const highlight = a.related?.length > 0;

  return (
    <li className={`tile ${highlight ? 'highlight' : ''}`}>
      <a href={`#/anime/${a.id}`} className="tile-cover" style={{ '--cover-color': a.color || 'var(--surface-2)' }}>
        {a.cover && <img src={a.cover} alt={a.title} loading="lazy" />}
        {dateLabel && <span className="tile-date">{dateLabel}</span>}
        <span className="tile-pop" title={`${a.popularity ?? 0} AniList users`}>
          👥 {formatPopularity(a.popularity)}
        </span>
      </a>
      <div className="tile-body">
        {highlight && <span className="tile-related">⭐ {relationText(a.related)}</span>}
        <a href={`#/anime/${a.id}`} className="tile-title" title={a.title}>
          {a.title}
        </a>
        {meta && <span className="muted tiny tile-meta">{meta}</span>}
        {a.genres?.length > 0 && <span className="muted tiny tile-meta">{a.genres.slice(0, 3).join(' · ')}</span>}
        {(airing || a.averageScore) && (
          <span className="tiny tile-meta">
            {airing && <span className="airing">{airing}</span>}
            {airing && a.averageScore ? ' · ' : ''}
            {a.averageScore ? <span className="muted">★ {a.averageScore}%</span> : null}
          </span>
        )}
        {note}
        <div className="tile-badges">
          <CatalogueBadge animeId={a.id} />
          {a.onWatchlist && <span className="cat-badge watching">🍿 On watchlist</span>}
        </div>
        <div className="tile-actions">
          {a.trailer && onTrailer && (
            <button type="button" className="btn ghost small-btn" onClick={() => onTrailer(a)}>
              ▶ Trailer
            </button>
          )}
          <AddToListMenu kind="watchlist" itemId={a.id} label="🍿" className="btn ghost small-btn" />
        </div>
      </div>
    </li>
  );
}
