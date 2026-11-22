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

export const api = {
  // Auth
  me: () => request('GET', '/api/auth/me'),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  register: (username, password) => request('POST', '/api/auth/register', { username, password }),
  logout: () => request('POST', '/api/auth/logout'),
  changePassword: (currentPassword, newPassword) =>
    request('POST', '/api/auth/password', { currentPassword, newPassword }),
  users: () => request('GET', '/api/users'),

  // Lists
  getLists: () => request('GET', '/api/lists'),
  createList: (name, shared) => request('POST', '/api/lists', { name, shared }),
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

  // Search & compare
  search: (term, signal) => request('GET', `/api/search?q=${encodeURIComponent(term)}`, undefined, { signal }),
  compare: (userId) => request('GET', `/api/compare?with=${userId}`),
};
