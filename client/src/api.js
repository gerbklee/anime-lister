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
  createList: (name, shared, kind) => request('POST', '/api/lists', { name, shared, kind }),
  renameList: (id, name) => request('PATCH', `/api/lists/${id}`, { name }),
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
  animeSearch: (term, signal) => request('GET', `/api/anime/search?q=${enc(term)}`, undefined, { signal }),

  // Anime & catalogue
  anime: (id) => request('GET', `/api/anime/${id}`),
  catalogueSummary: () => request('GET', '/api/catalogue/summary'),
  catalogue: (userId) => request('GET', `/api/users/${userId}/catalogue`),
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
  forYou: () => request('GET', '/api/discover/foryou'),
  similar: (animeId) => request('GET', `/api/discover/similar/${animeId}`),

  // Compare
  compare: (userId, kind = 'character') => request('GET', `/api/compare?with=${userId}&kind=${kind}`),
  compareAnime: (userId) => request('GET', `/api/compare/anime?with=${userId}`),
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

export const animeSearch = (term, signal) =>
  api.animeSearch(term, signal).then((d) =>
    d.results.map((r) => ({ id: r.id, name: r.name ?? r.title, image: r.cover, subtitle: animeMeta(r), myStatus: r.myStatus })),
  );
