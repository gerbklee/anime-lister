import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { eagleAdd, eagleFolders, eagleInfo } from '../eagle.js';

// Studio: reference search for drawing. Tags use Danbooru's names; the server
// asks every source it can and merges the results (see server/src/studio.js).

const KIND_ICONS = { character: '👤', series: '🎬', artist: '🖌️', tag: '🏷️' };
const CATEGORY_KIND = { 0: 'tag', 1: 'artist', 3: 'series', 4: 'character', 5: 'tag' };
const SOURCE_ICONS = { danbooru: 'D', yandere: 'Y', konachan: 'K', gelbooru: 'G', zerochan: 'Z', wallhaven: 'W', pixiv: 'P' };
const SOURCE_NAMES = { danbooru: 'Danbooru', yandere: 'Yande.re', konachan: 'Konachan', gelbooru: 'Gelbooru', zerochan: 'Zerochan', wallhaven: 'Wallhaven', pixiv: 'Pixiv' };

const PRESETS = [
  ['Framing', ['full_body', 'upper_body', 'cowboy_shot', 'portrait', 'close-up', 'hand_focus']],
  ['Angle', ['from_above', 'from_below', 'from_side', 'from_behind', 'dutch_angle', 'foreshortening', 'pov', 'profile', 'perspective']],
  ['Pose', ['dynamic_pose', 'standing', 'sitting', 'kneeling', 'squatting', 'lying', 'walking', 'running', 'jumping', 'fighting_stance', 'contrapposto', 'stretching', 'leaning_forward', 'looking_back', 'arms_up', 'hands_up', 'hand_on_own_hip', 'crossed_arms']],
  ['Lighting', ['backlighting', 'sunlight', 'dappled_sunlight', 'light_rays', 'lens_flare', 'glowing', 'silhouette', 'chiaroscuro', 'high_contrast', 'sunset', 'night']],
  ['Background', ['simple_background', 'white_background', 'grey_background', 'gradient_background', 'scenery', 'cityscape', 'indoors', 'outdoors']],
  ['Clothing & motion', ['kimono', 'armor', 'school_uniform', 'dress', 'coat', 'cape', 'frills', 'wind', 'floating_hair', 'wet', 'motion_blur', 'holding_sword']],
  ['Expression', ['smile', 'open_mouth', 'expressionless', 'clenched_teeth']],
  ['Medium & sheets', ['official_art', 'concept_art', 'sketch', 'lineart', 'monochrome', 'traditional_media', 'watercolor_(medium)', 'reference_sheet', 'turnaround', 'expression_chart', 'multiple_views', 'variations', 'muscular', 'anatomy', 'depth_of_field']],
];

const DEFAULT_QUERY = { chips: [], sort: 'best', minEdge: 2000, orient: '', minScore: 0, solo: false, ai: 'hide', sketch: 'include', comics: 'hide', sources: null };
const STORE = 'studio-v1';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return { query: { ...DEFAULT_QUERY, ...(s.query ?? {}) }, size: s.size ?? 180, folderId: s.folderId ?? '', allTags: s.allTags ?? true };
  } catch {
    return { query: DEFAULT_QUERY, size: 180, folderId: '', allTags: true };
  }
}
function store(patch) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...load(), ...patch }));
  } catch {
    // private window: settings just aren't remembered
  }
}

const label = (tag) => tag.replace(/_/g, ' ');
const res = (i) => (i.width && i.height ? `${i.width}×${i.height}` : '');

// ---- Tag input ---------------------------------------------------------------------------------

function TagInput({ chips, onChange }) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      api
        .artAutocomplete(term, controller.signal)
        .then((d) => {
          setSuggestions(d.suggestions.filter((s) => s.kind !== 'ship'));
          setActive(0);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [text]);

  const add = (chip) => {
    if (!chips.some((c) => c.tag === chip.tag)) onChange([...chips, chip].slice(0, 8));
    setText('');
    setSuggestions([]);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, suggestions.length - 1));
    if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[active]) add(suggestions[active]);
      else if (text.trim()) add({ tag: text.trim().toLowerCase().replace(/\s+/g, '_'), label: text.trim(), kind: 'tag' });
    }
    if (e.key === 'Backspace' && !text && chips.length) onChange(chips.slice(0, -1));
  };

  return (
    <div className="chip-input studio-search">
      <div className="chip-input-box">
        <span aria-hidden="true">🔍</span>
        {chips.map((c) => (
          <span key={c.tag} className={`chip kind-${c.kind}`}>
            {KIND_ICONS[c.kind] ?? '🏷️'} {c.label}
            <button type="button" className="chip-remove" onClick={() => onChange(chips.filter((x) => x.tag !== c.tag))} aria-label={`Remove ${c.label}`}>
              ✕
            </button>
          </span>
        ))}
        <input
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={chips.length ? 'Add tags…' : 'Character, series, artist, or tags like "from below", "kimono"…'}
          aria-label="Search tags"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="suggestions chip-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.tag} role="option" aria-selected={i === active} className={`suggestion ${i === active ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
              <span className="chip-kind">{KIND_ICONS[s.kind]}</span>
              <span className="suggestion-text">
                <span className="suggestion-name">{s.label}</span>
                <span className="muted tiny">
                  {s.kind}
                  {s.count != null ? ` · ${s.count.toLocaleString()} pictures` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Eagle -------------------------------------------------------------------------------------

function useEagle() {
  const [state, setState] = useState({ running: null, folders: [] });
  const check = useCallback(async () => {
    const info = await eagleInfo();
    const folders = info.running ? await eagleFolders().catch(() => []) : [];
    setState({ ...info, folders });
  }, []);
  useEffect(() => {
    check();
  }, [check]);
  return { ...state, check };
}

// Builds Eagle items: originals via signed NAS links, tags, source and credits.
async function toEagleItems(items, { queryChips, allTags }) {
  const ready = [];
  for (const i of items) {
    let original = i.original;
    if (!original && i.resolve) {
      const scope = queryChips.find((c) => c.kind === 'character')?.tag;
      original = (await api.studioResolve(i.source, i.id, scope).catch(() => null))?.original ?? null;
    }
    if (original) ready.push({ i, original });
  }
  const { urls } = await api.studioSign(ready.map((r) => r.original));
  const chars = queryChips.filter((c) => c.kind === 'character').map((c) => c.tag);
  const series = queryChips.filter((c) => c.kind === 'series').map((c) => c.tag);
  return ready
    .map(({ i }, n) => {
      if (!urls[n]) return null;
      const characters = i.characters.length ? i.characters : chars;
      const seriesTags = i.series.length ? i.series : series;
      const tags = [
        ...characters.map(label),
        ...seriesTags.map(label),
        ...i.artists.map((a) => `artist: ${label(a)}`),
        ...(allTags ? i.tags.map(label) : []),
        ...i.sources.map((s) => `source: ${SOURCE_NAMES[s.source] ?? s.source}`),
      ];
      const name = [i.artist && label(i.artist), characters[0] && label(characters[0])].filter(Boolean).join(' – ') || `${SOURCE_NAMES[i.source]} ${i.id}`;
      const annotation = [
        `${res(i)} · ${i.sources.map((s) => SOURCE_NAMES[s.source] ?? s.source).join(', ')}`,
        ...i.sources.map((s) => s.postUrl).filter(Boolean),
        i.sourceUrl && `Original: ${i.sourceUrl}`,
      ]
        .filter(Boolean)
        .join('\n');
      return { url: `${window.location.origin}${urls[n]}`, name, website: i.sourceUrl || i.postUrl, tags: [...new Set(tags)].slice(0, 80), annotation };
    })
    .filter(Boolean);
}

// ---- Viewer ------------------------------------------------------------------------------------

function StudioViewer({ items, index, onIndex, onClose, selected, onToggle, onSend, onAddTag, queryChips }) {
  const item = items[index];
  const [zoom, setZoom] = useState(false);
  const [original, setOriginal] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const stage = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    setZoom(false);
    setOriginal(null);
    setLoaded(false);
  }, [item?.key]);

  const go = useCallback((d) => {
    const n = index + d;
    if (n >= 0 && n < items.length) onIndex(n);
  }, [index, items.length, onIndex]);

  const openOriginal = useCallback(async () => {
    if (!item) return;
    if (zoom) {
      setZoom(false);
      return;
    }
    let url = item.originalView;
    if (!url && item.resolve) {
      const scope = queryChips.find((c) => c.kind === 'character')?.tag;
      url = (await api.studioResolve(item.source, item.id, scope).catch(() => null))?.originalView ?? null;
    }
    setOriginal(url ?? item.preview);
    setZoom(true);
  }, [item, zoom, queryChips]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'z' || e.key === 'Z') openOriginal();
      else if (e.key === ' ' || e.key === 's') {
        e.preventDefault();
        onToggle(item);
      } else if (e.key === 'e' || e.key === 'E') onSend([item]);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose, openOriginal, onToggle, onSend, item]);

  if (!item) return null;
  const isSel = selected.has(item.key);

  const onMouseDown = (e) => {
    if (!zoom || !stage.current) return;
    drag.current = { x: e.clientX, y: e.clientY, left: stage.current.scrollLeft, top: stage.current.scrollTop, moved: false };
  };
  const onMouseMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    stage.current.scrollLeft = d.left - (e.clientX - d.x);
    stage.current.scrollTop = d.top - (e.clientY - d.y);
  };
  const onMouseUp = () => {
    const moved = drag.current?.moved;
    drag.current = null;
    return moved;
  };

  return createPortal(
    <div className="studio-viewer" role="dialog" aria-modal="true" aria-label="Reference viewer">
      <div className="studio-viewer-top">
        <span>
          {index + 1} / {items.length}
        </span>
        <span className="muted small hide-mobile">← → browse · Z original 1:1 · Space select · E send to Eagle · Esc close</span>
        <button type="button" className="viewer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="studio-viewer-body">
        <div
          ref={stage}
          className={`studio-stage ${zoom ? 'zoomed' : ''}`}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={(e) => {
            if (!onMouseUp() && e.button === 0) openOriginal();
          }}
          onMouseLeave={() => (drag.current = null)}
        >
          {!loaded && <img className="studio-img placeholder" src={item.thumb} alt="" referrerPolicy="no-referrer" />}
          <img
            key={zoom ? original : item.preview}
            className={`studio-img ${loaded ? '' : 'loading'}`}
            src={zoom ? original : item.preview}
            alt=""
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={(e) => {
              if (!e.currentTarget.dataset.fallback) {
                e.currentTarget.dataset.fallback = '1';
                e.currentTarget.src = item.thumb;
              }
            }}
          />
          {index > 0 && (
            <button type="button" className="viewer-nav prev" onMouseUp={(e) => e.stopPropagation()} onClick={() => go(-1)} aria-label="Previous">
              ‹
            </button>
          )}
          {index < items.length - 1 && (
            <button type="button" className="viewer-nav next" onMouseUp={(e) => e.stopPropagation()} onClick={() => go(1)} aria-label="Next">
              ›
            </button>
          )}
        </div>
        <aside className="studio-info">
          <div className="studio-info-actions">
            <button type="button" className="btn primary small-btn" onClick={() => onSend([item])}>
              🦅 Send to Eagle
            </button>
            <button type="button" className={`btn small-btn ${isSel ? 'saved' : 'ghost'}`} onClick={() => onToggle(item)}>
              {isSel ? '☑ Selected' : '☐ Select'}
            </button>
            <button type="button" className="btn ghost small-btn" onClick={openOriginal}>
              {zoom ? 'Fit' : '1:1 original'}
            </button>
          </div>
          <p className="small">
            <b>{res(item)}</b>
            {item.score != null && <> · ★ {item.score}</>}
            {item.pages > 1 && <> · {item.pages} pages</>}
            {item.level > 0 && <> · {item.level > 1 ? '🔞' : '🌶️'}</>}
          </p>
          {item.artists.length > 0 && (
            <p className="small">
              🖌️{' '}
              {item.artists.map((a) => (
                <button key={a} type="button" className="link-btn" onClick={() => onAddTag({ tag: a, label: label(a), kind: 'artist' })} title="Search this artist">
                  {label(a)}
                </button>
              ))}
            </p>
          )}
          <p className="small studio-links">
            {item.sources.map((s) => (
              <a key={`${s.source}:${s.id}`} href={s.postUrl} target="_blank" rel="noreferrer">
                {SOURCE_NAMES[s.source] ?? s.source} ↗
              </a>
            ))}
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                Artist's post ↗
              </a>
            )}
          </p>
          {[...item.characters, ...item.series].length > 0 && (
            <div className="studio-tags">
              {item.characters.map((t) => (
                <button key={t} type="button" className="chip kind-character" onClick={() => onAddTag({ tag: t, label: label(t), kind: 'character' })}>
                  👤 {label(t)}
                </button>
              ))}
              {item.series.map((t) => (
                <button key={t} type="button" className="chip kind-series" onClick={() => onAddTag({ tag: t, label: label(t), kind: 'series' })}>
                  🎬 {label(t)}
                </button>
              ))}
            </div>
          )}
          {item.tags.length > 0 && (
            <div className="studio-tags">
              {item.tags.map((t) => (
                <button key={t} type="button" className="chip" onClick={() => onAddTag({ tag: t, label: label(t), kind: 'tag' })} title="Add to search">
                  {label(t)}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>,
    document.body,
  );
}

// ---- Page --------------------------------------------------------------------------------------

export default function StudioPage() {
  const initial = useMemo(load, []);
  const [query, setQuery] = useState(initial.query);
  const [size, setSize] = useState(initial.size);
  const [folderId, setFolderId] = useState(initial.folderId);
  const [allTags, setAllTags] = useState(initial.allTags);
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [selected, setSelected] = useState(new Map());
  const [lastClicked, setLastClicked] = useState(null);
  const [showPresets, setShowPresets] = useState(false);
  const [searches, setSearches] = useState([]);
  const [toast, setToast] = useState(null);
  const [sending, setSending] = useState(false);
  const seen = useRef(new Set());
  const sentinel = useRef(null);
  const eagle = useEagle();

  useEffect(() => {
    api.studioStatus().then(setStatus).catch((e) => setError(e.message));
    api.studioSearches().then(setSearches).catch(() => {});
  }, []);

  const update = (patch) => {
    const next = { ...query, ...patch };
    setQuery(next);
    store({ query: next });
  };

  // Only what the server sees; a chip's icon changing doesn't start a new search.
  const searchKey = JSON.stringify({
    tags: query.chips.map((c) => c.tag).join(','),
    sort: query.sort,
    minEdge: query.minEdge,
    orient: query.orient,
    minScore: query.minScore,
    solo: query.solo ? '1' : '',
    ai: query.ai,
    sketch: query.sketch,
    comics: query.comics,
    sources: (query.sources ?? []).join(','),
  });
  const params = useCallback((p) => ({ ...JSON.parse(searchKey), page: p }), [searchKey]);

  // New search whenever the query changes.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);
    setPage(1);
    seen.current = new Set();
    api
      .studioSearch(params(1), controller.signal)
      .then((d) => {
        const fresh = d.items.filter((i) => !i.keys.some((k) => seen.current.has(k)));
        fresh.forEach((i) => i.keys.forEach((k) => seen.current.add(k)));
        setItems(fresh);
        setSources(d.sources);
        setHasMore(d.hasMore);
        // Danbooru knows each tag's kind: fix chips typed by hand.
        const kinds = new Map(d.tags.map((t) => [t.tag, CATEGORY_KIND[t.category] ?? 'tag']));
        if (query.chips.some((c) => kinds.has(c.tag) && kinds.get(c.tag) !== c.kind)) {
          update({ chips: query.chips.map((c) => (kinds.has(c.tag) ? { ...c, kind: kinds.get(c.tag) } : c)) });
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = page + 1;
      const d = await api.studioSearch(params(next));
      const fresh = d.items.filter((i) => !i.keys.some((k) => seen.current.has(k)));
      fresh.forEach((i) => i.keys.forEach((k) => seen.current.add(k)));
      setItems((list) => [...list, ...fresh]);
      setSources(d.sources);
      setHasMore(d.hasMore);
      setPage(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, params]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '1200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const toggle = useCallback((item) => {
    setSelected((m) => {
      const n = new Map(m);
      if (n.has(item.key)) n.delete(item.key);
      else n.set(item.key, item);
      return n;
    });
  }, []);

  const onTileClick = (e, item, index) => {
    if (e.shiftKey && lastClicked != null) {
      const [a, b] = [Math.min(lastClicked, index), Math.max(lastClicked, index)];
      setSelected((m) => {
        const n = new Map(m);
        items.slice(a, b + 1).forEach((i) => n.set(i.key, i));
        return n;
      });
    } else if (e.ctrlKey || e.metaKey || selected.size > 0) toggle(item);
    else setOpen(index);
    setLastClicked(index);
  };

  const send = useCallback(
    async (list) => {
      if (!list.length || sending) return;
      setSending(true);
      setToast({ text: `Sending ${list.length} to Eagle…` });
      try {
        const info = await eagleInfo();
        if (!info.running) throw new Error('Eagle is not running on this computer. Open Eagle and try again.');
        const eagleItems = await toEagleItems(list, { queryChips: query.chips, allTags });
        await eagleAdd(eagleItems, folderId || undefined);
        const skipped = list.length - eagleItems.length;
        setToast({ text: `🦅 ${eagleItems.length} sent to Eagle${skipped ? ` (${skipped} unavailable)` : ''}`, ok: true });
        if (list.length > 1) setSelected(new Map());
      } catch (e) {
        setToast({ text: e.message, error: true });
      } finally {
        setSending(false);
        setTimeout(() => setToast(null), 5000);
      }
    },
    [sending, query.chips, allTags, folderId],
  );

  const addTag = useCallback(
    (chip) => {
      setOpen(null);
      if (!query.chips.some((c) => c.tag === chip.tag)) update({ chips: [...query.chips, chip].slice(0, 8) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query],
  );

  const togglePreset = (tag) => {
    if (query.chips.some((c) => c.tag === tag)) update({ chips: query.chips.filter((c) => c.tag !== tag) });
    else update({ chips: [...query.chips, { tag, label: label(tag), kind: 'tag' }].slice(0, 8) });
  };

  const saveSearch = async () => {
    const name = window.prompt('Name this search', query.chips.map((c) => c.label).join(' + ') || 'My search');
    if (!name) return;
    const s = await api.saveStudioSearch(name, query).catch((e) => setError(e.message));
    if (s) setSearches((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const available = (status?.sources ?? []).filter((s) => s.available);
  const enabled = (key) => !query.sources || query.sources.includes(key);
  const toggleSource = (key) => {
    const all = available.map((s) => s.key);
    const current = query.sources ?? all;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    update({ sources: next.length === all.length ? null : next });
  };
  const sourceState = (key) => sources.find((s) => s.key === key);

  return (
    <div className="studio" style={{ '--studio-size': `${size}px` }}>
      <div className="studio-head">
        <h2>🖌️ Studio</h2>
        <div className="studio-eagle">
          {eagle.running == null ? (
            <span className="muted small">Looking for Eagle…</span>
          ) : eagle.running ? (
            <>
              <span className="small eagle-on" title={eagle.version ? `Eagle ${eagle.version}` : undefined}>
                ● Eagle
              </span>
              <select
                value={folderId}
                onChange={(e) => {
                  setFolderId(e.target.value);
                  store({ folderId: e.target.value });
                }}
                aria-label="Eagle folder"
              >
                <option value="">No folder (inbox)</option>
                {eagle.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <label className="switch-row small" title="Send all of a picture's tags, not just characters, series and artist">
                <input
                  type="checkbox"
                  checked={allTags}
                  onChange={(e) => {
                    setAllTags(e.target.checked);
                    store({ allTags: e.target.checked });
                  }}
                />
                <span>all tags</span>
              </label>
            </>
          ) : (
            <button type="button" className="btn ghost small-btn" onClick={eagle.check} title="Open Eagle on this computer, then check again">
              ○ Eagle not found · retry
            </button>
          )}
        </div>
      </div>

      <TagInput chips={query.chips} onChange={(chips) => update({ chips })} />

      <div className="studio-bar">
        <div className="segmented small" role="radiogroup" aria-label="Sort">
          {[
            ['best', 'Best'],
            ['new', 'Newest'],
          ].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={query.sort === v} className={query.sort === v ? 'active' : ''} onClick={() => update({ sort: v })}>
              {l}
            </button>
          ))}
        </div>
        <select value={query.minEdge} onChange={(e) => update({ minEdge: Number(e.target.value) })} aria-label="Minimum size">
          {[0, 1000, 1500, 2000, 3000, 4000, 6000].map((v) => (
            <option key={v} value={v}>
              {v ? `≥ ${v}px` : 'Any size'}
            </option>
          ))}
        </select>
        <select value={query.orient} onChange={(e) => update({ orient: e.target.value })} aria-label="Shape">
          <option value="">Any shape</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
          <option value="square">Square</option>
        </select>
        <select value={query.minScore} onChange={(e) => update({ minScore: Number(e.target.value) })} aria-label="Minimum score">
          {[0, 10, 25, 50, 100, 250].map((v) => (
            <option key={v} value={v}>
              {v ? `★ ≥ ${v}` : 'Any score'}
            </option>
          ))}
        </select>
        <select value={query.sketch} onChange={(e) => update({ sketch: e.target.value })} aria-label="Sketches and lineart">
          <option value="include">Sketches: include</option>
          <option value="exclude">Sketches: hide</option>
          <option value="only">Sketches only</option>
        </select>
        <label className="switch-row small">
          <input type="checkbox" checked={query.solo} onChange={(e) => update({ solo: e.target.checked })} />
          <span>Solo</span>
        </label>
        <label className="switch-row small">
          <input type="checkbox" checked={query.ai === 'hide'} onChange={(e) => update({ ai: e.target.checked ? 'hide' : 'show' })} />
          <span>Hide AI</span>
        </label>
        <label className="switch-row small">
          <input type="checkbox" checked={query.comics === 'hide'} onChange={(e) => update({ comics: e.target.checked ? 'hide' : 'show' })} />
          <span>Hide comics</span>
        </label>
        <button type="button" className={`btn ghost small-btn ${showPresets ? 'active' : ''}`} onClick={() => setShowPresets((s) => !s)}>
          🎯 Presets
        </button>
        <label className="studio-size small" title="Thumbnail size">
          🔍
          <input
            type="range"
            min="110"
            max="360"
            step="10"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              store({ size: Number(e.target.value) });
            }}
            aria-label="Thumbnail size"
          />
        </label>
      </div>

      {showPresets && (
        <div className="studio-presets card">
          {PRESETS.map(([group, tags]) => (
            <div key={group} className="studio-preset-group">
              <span className="muted small">{group}</span>
              <div className="studio-tags">
                {tags.map((t) => (
                  <button key={t} type="button" className={`chip ${query.chips.some((c) => c.tag === t) ? 'active' : ''}`} onClick={() => togglePreset(t)}>
                    {label(t)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="muted tiny">Pose, angle and other tags are searched on Danbooru, Yande.re, Konachan and Gelbooru; Zerochan, Wallhaven and Pixiv only search characters and series.</p>
        </div>
      )}

      <div className="studio-sources">
        {available.map((s) => {
          const st = sourceState(s.key);
          const on = enabled(s.key);
          return (
            <button
              key={s.key}
              type="button"
              className={`studio-source ${on ? 'on' : ''} ${st?.state ?? ''}`}
              onClick={() => toggleSource(s.key)}
              title={st?.note ?? (on ? 'Click to leave out' : 'Click to include')}
            >
              <span className="studio-source-icon">{SOURCE_ICONS[s.key]}</span> {s.label}
              {on && st?.state === 'ok' && <span className="muted tiny"> {st.count}</span>}
              {on && st?.state === 'skipped' && <span className="muted tiny"> –</span>}
              {on && st?.state === 'error' && <span className="tiny"> ⚠</span>}
            </button>
          );
        })}
        {(status?.sources ?? [])
          .filter((s) => !s.available)
          .map((s) => (
            <span key={s.key} className="studio-source off muted" title={s.note}>
              {s.label} (setup)
            </span>
          ))}
        <span className="spacer" />
        <select
          value=""
          onChange={(e) => {
            const s = searches.find((x) => String(x.id) === e.target.value);
            if (s) update({ ...DEFAULT_QUERY, ...s.query });
          }}
          aria-label="Saved searches"
        >
          <option value="">📁 Saved searches{searches.length ? ` (${searches.length})` : ''}</option>
          {searches.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn ghost small-btn" onClick={saveSearch}>
          💾 Save
        </button>
        {searches.length > 0 && (
          <select
            value=""
            onChange={async (e) => {
              const id = Number(e.target.value);
              if (!id || !window.confirm('Delete this saved search?')) return;
              await api.deleteStudioSearch(id).catch(() => {});
              setSearches((list) => list.filter((s) => s.id !== id));
            }}
            aria-label="Delete a saved search"
          >
            <option value="">🗑</option>
            {searches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {sources.some((s) => s.state === 'error' || (s.state === 'skipped' && enabled(s.key))) && (
        <p className="muted tiny studio-notes">
          {sources
            .filter((s) => s.state === 'error' || s.state === 'skipped')
            .map((s) => `${s.label}: ${s.note}`)
            .join(' · ')}
        </p>
      )}
      {error && <p className="error-text small">{error}</p>}

      <div className="studio-grid">
        {items.map((i, n) => (
          <button
            key={i.key}
            type="button"
            className={`studio-tile ${selected.has(i.key) ? 'selected' : ''}`}
            onClick={(e) => onTileClick(e, i, n)}
            title={`${res(i)} · ${i.sources.map((s) => SOURCE_NAMES[s.source]).join(', ')}${i.artist ? ` · ${label(i.artist)}` : ''}`}
          >
            <img src={i.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
            <span className="studio-tile-res">{res(i)}</span>
            <span className="studio-tile-src">
              {i.sources.map((s) => SOURCE_ICONS[s.source]).join('')}
              {i.level > 0 ? (i.level > 1 ? ' 🔞' : ' 🌶️') : ''}
            </span>
            <span
              className="studio-tile-check"
              role="checkbox"
              aria-checked={selected.has(i.key)}
              aria-label="Select"
              onClick={(e) => {
                e.stopPropagation();
                toggle(i);
                setLastClicked(n);
              }}
            >
              {selected.has(i.key) ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>
      {!loading && !items.length && !error && <p className="muted center">No pictures match. Try fewer tags, a smaller minimum size, or more sources.</p>}
      {loading && <p className="muted center">Searching {available.filter((s) => enabled(s.key)).length} sources…</p>}
      <div ref={sentinel} />

      {selected.size > 0 && (
        <div className="studio-selection">
          <span>
            <b>{selected.size}</b> selected
          </span>
          <button type="button" className="btn primary small-btn" onClick={() => send([...selected.values()])} disabled={sending || !eagle.running}>
            🦅 Send to Eagle
          </button>
          <button
            type="button"
            className="btn ghost small-btn"
            onClick={() =>
              setSelected((m) => {
                const n = new Map(m);
                items.forEach((i) => n.set(i.key, i));
                return n;
              })
            }
          >
            Select all {items.length}
          </button>
          <button type="button" className="btn ghost small-btn" onClick={() => setSelected(new Map())}>
            Clear
          </button>
        </div>
      )}
      {toast && <div className={`studio-toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}

      {open != null && items[open] && (
        <StudioViewer
          items={items}
          index={open}
          onIndex={(n) => {
            setOpen(n);
            if (n > items.length - 8) loadMore();
          }}
          onClose={() => setOpen(null)}
          selected={selected}
          onToggle={toggle}
          onSend={send}
          onAddTag={addTag}
          queryChips={query.chips}
        />
      )}
    </div>
  );
}
