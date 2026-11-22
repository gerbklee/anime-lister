import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import FanartViewer from './FanartViewer.jsx';
import Modal from './Modal.jsx';

const SOURCE_NAMES = { danbooru: 'Danbooru', zerochan: 'Zerochan', wallhaven: 'Wallhaven', safebooru: 'Safebooru' };

// Thumbnails; saved ones get a heart badge.
export function FanartGrid({ items, onOpen, selected, emptyText = 'No pictures here yet.' }) {
  if (!items.length) return <p className="muted small">{emptyText}</p>;
  return (
    <div className="fanart-grid">
      {items.map((it, i) => (
        <button
          key={`${it.source}:${it.id}:${it.savedId ?? ''}`}
          type="button"
          className={`fanart-cell ${selected && selected === (it.remoteUrl ?? it.full) ? 'selected' : ''}`}
          onClick={() => onOpen(i)}
        >
          <img src={it.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
          {it.savedId && <span className="fanart-badge" aria-label="Saved">💖</span>}
          {!it.savedId && it.sources?.length > 1 && (
            <span className="fanart-badge multi" title={it.popularity}>
              ×{it.sources.length}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function HiddenManager({ onClose, onChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api
      .hiddenFanart()
      .then(setItems)
      .catch((err) => setError(err.message));
  }, []);
  const unhide = async (h) => {
    await api.unhideFanart(h.source, h.id);
    setItems((list) => list.filter((x) => !(x.source === h.source && x.id === h.id)));
    onChanged();
  };
  return (
    <Modal title="🙈 Hidden pictures" onClose={onClose}>
      <p className="muted small">Hidden for both of you, everywhere. Tap a picture to show it again.</p>
      {error && <div className="banner error">{error}</div>}
      {!items ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">Nothing hidden.</p>
      ) : (
        <div className="fanart-grid">
          {items.map((h) => (
            <button key={`${h.source}:${h.id}`} type="button" className="fanart-cell hidden-cell" onClick={() => unhide(h)} title={`Show again${h.subjectName ? ` (${h.subjectName})` : ''}`}>
              {h.thumb ? <img src={h.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="muted tiny">{h.subjectName}</span>}
              <span className="fanart-badge">↺</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Fan art of a character or ship: our saved picks, suggestions sorted by fan
// score, and optionally official pictures.
//   official: { load: () => Promise<{ images: string[] }> } (characters only)
//   actions:  [{ icon, label, onSelect(item, url) }] in the viewer's ⋯ menu
//   onSelect/selected: picker mode (tap selects instead of opening the viewer)
export default function FanartBrowser({ subject, subjectName, official, actions = [], onSelect, selected, allowSolo = false, title = null }) {
  const [tab, setTab] = useState(null);
  const [sort, setSort] = useState('best');
  const [solo, setSolo] = useState(false);
  const [saved, setSaved] = useState(null);
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [officialImages, setOfficialImages] = useState(null);
  const [viewer, setViewer] = useState(null); // { list: 'saved'|'items'|'official', index }
  const [managing, setManaging] = useState(false);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      const d = await api.fanart(subject, { sort, solo, page: 1 });
      setSaved(d.saved);
      setItems(d.items);
      setHasMore(d.hasMore);
      setPage(1);
      setMeta({ sources: d.sources, notice: d.notice, hiddenCount: d.hiddenCount, name: d.name });
      setTab((t) => t ?? (d.saved.length ? 'picks' : 'fanart'));
    } catch (err) {
      setError(err.message);
      setTab((t) => t ?? 'fanart');
    }
  }, [subject, sort, solo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'official' || officialImages || !official) return;
    official
      .load()
      .then((d) => setOfficialImages(d.images.map((u, i) => ({ source: 'official', id: String(i), thumb: u, full: u, remoteUrl: u }))))
      .catch(() => setOfficialImages([]));
  }, [tab, official, officialImages]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const d = await api.fanart(subject, { sort, solo, page: page + 1 });
      setItems((list) => [...list, ...d.items.filter((n) => !list.some((o) => o.source === n.source && o.id === n.id))]);
      setHasMore(d.hasMore);
      setPage((p) => p + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const name = subjectName ?? meta.name ?? '';

  const save = async (item) => {
    const s = await api.saveFanart(subject, item);
    setSaved((list) => [s, ...(list ?? []).filter((x) => x.savedId !== s.savedId)]);
    setItems((list) => list.filter((x) => !(x.source === item.source && x.id === item.id)));
    // Keep the viewer on the same picture, now in the saved list.
    setViewer((v) => (v && v.list === 'items' ? { list: 'saved', index: 0 } : v));
  };

  const unsave = async (item) => {
    await api.unsaveFanart(item.savedId);
    setSaved((list) => list.filter((x) => x.savedId !== item.savedId));
    setViewer((v) => {
      if (!v) return v;
      const remaining = (saved?.length ?? 1) - 1;
      return remaining > 0 ? { ...v, index: Math.min(v.index, remaining - 1) } : null;
    });
  };

  const hide = async (item) => {
    if (!window.confirm(`Hide this picture for both of you?${item.savedId ? ' It will also be removed from your gallery.' : ''}`)) return;
    await api.hideFanart(item, name);
    const remove = (list) => (list ?? []).filter((x) => !(x.source === item.source && x.id === item.id));
    setSaved(remove);
    setItems(remove);
    setMeta((m) => ({ ...m, hiddenCount: (m.hiddenCount ?? 0) + 1 }));
    setViewer((v) => (v ? { ...v, index: Math.max(0, v.index - (v.index > 0 ? 0 : 0)) } : v));
  };

  const lists = { saved: saved ?? [], items: items ?? [], official: officialImages ?? [] };
  const open = (list) => (index) => {
    const item = lists[list][index];
    if (onSelect) onSelect(item.remoteUrl ?? item.full, item);
    else setViewer({ list, index });
  };

  const tabs = [
    ['picks', `💖 Our picks${saved?.length ? ` ${saved.length}` : ''}`],
    ['fanart', '🎨 Fan art'],
    official && ['official', '📷 Official'],
  ].filter(Boolean);

  const viewerList = viewer ? lists[viewer.list] : [];
  if (viewer && !viewerList[viewer.index] && viewerList.length) setViewer({ ...viewer, index: viewerList.length - 1 });

  return (
    <div className="fanart-browser">
      {title && <h3>{title}</h3>}
      <div className="tabs compact" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'picks' &&
        (saved === null ? (
          <p className="muted small">Loading…</p>
        ) : (
          <FanartGrid
            items={saved}
            onOpen={open('saved')}
            selected={selected}
            emptyText="Nothing saved yet. Open a picture in 🎨 Fan art and tap ♡ Save (or double-tap it)."
          />
        ))}

      {tab === 'fanart' && (
        <>
          <div className="fanart-toolbar">
            <div className="segmented small" role="radiogroup" aria-label="Sort">
              <button type="button" role="radio" aria-checked={sort === 'best'} className={sort === 'best' ? 'active' : ''} onClick={() => setSort('best')}>
                ⭐ Best
              </button>
              <button type="button" role="radio" aria-checked={sort === 'new'} className={sort === 'new' ? 'active' : ''} onClick={() => setSort('new')}>
                🆕 Newest
              </button>
            </div>
            {allowSolo && (
              <label className="check small">
                <input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} /> Solo only
              </label>
            )}
            <div className="spacer" />
            {meta.hiddenCount > 0 && !onSelect && (
              <button type="button" className="link-btn small" onClick={() => setManaging(true)}>
                🙈 {meta.hiddenCount}
              </button>
            )}
          </div>
          {meta.notice && <p className="muted tiny">{meta.notice}</p>}
          {error && <div className="banner error">{error}</div>}
          {items === null && !error ? (
            <p className="muted small">Finding the best fan art…</p>
          ) : (
            items && (
              <>
                <FanartGrid items={items} onOpen={open('items')} selected={selected} emptyText="No fan art found." />
                {hasMore && (
                  <button type="button" className="btn ghost wide load-more" onClick={more} disabled={loadingMore}>
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
                <p className="muted tiny fanart-credit">
                  Work-safe fan art from{' '}
                  {Object.entries(meta.sources ?? {})
                    .filter(([, n]) => n > 0)
                    .map(([s]) => SOURCE_NAMES[s] ?? s)
                    .join(', ') || 'nowhere yet'}
                  , {sort === 'best' ? 'ranked by popularity across all of them' : 'newest first'}. Pictures on several sites (×2) rank higher.
                </p>
              </>
            )
          )}
        </>
      )}

      {tab === 'official' &&
        (officialImages === null ? <p className="muted small">Loading…</p> : <FanartGrid items={officialImages} onOpen={open('official')} selected={selected} />)}

      {viewer && viewerList.length > 0 && (
        <FanartViewer
          items={viewerList}
          index={Math.min(viewer.index, viewerList.length - 1)}
          onIndex={(index) => setViewer((v) => ({ ...v, index }))}
          onClose={() => setViewer(null)}
          onSave={viewer.list === 'official' ? null : save}
          onUnsave={unsave}
          onHide={viewer.list === 'official' ? null : hide}
          actions={actions.map((a) => ({ ...a, onSelect: (item) => a.onSelect(item, item.remoteUrl ?? item.full) }))}
        />
      )}
      {managing && <HiddenManager onClose={() => setManaging(false)} onChanged={load} />}
    </div>
  );
}
