import { animeMeta } from './util.js';

let onUnauthorized = () => {};

// Called whenever the server says the session is gone (e.g. logged out elsewhere).
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, url, body, { signal } = {}) {
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    method,
    signal,
    credentials: 'same-origin',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized();
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;

export const api = {
  // Auth & profile
  me: () => request('GET', '/api/auth/me'),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  register: (username, password) => request('POST', '/api/auth/register', { username, password }),
  logout: () => request('POST', '/api/auth/logout'),
  changePassword: (currentPassword, newPassword) =>
    request('POST', '/api/auth/password', { currentPassword, newPassword }),
  setAvatar: (imageUrl) => request('PUT', '/api/me/avatar', { imageUrl }),
  users: () => request('GET', '/api/users'),

  // Lists
  getLists: () => request('GET', '/api/lists'),
  createList: (name, shared, kind, category) => request('POST', '/api/lists', { name, shared, kind, category }),
  renameList: (id, name) => request('PATCH', `/api/lists/${id}`, { name }),
  updateList: (id, patch) => request('PATCH', `/api/lists/${id}`, patch),
  deleteList: (id) => request('DELETE', `/api/lists/${id}`),
  getList: (id) => request('GET', `/api/lists/${id}`),
  listVersion: (id) => request('GET', `/api/lists/${id}/version`),
  reorder: (listId, entryIds) => request('PUT', `/api/lists/${listId}/order`, { entryIds }),
  addMember: (listId, username) => request('POST', `/api/lists/${listId}/members`, { username }),
  removeMember: (listId, userId) => request('DELETE', `/api/lists/${listId}/members/${userId}`),

  // Entries
  addEntry: (listId, anilistId) => request('POST', `/api/lists/${listId}/entries`, { anilistId }),
  updateEntry: (id, patch) => request('PATCH', `/api/entries/${id}`, patch),
  deleteEntry: (id) => request('DELETE', `/api/entries/${id}`),
  markWatched: (id, userIds) => request('POST', `/api/entries/${id}/watched`, { userIds }),

  // Search
  search: (term, signal) => request('GET', `/api/search?q=${enc(term)}`, undefined, { signal }),
  animeSearch: (term, signal, type = "ANIME") =>
    request("GET", `/api/anime/search?q=${enc(term)}&type=${type}`, undefined, { signal }),

  // Anime & catalogue
  anime: (id) => request('GET', `/api/anime/${id}`),
  character: (id) => request('GET', `/api/characters/${id}`),
  animeCharacters: (id, page) => request('GET', `/api/anime/${id}/characters?page=${page}`),
  catalogueSummary: () => request('GET', '/api/catalogue/summary'),
  catalogue: (userId, type = "ANIME") => request("GET", `/api/users/${userId}/catalogue?type=${type}`),
  themes: (animeId) => request("GET", `/api/anime/${animeId}/themes`),
  setCatalogue: (animeId, patch) => request('PUT', `/api/catalogue/${animeId}`, patch),
  removeCatalogue: (animeId) => request('DELETE', `/api/catalogue/${animeId}`),

  // Feed, comments, reactions
  feed: (filter, before) => request('GET', `/api/feed?filter=${filter}${before ? `&before=${before}` : ''}`),
  comments: (thread) => request('GET', `/api/threads/${enc(thread)}/comments`),
  addComment: (thread, body) => request('POST', `/api/threads/${enc(thread)}/comments`, { body }),
  deleteComment: (id) => request('DELETE', `/api/comments/${id}`),
  react: (target, emoji) => request('POST', '/api/reactions', { target, emoji }),

  // Pictures
  anilistImages: (characterId) => request('GET', `/api/characters/${characterId}/images/anilist`),
  malImages: (characterId) => request('GET', `/api/characters/${characterId}/images/mal`),
  fanartImages: (characterId, tag) =>
    request('GET', `/api/characters/${characterId}/images/fanart${tag ? `?tag=${enc(tag)}` : ''}`),
  fanartTags: (term) => request('GET', `/api/fanart/tags?q=${enc(term)}`),

  // Discover
  discoverSeason: (season, year) =>
    request('GET', `/api/discover/season${season ? `?season=${season}&year=${year}` : ''}`),
  discoverUpcoming: () => request('GET', '/api/discover/upcoming'),
  forYou: (type = "ANIME") => request("GET", `/api/discover/foryou?type=${type}`),
  similar: (animeId) => request('GET', `/api/discover/similar/${animeId}`),

  // My type
  types: (userId) => request('GET', `/api/types/${userId}`),
  typeSuggest: (category) => request('GET', `/api/types/me/suggest?category=${category}`),

  // Compare
  compare: (userId, kind = 'character') => request('GET', `/api/compare?with=${userId}&kind=${kind}`),
  compareAnime: (userId, type = "ANIME") => request("GET", `/api/compare/anime?with=${userId}&type=${type}`),

  // Home, stats, games, push
  home: () => request("GET", "/api/home"),
  tonight: (opts) => request("POST", "/api/home/tonight", opts),
  stats: (userId) => request("GET", `/api/stats/${userId}`),
  wrapped: (userId, year) => request("GET", `/api/wrapped/${userId}?year=${year}`),
  wrappedTogether: (otherId, year) => request("GET", `/api/wrapped-together?with=${otherId}&year=${year}`),
  games: () => request("GET", "/api/games"),
  createGame: (type, opponentId) => request("POST", "/api/games", { type, opponentId }),
  game: (id) => request("GET", `/api/games/${id}`),
  answerGame: (id, answers) => request("POST", `/api/games/${id}/answers`, { answers }),
  pushKey: () => request("GET", "/api/push/key"),
  pushStatus: () => request("GET", "/api/push/status"),
  pushSubscribe: (subscription) => request("POST", "/api/push/subscribe", { subscription }),
  pushUnsubscribe: (endpoint) => request("POST", "/api/push/unsubscribe", { endpoint }),
  pushPrefs: (prefs) => request("PUT", "/api/push/prefs", prefs),
  pushTest: () => request("POST", "/api/push/test"),
};

// Search adapters: turn API results into the generic shape SearchBox shows.
export const characterSearch = (term, signal) =>
  api.search(term, signal).then((d) =>
    d.results.map((r) => ({
      id: r.anilistId,
      name: r.name,
      image: r.image,
      subtitle: r.series[0] ?? 'Unknown series',
      extra: r.series.length > 1 ? `+${r.series.length - 1} more` : null,
    })),
  );

const toMediaResult = (r) => ({
  id: r.id,
  type: r.type,
  name: r.name ?? r.title,
  image: r.cover,
  subtitle: animeMeta(r),
  myStatus: r.myStatus,
});

export const animeSearch = (term, signal) => api.animeSearch(term, signal, "ANIME").then((d) => d.results.map(toMediaResult));

export const mangaSearch = (term, signal) => api.animeSearch(term, signal, "MANGA").then((d) => d.results.map(toMediaResult));

// Anime and manga together (watchlists): alternating, anime first.
export const mediaSearch = async (term, signal) => {
  const [anime, manga] = await Promise.all([animeSearch(term, signal), mangaSearch(term, signal)]);
  const out = [];
  for (let i = 0; i < Math.max(anime.length, manga.length) && out.length < 10; i++) {
    if (anime[i]) out.push(anime[i]);
    if (manga[i]) out.push({ ...manga[i], extra: "📖 Manga" });
  }
  return out;
};
