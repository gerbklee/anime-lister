export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const FORMATS = {
  TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music',
  MANGA: 'Manga', NOVEL: 'Novel', ONE_SHOT: 'One-shot',
};
export const formatLabel = (f) => FORMATS[f] ?? f ?? '';

export const isManga = (a) => a?.type === 'MANGA';

// Works for anime and manga.
export function animeMeta(a) {
  if (!a) return '';
  if (isManga(a)) {
    return [formatLabel(a.format), a.seasonYear, a.chapters ? `${a.chapters} ch` : a.volumes ? `${a.volumes} vol` : null]
      .filter(Boolean)
      .join(' · ');
  }
  return [formatLabel(a.format), a.seasonYear, a.episodes ? `${a.episodes} ep` : null].filter(Boolean).join(' · ');
}

export const mediaHref = (a) => (isManga(a) ? `#/manga/${a.id}` : `#/anime/${a.id}`);

export const STATUS_LABELS = { watched: 'Watched', watching: 'Watching', dropped: 'Dropped' };
const MANGA_STATUS_LABELS = { watched: 'Read', watching: 'Reading', dropped: 'Dropped' };
export const statusLabel = (status, type) => (type === 'MANGA' ? MANGA_STATUS_LABELS : STATUS_LABELS)[status] ?? status;

export function formatMinutes(min) {
  if (!min) return '0 h';
  const h = Math.floor(min / 60);
  return h >= 48 ? `${Math.round(h / 24)} days` : h ? `${h} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`;
}
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

// Character list categories (used for "My type").
export const CATEGORIES = {
  daddy: { label: 'Daddy', emoji: '👨' },
  mommy: { label: 'Mommy', emoji: '👩' },
  waifu: { label: 'Waifu', emoji: '💖' },
  husbando: { label: 'Husbando', emoji: '💙' },
  other: { label: 'Other', emoji: '⭐' },
};

export const listEmoji = (l) => l.emoji || (l.kind === 'character' ? CATEGORIES[l.category]?.emoji : null) || '';
