// Eagle (eagle.cool) on this computer: its local API at localhost:41595.
// Requests are sent without a Content-Type header, as in Eagle's own examples,
// so the browser doesn't need a CORS preflight.
const EAGLE = 'http://localhost:41595';

async function eagle(path, body) {
  const res = await fetch(`${EAGLE}${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status !== 'success') throw new Error(data?.message || `Eagle answered ${res.status}`);
  return data.data;
}

export async function eagleInfo() {
  try {
    const info = await eagle('/api/application/info');
    return { running: true, version: info?.version ?? null };
  } catch {
    return { running: false, version: null };
  }
}

// ---- "Already in Eagle" -------------------------------------------------------------------------
// The library is read once (every picture's source link and the links in its
// note) and kept as a set of keys; search results are matched against it by
// their post links, the artist's original post and their Pixiv work.

// One key per link: "pixiv:123", "tweet:456", or host + path for anything else.
function linkKey(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^(www|mobile|m)\./, '');
    const path = u.pathname.replace(/\/+$/, '').replace(/^\/(en|ja)\//, '/');
    const pixiv = (host.endsWith('pixiv.net') && (path.match(/\/artworks\/(\d+)/)?.[1] ?? u.searchParams.get('illust_id'))) || (host.endsWith('pximg.net') && path.match(/\/(\d+)_p\d+/)?.[1]);
    if (pixiv) return `pixiv:${pixiv}`;
    const tweet = /^(twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com)$/.test(host) && path.match(/\/status(?:es)?\/(\d+)/)?.[1];
    if (tweet) return `tweet:${tweet}`;
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}
const linksIn = (text) => String(text ?? '').match(/https?:\/\/[^\s"'<>)]+/g) ?? [];

let index = null; // { keys: Set, count, at }
let loading = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function subscribeEagleIndex(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const eagleIndexInfo = () => (index ? { ready: true, count: index.count } : { ready: false, count: 0 });

// Reads the whole library (pages of 1000). `force` reads it again (e.g. after
// deleting pictures in Eagle); otherwise at most once a minute.
export function loadEagleIndex({ force = false } = {}) {
  if (loading) return loading;
  if (index && !force && Date.now() - index.at < 60_000) return Promise.resolve(index);
  loading = (async () => {
    const keys = new Set();
    const seen = new Set();
    const PAGE = 1000;
    const list = async (offset) => (await eagle(`/api/item/list?limit=${PAGE}&offset=${offset}&orderBy=-CREATEDATE`)) ?? [];
    const take = (items) => {
      for (const it of items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        if (it.isDeleted) continue;
        for (const link of [it.url, it.website, ...linksIn(it.annotation)]) {
          const k = link && linkKey(link);
          if (k) keys.add(k);
        }
      }
    };
    const first = await list(0);
    take(first);
    if (first.length >= PAGE) {
      // Is "offset" a page number or a count of pictures? Ask for offset 1 and see.
      const probe = await list(1);
      const byItem = probe[0]?.id === first[1]?.id;
      let offset = byItem ? PAGE : 1;
      let batch = byItem ? await list(offset) : probe;
      for (let n = 0; n < 500 && batch.length; n++) {
        const before = seen.size;
        take(batch);
        if (batch.length < PAGE || seen.size === before) break;
        offset += byItem ? PAGE : 1;
        batch = await list(offset);
      }
    }
    index = { keys, count: seen.size, at: Date.now() };
    emit();
    return index;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

// The links that identify a search result.
function itemLinks(item) {
  const links = [item.postUrl, item.sourceUrl, ...(item.sources ?? []).map((s) => s.postUrl)];
  const keys = links.map((l) => l && linkKey(l)).filter(Boolean);
  for (const k of item.keys ?? []) if (k.startsWith('px:')) keys.push(`pixiv:${k.slice(3)}`);
  return keys;
}
export const itemInEagle = (item) => !!index && itemLinks(item).some((k) => index.keys.has(k));

// After sending: count these as in Eagle right away.
export function markInEagle(items) {
  if (!index) index = { keys: new Set(), count: 0, at: 0 };
  for (const i of items) for (const k of itemLinks(i)) index.keys.add(k);
  index.count += items.length;
  emit();
}

// The folder tree as Eagle has it: [{ id, name, children }].
export const eagleFolderTree = () => eagle('/api/folder/list');

// All folders, flattened with their path ("Refs / Poses / Hands").
export async function eagleFolders() {
  const out = [];
  const walk = (list, prefix) => {
    for (const f of list ?? []) {
      const name = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ id: f.id, name });
      walk(f.children, name);
    }
  };
  walk(await eagleFolderTree(), '');
  return out;
}

export const eagleCreateFolder = (folderName, parent) => eagle('/api/folder/create', { folderName, ...(parent ? { parent } : {}) });

// One picture: { url, name, website, tags, annotation, star, modificationTime }.
// (Only the single-picture call takes a star rating and its own folder.)
export function eagleAddOne(item, folderId) {
  const body = { url: item.url, name: item.name, website: item.website, tags: item.tags, annotation: item.annotation };
  if (item.star) body.star = item.star;
  if (item.modificationTime) body.modificationTime = item.modificationTime;
  if (folderId) body.folderId = folderId;
  return eagle('/api/item/addFromURL', body);
}

// Finds the folder `name` inside `parentId` (or at the top), creating it when missing.
export function folderResolver(tree) {
  const cache = new Map();
  const find = (list, id) => {
    for (const f of list ?? []) {
      if (f.id === id) return f;
      const hit = find(f.children, id);
      if (hit) return hit;
    }
    return null;
  };
  return async (name, parentId) => {
    if (!name) return parentId || undefined;
    const key = `${parentId ?? ''}|${name.toLowerCase()}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        (async () => {
          const siblings = parentId ? (find(tree, parentId)?.children ?? []) : tree;
          const existing = siblings.find((f) => f.name.toLowerCase() === name.toLowerCase());
          return existing?.id ?? (await eagleCreateFolder(name, parentId)).id;
        })(),
      );
    }
    return cache.get(key);
  };
}
