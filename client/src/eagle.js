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
  walk(await eagle('/api/folder/list'), '');
  return out;
}

export const eagleCreateFolder = (folderName, parent) => eagle('/api/folder/create', { folderName, ...(parent ? { parent } : {}) });

// items: [{ url, name, website, tags, annotation }]. Eagle downloads each url itself.
export async function eagleAdd(items, folderId) {
  for (let i = 0; i < items.length; i += 50) {
    await eagle('/api/item/addFromURLs', { items: items.slice(i, i + 50), ...(folderId ? { folderId } : {}) });
  }
}
