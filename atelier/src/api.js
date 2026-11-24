// Atelier talks to the same server as Anime Hub (same login, same API).

async function request(method, url, body, { raw } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (raw) {
    opts.body = raw;
    opts.headers['Content-Type'] = raw.type || 'application/octet-stream';
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Uploads with progress (big .clip files take a while). Listeners get
// { name, loaded, total, phase: 'upload' | 'processing' | 'done' | 'error' }.
const uploadListeners = new Set();
export const subscribeUploads = (fn) => {
  uploadListeners.add(fn);
  return () => uploadListeners.delete(fn);
};
const emit = (s) => uploadListeners.forEach((fn) => fn(s));
function uploadFile(url, file) {
  return new Promise((resolve, reject) => {
    const name = file.name || 'drawing';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => emit({ name, loaded: e.loaded, total: e.lengthComputable ? e.total : file.size, phase: 'upload' });
    xhr.upload.onload = () => emit({ name, loaded: file.size, total: file.size, phase: 'processing', clip: /\.clip$/i.test(name) });
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        emit({ name, phase: 'done' });
        resolve(data);
      } else {
        const err = new Error(data?.error || (xhr.status === 413 ? 'That file is too big (the limit is 150 MB).' : `Upload failed (${xhr.status})`));
        emit({ name, phase: 'error', message: err.message });
        reject(err);
      }
    };
    xhr.onerror = () => {
      const err = new Error('The upload was interrupted (connection lost). Check your connection and try again.');
      emit({ name, phase: 'error', message: err.message });
      reject(err);
    };
    emit({ name, loaded: 0, total: file.size, phase: 'upload' });
    xhr.send(file);
  });
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();

export const api = {
  me: () => request('GET', '/api/auth/me'),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  logout: () => request('POST', '/api/auth/logout'),

  profile: () => request('GET', '/api/atelier/me'),
  saveProfile: (patch) => request('PUT', '/api/atelier/me', patch),
  path: () => request('GET', '/api/atelier/path'),
  lesson: (id) => request('GET', `/api/atelier/lessons/${encodeURIComponent(id)}`),
  lessonAction: (id, action, body) => request('POST', `/api/atelier/lessons/${encodeURIComponent(id)}/${action}`, body),
  today: () => request('GET', '/api/atelier/today'),
  rateReview: (skill, rating) => request('POST', `/api/atelier/reviews/${encodeURIComponent(skill)}`, { rating }),
  exerciseDone: (lessonId, exerciseId) => request('POST', '/api/atelier/exercises/done', { lessonId, exerciseId }),

  startBlock: (b) => request('POST', '/api/atelier/blocks', b),
  finishBlock: (id, status, minutes) => request('POST', `/api/atelier/blocks/${id}/finish`, { status, minutes }),
  logBlock: (b) => request('POST', '/api/atelier/blocks/log', b),

  world: () => request('GET', '/api/atelier/world'),
  stats: () => request('GET', '/api/atelier/stats'),
  review: () => request('GET', '/api/atelier/review'),
  checks: () => request('GET', '/api/atelier/checks'),
  brief: () => request('GET', '/api/atelier/brief'),
  characters: () => request('GET', '/api/atelier/characters'),
  csp: () => request('GET', '/api/atelier/csp'),
  lessonMedia: (id) => request('GET', `/api/atelier/lessons/${encodeURIComponent(id)}/media`),

  drawings: () => request('GET', '/api/atelier/drawings'),
  sharedDrawings: () => request('GET', '/api/atelier/drawings/shared'),
  drawing: (id) => request('GET', `/api/atelier/drawings/${id}`),
  upload: (file, info) => uploadFile(`/api/atelier/drawings?${qs(info)}`, file),
  uploadFor: (id, file) => uploadFile(`/api/atelier/drawings/${id}/file`, file),
  updateDrawing: (id, patch) => request('PUT', `/api/atelier/drawings/${id}`, patch),
  deleteDrawing: (id) => request('DELETE', `/api/atelier/drawings/${id}`),
  critique: (id, level) => request('POST', `/api/atelier/drawings/${id}/critique`, { level }),
  portfolio: () => request('GET', '/api/atelier/portfolio'),
  projects: () => request('GET', '/api/atelier/projects'),
  createProject: (title) => request('POST', '/api/atelier/projects', { title }),
  project: (id) => request('GET', `/api/atelier/projects/${id}`),
  updateProject: (id, patch) => request('PUT', `/api/atelier/projects/${id}`, patch),
  savePortfolio: (o) => request('POST', '/api/atelier/portfolio', o),
  react: (target, emoji) => request('POST', '/api/reactions', { target, emoji }),
};

export const psdUrl = (o) => `/api/atelier/psd?${qs(o)}`;

// References from Anime Hub's multi-site Art search (streamed); resolves with
// the first `limit` pictures.
export async function findReferences(tags, { limit = 12, minEdge = 1000, maxLevel = 0 } = {}) {
  const url = `/api/studio/search?${qs({ tags: tags.join(','), minEdge, sort: 'best', ai: 'hide', comics: 'hide', maxLevel })}`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) return [];
  const text = await res.text();
  const items = [];
  const seen = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.type !== 'source') continue;
    for (const i of msg.items) {
      if (seen.has(i.key)) continue;
      seen.add(i.key);
      items.push(i);
    }
  }
  return items.slice(0, limit);
}

// The site's own address of a reference (the server fetches it for .psd files and studies).
export function refSource(i) {
  if (!i) return null;
  const u = i.rawPreview ?? i.original ?? i.preview;
  const m = String(u ?? '').match(/^\/api\/studio\/img\?u=(.+)$/);
  return m ? decodeURIComponent(m[1]) : u;
}

// Small shared caches.
const cache = new Map();
export function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}
export const dropCache = (key) => cache.delete(key);

// Anime Hub's address from here (port 3001 -> 3000; Tailscale 8443 -> 443).
export function hubUrl() {
  const { protocol, hostname, port } = window.location;
  if (port === '3001') return `${protocol}//${hostname}:3000`;
  if (port === '8443') return `${protocol}//${hostname}`;
  if (port === '5174') return `${protocol}//${hostname}:5173`;
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}
