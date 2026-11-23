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

// ---- Ships ----
export const VOTES = [
  { value: 0, emoji: '🚫', label: 'No way' },
  { value: 1, emoji: '🤷', label: 'Meh' },
  { value: 2, emoji: '🙂', label: 'Cute' },
  { value: 3, emoji: '💕', label: 'Ship it' },
  { value: 4, emoji: '💍', label: 'OTP' },
];
export const voteText = (v) => (v == null ? 'No vote' : `${VOTES[v].emoji} ${VOTES[v].label}`);

export const SHIP_STATUS = {
  canon: { emoji: '💍', label: 'Canon', hint: 'Together in the story' },
  fanon: { emoji: '💫', label: 'Fanon', hint: 'Fans made it happen' },
  crack: { emoji: '🤡', label: 'Crack', hint: 'Gloriously unhinged' },
};

export const POPULARITY = {
  rarepair: { emoji: '💎', label: 'Rarepair' },
  known: { emoji: '✨', label: 'Known' },
  popular: { emoji: '🔥', label: 'Popular' },
};

export const compactCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

// Ship name suggestion in fandom style: the start of each first name up to its
// second vowel ("Naruto" + "Sasuke" -> "NaruSasu", "Satoru" + "Suguru" -> "SatoSugu").
function syllables(name) {
  const vowels = [...name.matchAll(/[aeiouy]+/gi)];
  const end = vowels.length >= 2 ? vowels[1].index + vowels[1][0].length : name.length;
  const part = name.slice(0, Math.min(end, 5)).toLowerCase();
  return part.charAt(0).toUpperCase() + part.slice(1);
}

export function blendNames(names) {
  const first = names.map((n) => String(n).trim().split(/[\s,]+/)[0]).filter(Boolean);
  if (first.length < 2) return first[0] ?? '';
  return first.map(syllables).join('');
}

// Where each page (by address) was scrolled to when you left it, recorded at
// the moment of navigating away (pages that stay loaded can return there).
export const scrollMemory = new Map();
