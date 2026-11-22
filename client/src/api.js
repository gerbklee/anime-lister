async function request(method, url, body, { signal } = {}) {
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    method,
    signal,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  getLists: () => request('GET', '/api/lists'),
  createList: (name) => request('POST', '/api/lists', { name }),
  renameList: (id, name) => request('PATCH', `/api/lists/${id}`, { name }),
  deleteList: (id) => request('DELETE', `/api/lists/${id}`),
  getList: (id) => request('GET', `/api/lists/${id}`),
  reorder: (listId, entryIds) => request('PUT', `/api/lists/${listId}/order`, { entryIds }),
  addEntry: (listId, anilistId) => request('POST', `/api/lists/${listId}/entries`, { anilistId }),
  updateEntry: (id, patch) => request('PATCH', `/api/entries/${id}`, patch),
  deleteEntry: (id) => request('DELETE', `/api/entries/${id}`),
  search: (term, signal) => request('GET', `/api/search?q=${encodeURIComponent(term)}`, undefined, { signal }),
};
