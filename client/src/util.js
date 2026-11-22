export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const FORMATS = { TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
export const formatLabel = (f) => FORMATS[f] ?? f ?? '';

export function animeMeta(a) {
  if (!a) return '';
  return [formatLabel(a.format), a.seasonYear, a.episodes ? `${a.episodes} ep` : null].filter(Boolean).join(' · ');
}

export const STATUS_LABELS = { watched: 'Watched', watching: 'Watching', dropped: 'Dropped' };
export const KIND_LABELS = { character: 'character', anime: 'anime', watchlist: 'watch' };

export function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(ms).toLocaleDateString();
}

// Parses SQLite "YYYY-MM-DD HH:MM:SS" (UTC) or ISO strings.
export function parseDate(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}
