import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import Menu from './Menu.jsx';
import { eagleAddOne, eagleFolderTree, eagleFolders, eagleIndexInfo, eagleInfo, folderResolver, itemInEagle, loadEagleIndex, markInEagle, subscribeEagleIndex } from '../eagle.js';

// The Art tab's search: one tag search (Danbooru's tag names) across many
// sites, streamed (each site shows as soon as it answers), merged so copies of
// the same picture collapse into the highest-resolution one. Also the artist
// pages and the "following" feed, which use the same grid and viewer.
// Server side: server/src/studio.js.

const KIND_ICONS = { character: '👤', ship: '💕', series: '🎬', artist: '🖌️', tag: '🏷️' };
const CATEGORY_KIND = { 0: 'tag', 1: 'artist', 3: 'series', 4: 'character', 5: 'tag' };
const SOURCE_ICONS = { danbooru: 'D', yandere: 'Y', konachan: 'K', gelbooru: 'G', zerochan: 'Z', wallhaven: 'W', pixiv: 'P' };
export const SOURCE_NAMES = { danbooru: 'Danbooru', yandere: 'Yande.re', konachan: 'Konachan', gelbooru: 'Gelbooru', zerochan: 'Zerochan', wallhaven: 'Wallhaven', pixiv: 'Pixiv' };
const SOURCE_ORDER = Object.keys(SOURCE_ICONS);

const PRESETS = [
  ['Framing', ['full_body', 'upper_body', 'cowboy_shot', 'portrait', 'close-up', 'hand_focus']],
  ['Angle', ['from_above', 'from_below', 'from_side', 'from_behind', 'dutch_angle', 'foreshortening', 'pov', 'profile', 'perspective']],
  ['Pose', ['dynamic_pose', 'standing', 'sitting', 'kneeling', 'squatting', 'lying', 'walking', 'running', 'jumping', 'fighting_stance', 'contrapposto', 'stretching', 'leaning_forward', 'looking_back', 'arms_up', 'hands_up', 'hand_on_own_hip', 'crossed_arms']],
  ['Lighting', ['backlighting', 'sunlight', 'dappled_sunlight', 'light_rays', 'lens_flare', 'glowing', 'silhouette', 'chiaroscuro', 'high_contrast', 'sunset', 'night']],
  ['Colour', ['red_theme', 'orange_theme', 'yellow_theme', 'green_theme', 'blue_theme', 'purple_theme', 'pink_theme', 'black_theme', 'white_theme', 'pastel_colors']],
  ['Background', ['simple_background', 'white_background', 'grey_background', 'gradient_background', 'scenery', 'cityscape', 'indoors', 'outdoors', 'rain']],
  ['Clothing & motion', ['kimono', 'armor', 'school_uniform', 'dress', 'coat', 'cape', 'frills', 'wind', 'floating_hair', 'wet', 'motion_blur', 'holding_sword']],
  ['Expression', ['smile', 'open_mouth', 'expressionless', 'clenched_teeth']],
  ['Medium & sheets', ['official_art', 'concept_art', 'sketch', 'lineart', 'monochrome', 'traditional_media', 'watercolor_(medium)', 'reference_sheet', 'turnaround', 'expression_chart', 'multiple_views', 'variations', 'muscular', 'anatomy', 'depth_of_field']],
];
// Too common to make "More like this" any more specific.
const GENERIC = new Set(['solo', '1girl', '1boy', '2girls', '2boys', 'multiple_girls', 'multiple_boys', 'highres', 'absurdres', 'looking_at_viewer', 'simple_background', 'white_background', 'upper_body', 'commentary', 'commentary_request', 'translated', 'english_commentary', 'artist_name', 'signature', 'twitter_username', 'smile', 'blush', 'open_mouth', 'closed_mouth', 'bangs', 'long_hair', 'short_hair', 'breasts', 'jewelry', 'hair_between_eyes', 'sidelocks']);

const DEFAULT_QUERY = { chips: [], sort: 'best', minEdge: 2000, orient: '', minScore: 0, solo: false, ai: 'hide', sketch: 'include', comics: 'hide', sources: null };
const STORE = 'studio-v1';

// Eagle export options: target folder, sorting into subfolders, tag style,
// whether to add ungrouped tags, star ratings from popularity, posting date.
const DEFAULT_EAGLE = { folderId: '', sortInto: 'none', style: 'grouped', other: false, stars: false, postDate: false };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return { query: { ...DEFAULT_QUERY, ...(s.query ?? {}) }, size: s.size ?? 180, hideInEagle: !!s.hideInEagle, eagle: { ...DEFAULT_EAGLE, ...(s.eagle ?? {}), ...(s.folderId ? { folderId: s.folderId } : {}) } };
  } catch {
    return { query: DEFAULT_QUERY, size: 180, hideInEagle: false, eagle: DEFAULT_EAGLE };
  }
}
function store(patch) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...load(), ...patch }));
  } catch {
    // private window: settings just aren't remembered
  }
}
// Used by the rest of the Art tab to start a search.
export function setSearchChips(chips) {
  store({ query: { ...load().query, chips } });
}

export const label = (tag) => tag.replace(/_/g, ' ');
const res = (i) => (i.width && i.height ? `${i.width}×${i.height}` : '');
export const artistHref = (key) => `#/art/artist/${encodeURIComponent(key)}`;

// ---- Tag input ---------------------------------------------------------------------------------

export function TagInput({ chips, onChange, placeholder }) {
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
    const t = setTimeout(async () => {
      try {
        const d = await api.artAutocomplete(term, controller.signal);
        setSuggestions(d.suggestions);
        setActive(0);
        // Fill in the series of characters the server didn't know yet.
        const missing = d.suggestions.filter((s) => s.kind === 'character' && !s.series).map((s) => s.tag);
        if (missing.length) {
          const { series } = await api.studioSeries(missing, controller.signal);
          setSuggestions((list) => list.map((s) => (series[s.tag] ? { ...s, series: series[s.tag] } : s)));
        }
      } catch {
        // typing on: an older request was cancelled
      }
    }, 180);
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
          <span key={c.tag} className={`chip kind-${c.kind}`} title={c.series ? `${c.label} · ${c.series}` : c.label}>
            {KIND_ICONS[c.kind] ?? '🏷️'} {c.label}
            {c.series && <span className="chip-series"> · {c.series}</span>}
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
          placeholder={chips.length ? 'Add tags…' : (placeholder ?? 'Character, ship, series, artist, or tags like "from below", "kimono"…')}
          aria-label="Search art"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="suggestions chip-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.tag} role="option" aria-selected={i === active} className={`suggestion ${i === active ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
              <span className="chip-kind">{KIND_ICONS[s.kind]}</span>
              <span className="suggestion-text">
                <span className="suggestion-name">
                  {s.label}
                  {s.kind === 'character' && (s.series ? <span className="suggestion-series"> · {s.series}</span> : s.series === undefined ? <span className="muted tiny"> · …</span> : null)}
                </span>
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

export function useEagle() {
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

// What's already in your Eagle library (read when Eagle is found, again when
// you come back to the window, at most once a minute).
function useEagleIndex(running) {
  const [, bump] = useState(0);
  useEffect(() => subscribeEagleIndex(() => bump((n) => n + 1)), []);
  useEffect(() => {
    if (!running) return undefined;
    loadEagleIndex().catch(() => {});
    const onFocus = () => loadEagleIndex().catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [running]);
  return { ...eagleIndexInfo(), has: itemInEagle, refresh: () => loadEagleIndex({ force: true }).catch(() => {}) };
}

export function EagleControls({ eagle }) {
  const [opts, setOpts] = useState(() => load().eagle);
  const [open, setOpen] = useState(false);
  const library = useEagleIndex(eagle.running);
  const set = (patch) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    store({ eagle: next });
  };
  if (eagle.running == null) return null;
  if (!eagle.running) {
    return (
      <button type="button" className="link-btn small muted eagle-off" onClick={eagle.check} title="Eagle isn't open on this computer. Open it, then click to check again.">
        ○ Eagle
      </button>
    );
  }
  return (
    <span className="studio-eagle">
      <button
        type="button"
        className="link-btn small eagle-on"
        onClick={library.refresh}
        title={`${eagle.version ? `Eagle ${eagle.version}. ` : ''}Pictures already in Eagle show 🦅. Click to read the library again (e.g. after deleting pictures there).`}
      >
        ● Eagle{library.ready ? ` · ${library.count.toLocaleString()}` : ' · reading…'}
      </button>
      <button
        type="button"
        className={`btn ghost small-btn eagle-target ${open ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Where pictures go in Eagle, and how they're tagged"
      >
        → {eagle.folders.find((f) => f.id === opts.folderId)?.name.split(' / ').pop() ?? 'Inbox'} ▾
      </button>
      {open && (
        <span className="eagle-options card">
          <label>
            Eagle folder
            <select value={opts.folderId} onChange={(e) => set({ folderId: e.target.value })}>
              <option value="">No folder (inbox)</option>
              {eagle.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort into subfolders
            <select value={opts.sortInto} onChange={(e) => set({ sortInto: e.target.value })}>
              <option value="none">No, all into the folder above</option>
              <option value="character">One per character</option>
              <option value="series">One per series</option>
              <option value="artist">One per artist</option>
            </select>
          </label>
          <label>
            Tags
            <select value={opts.style} onChange={(e) => set({ style: e.target.value })}>
              <option value="grouped">Grouped (Pose: sitting, Angle: from below)</option>
              <option value="plain">Plain (sitting, from below)</option>
            </select>
          </label>
          <label className="switch-row small">
            <input type="checkbox" checked={opts.other} onChange={(e) => set({ other: e.target.checked })} />
            <span>Also add tags that fit no group</span>
          </label>
          <label className="switch-row small">
            <input type="checkbox" checked={opts.stars} onChange={(e) => set({ stars: e.target.checked })} />
            <span>Star rating from popularity (1–5)</span>
          </label>
          <label className="switch-row small">
            <input type="checkbox" checked={opts.postDate} onChange={(e) => set({ postDate: e.target.checked })} />
            <span>Use the posting date as the picture's date</span>
          </label>
          <span className="muted tiny">
            Tags: characters, series, artist, pose, angle, framing, lighting, expression, hair, eyes, clothing, props, background, colour, effects, medium,
            people, shape, size and site. Tip: in Eagle, make tag groups for these to filter by them.
          </span>
        </span>
      )}
    </span>
  );
}

const scopeOf = (chips) => chips.find((c) => c.kind === 'character')?.tag;

// Sends pictures to Eagle: originals (via signed NAS links) with grouped tags,
// credits, links, optional stars and dates, sorted into folders if chosen.
async function sendToEagle(items, { queryChips = [], onProgress, folderName } = {}) {
  const opts = load().eagle;
  const chars = queryChips.filter((c) => c.kind === 'character').map((c) => c.tag);
  const series = queryChips.filter((c) => c.kind === 'series').map((c) => c.tag);
  const ready = [];
  const readyItems = []; // the search results behind `ready`, same order
  for (const i of items) {
    let original = i.original;
    if (!original && i.resolve) original = (await api.studioResolve(i.source, i.id, scopeOf(queryChips)).catch(() => null))?.original ?? null;
    // Board and gallery pictures: the stored copy, or the site's file (Danbooru's
    // original is looked up on the server).
    if (!original && i.legacy) original = i.boardCopy ?? i.rawPreview ?? null;
    if (!original) continue;
    const base = {
      original,
      source: i.source,
      id: i.id,
      tags: i.tags,
      // Sites without character tags: what you searched for.
      characters: i.characters.length ? i.characters : chars,
      series: i.series.length ? i.series : series,
      artists: i.artists,
      width: i.width,
      height: i.height,
      score: i.score,
      ai: i.ai,
      createdAt: i.createdAt,
      sourceUrl: i.sourceUrl,
      postUrl: i.postUrl,
      sources: i.sources,
      needsTags: !!i.legacy && !i.tags.length,
    };
    // Multi-page works: every page.
    const pages = i.pagesList?.length > 1 ? i.pagesList : null;
    if (pages) {
      pages.forEach((pg, n) => {
        readyItems.push(i);
        ready.push({ ...base, original: pg.original, page: `${n + 1}/${pages.length}` });
      });
    } else {
      readyItems.push(i);
      ready.push(base);
    }
  }
  const { items: prepared } = await api.studioEagle(ready, { style: opts.style, other: opts.other });
  const tree = folderName || opts.sortInto !== 'none' ? await eagleFolderTree() : null;
  const folderFor = tree ? folderResolver(tree) : null;
  // A board goes into its own folder (inside the chosen one).
  const fixed = folderName ? await folderFor(folderName, opts.folderId || undefined) : null;
  let sent = 0;
  for (const [n, p] of prepared.entries()) {
    if (!p) continue;
    const folderId = fixed ?? (opts.sortInto !== 'none' ? await folderFor(p.folders[opts.sortInto], opts.folderId || undefined) : opts.folderId || undefined);
    await eagleAddOne(
      {
        url: p.url.startsWith('http') ? p.url : `${window.location.origin}${p.url}`,
        name: p.name,
        website: p.website,
        tags: p.tags,
        annotation: p.annotation,
        star: opts.stars ? p.star : 0,
        modificationTime: opts.postDate ? p.modificationTime : null,
      },
      folderId,
    );
    markInEagle([readyItems[n]]);
    sent++;
    onProgress?.(sent, prepared.length);
  }
  return { sent, skipped: ready.length - sent };
}

// A whole board into an Eagle folder named after it.
export async function sendBoardToEagle(board, onProgress) {
  const info = await eagleInfo();
  if (!info.running) throw new Error('Eagle is not running on this computer. Open Eagle and try again.');
  const items = board.items.map(adaptItem);
  return sendToEagle(items, { folderName: board.name, onProgress });
}

// ---- Streaming results -----------------------------------------------------------------------------

const area = (i) => (Number(i.width) || 0) * (Number(i.height) || 0);

// Adds `lists` (one per site, each in that site's order) to `out`, taking
// turns between sites; copies of a picture already in `out` add their site to
// it and replace its media when they're bigger.
function mergeInto(out, byKey, lists) {
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let n = 0; n < longest; n++) {
    for (const list of lists) {
      const i = list[n];
      if (!i) continue;
      const hit = i.keys.map((k) => byKey.get(k)).find(Boolean);
      if (hit) {
        for (const s of i.sources) if (!hit.sources.some((x) => x.source === s.source && x.id === s.id)) hit.sources.push(s);
        for (const k of i.keys) if (!hit.keys.includes(k)) hit.keys.push(k);
        for (const f of ['artists', 'characters', 'series', 'tags']) if (!hit[f]?.length && i[f]?.length) hit[f] = i[f];
        if (!hit.artist && i.artist) hit.artist = i.artist;
        if (i.artistKey && (!hit.artistKey || (hit.artistKey.startsWith('pixiv:') && !i.artistKey.startsWith('pixiv:')))) hit.artistKey = i.artistKey;
        if (!hit.sourceUrl && i.sourceUrl) hit.sourceUrl = i.sourceUrl;
        if (!hit.pagesList && i.pagesList) Object.assign(hit, { pagesList: i.pagesList, pages: i.pages });
        hit.level = Math.max(hit.level, i.level);
        if (area(i) > area(hit)) {
          Object.assign(hit, { source: i.source, id: i.id, postUrl: i.postUrl, preview: i.preview, original: i.original, originalView: i.originalView, resolve: i.resolve, width: i.width, height: i.height, rawPreview: i.rawPreview });
        }
        i.keys.forEach((k) => byKey.set(k, hit));
        continue;
      }
      const entry = { ...i, sources: [...i.sources], keys: [...i.keys] };
      i.keys.forEach((k) => byKey.set(k, entry));
      out.push(entry);
    }
  }
}

// Runs a streamed search page by page. fetcher(page, onObject, signal).
export function useArtStream(fetcher, key, { sortByDate = false } = {}) {
  const [pages, setPages] = useState([]); // [{ lists: { [listKey]: items } }]
  const [sources, setSources] = useState({});
  const [tags, setTags] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const controller = useRef(null);

  const run = useCallback(
    async (p) => {
      controller.current?.abort();
      const c = new AbortController();
      controller.current = c;
      setLoading(true);
      setError(null);
      try {
        await fetcher(
          p,
          (msg) => {
            if (c.signal.aborted) return;
            if (msg.type === 'start' && msg.tags) setTags(msg.tags);
            if (msg.type !== 'source') return;
            const listKey = msg.artist ? `${msg.artist}|${msg.key}` : msg.key;
            setPages((list) => {
              const next = [...list];
              const at = p - 1;
              next[at] = { lists: { ...(next[at]?.lists ?? {}), [listKey]: msg.items } };
              return next;
            });
            setSources((s) => ({ ...s, [msg.key]: { ...msg, items: undefined, count: (msg.artist ? (s[msg.key]?.count ?? 0) : 0) + (msg.count ?? 0) } }));
          },
          c.signal,
        );
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (controller.current === c) setLoading(false);
      }
    },
    [fetcher],
  );

  // New search when `key` changes.
  useEffect(() => {
    setPages([]);
    setSources({});
    setPage(1);
    run(1);
    return () => controller.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const items = useMemo(() => {
    const out = [];
    const byKey = new Map();
    for (const pg of pages) {
      if (!pg) continue;
      const order = (k) => SOURCE_ORDER.indexOf(k.split('|').pop());
      const lists = Object.entries(pg.lists)
        .sort((a, b) => order(a[0]) - order(b[0]))
        .map(([, l]) => l);
      mergeInto(out, byKey, lists);
    }
    if (sortByDate) out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return out;
  }, [pages, sortByDate]);

  const hasMore = Object.values(sources).some((s) => s.more);
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    run(next);
  }, [loading, hasMore, page, run]);

  return { items, sources, tags, loading, error, hasMore, loadMore };
}

// ---- Viewer ------------------------------------------------------------------------------------

function StudioViewer({ items, index, onIndex, onClose, selected, onToggle, onSend, onAddTag, queryChips, actions, isInEagle, extraActions = [], renderInfo }) {
  const item = items[index];
  const [zoom, setZoom] = useState(false);
  const [original, setOriginal] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false); // phones: details folded away
  const [, bump] = useState(0);
  const stage = useRef(null);
  const drag = useRef(null);
  const touch = useRef(null);
  const lastTap = useRef(0);

  useEffect(() => {
    setZoom(false);
    setOriginal(null);
    setLoaded(false);
    setPage(0);
  }, [item?.key]);

  // Pictures from For you, Trending, boards and the gallery come without tags
  // or original: Danbooru fills them in when opened.
  useEffect(() => {
    if (!item?.legacy || item.filled || item.source !== 'danbooru') return;
    item.filled = true;
    api
      .studioPostTags(item.id)
      .then((t) => {
        Object.assign(item, {
          characters: t.characters,
          series: t.series,
          artists: t.artists,
          tags: t.tags,
          artist: item.artist ?? t.artists[0] ?? null,
          artistKey: t.artists[0] ?? item.artistKey,
          ...(t.original ? { original: t.original, originalView: t.originalView } : {}),
          ...(t.width ? { width: t.width, height: t.height } : {}),
          score: item.score ?? t.score,
        });
        bump((n) => n + 1);
      })
      .catch(() => {});
  }, [item]);

  const pages = item?.pagesList ?? null;
  const shown = pages ? pages[page] : null;
  const previewUrl = shown?.preview ?? item?.preview;

  const go = useCallback(
    (d) => {
      const n = index + d;
      if (n >= 0 && n < items.length) onIndex(n);
    },
    [index, items.length, onIndex],
  );
  const goPage = useCallback(
    (d) => {
      if (!pages) return false;
      const n = page + d;
      if (n < 0 || n >= pages.length) return false;
      setPage(n);
      setZoom(false);
      setLoaded(false);
      return true;
    },
    [pages, page],
  );

  const originalUrl = useCallback(async () => {
    if (shown) return shown.originalView;
    if (item.originalView) return item.originalView;
    if (item.resolve) return (await api.studioResolve(item.source, item.id, scopeOf(queryChips)).catch(() => null))?.originalView ?? null;
    return null;
  }, [item, shown, queryChips]);

  const openOriginal = useCallback(async () => {
    if (!item) return;
    if (zoom) {
      setZoom(false);
      return;
    }
    setOriginal((await originalUrl()) ?? previewUrl);
    setZoom(true);
  }, [item, zoom, originalUrl, previewUrl]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea, .modal')) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ']' || e.key === 'PageDown') goPage(1);
      else if (e.key === '[' || e.key === 'PageUp') goPage(-1);
      else if (e.key === 'z' || e.key === 'Z') openOriginal();
      else if (e.key === ' ' || e.key === 's') {
        e.preventDefault();
        onToggle(item);
      } else if (e.key === 'e' || e.key === 'E') onSend([item]);
      else if (e.key === 'b' || e.key === 'B') actions.board(item);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [go, goPage, onClose, openOriginal, onToggle, onSend, item, actions]);

  if (!item) return null;
  const isSel = selected.has(item.key);
  const inEagle = isInEagle?.(item) ?? false;
  const charChips = item.characters.map((t) => ({ tag: t, label: label(t).replace(/ \(.*\)$/, ''), kind: 'character' }));
  const likeThis = [...charChips.slice(0, 2), ...item.tags.filter((t) => !GENERIC.has(t) && !/_(hair|eyes)$/.test(t)).slice(0, 2).map((t) => ({ tag: t, label: label(t), kind: 'tag' }))];

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
  // Phones: swipe left/right to browse (or turn pages), down to close,
  // double-tap for the original (then pan by scrolling).
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!zoom && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (!goPage(dx < 0 ? 1 : -1)) go(dx < 0 ? 1 : -1);
    } else if (!zoom && dy > 100 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        e.preventDefault();
        openOriginal();
      }
      lastTap.current = now;
    }
  };

  return createPortal(
    <div className="studio-viewer" role="dialog" aria-modal="true" aria-label="Picture viewer">
      <div className="studio-viewer-top">
        <span>
          {index + 1} / {items.length}
          {pages && (
            <span className="muted small">
              {' '}
              · page {page + 1}/{pages.length}
            </span>
          )}
        </span>
        <span className="muted small hide-mobile">← → browse{pages ? ' · [ ] pages' : ''} · Z original 1:1 · Space select · E Eagle · B board · Esc close</span>
        <button type="button" className="viewer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={`studio-viewer-body ${infoOpen ? 'info-open' : ''}`}>
        <div
          ref={stage}
          className={`studio-stage ${zoom ? 'zoomed' : ''}`}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={(e) => {
            const moved = drag.current?.moved;
            drag.current = null;
            if (!moved && e.button === 0 && e.target === e.currentTarget.querySelector('.studio-img:not(.placeholder)')) openOriginal();
          }}
          onMouseLeave={() => (drag.current = null)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {!loaded && <img className="studio-img placeholder" src={item.thumbLarge ?? item.thumb} alt="" referrerPolicy="no-referrer" />}
          <img
            key={zoom ? original : previewUrl}
            className={`studio-img ${loaded ? '' : 'loading'}`}
            src={zoom ? original : previewUrl}
            alt=""
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={(e) => {
              if (!e.currentTarget.dataset.fallback) {
                e.currentTarget.dataset.fallback = '1';
                e.currentTarget.src = item.thumbLarge ?? item.thumb;
              }
            }}
          />
          {index > 0 && (
            <button type="button" className="viewer-nav prev" onClick={() => go(-1)} aria-label="Previous">
              ‹
            </button>
          )}
          {index < items.length - 1 && (
            <button type="button" className="viewer-nav next" onClick={() => go(1)} aria-label="Next">
              ›
            </button>
          )}
        </div>
        <aside className="studio-info">
          <div className="studio-info-actions">
            <button type="button" className="btn primary small-btn" onClick={() => actions.board(item)}>
              📌 Board
            </button>
            <button type="button" className="btn small-btn" onClick={() => onSend([item])} title={inEagle ? 'Already in your Eagle library; sends another copy' : 'Send the original to Eagle on this computer'}>
              {inEagle ? '🦅 Again' : pages ? `🦅 Eagle (${pages.length})` : '🦅 Eagle'}
            </button>
            <button type="button" className={`btn small-btn ${isSel ? 'saved' : 'ghost'}`} onClick={() => onToggle(item)}>
              {isSel ? '☑ Selected' : '☐ Select'}
            </button>
            <button type="button" className="btn ghost small-btn" onClick={openOriginal}>
              {zoom ? 'Fit' : '1:1 original'}
            </button>
            <button type="button" className="btn ghost small-btn info-toggle" onClick={() => setInfoOpen((o) => !o)} aria-expanded={infoOpen}>
              {infoOpen ? 'Less ▾' : 'More ▴'}
            </button>
          </div>
          {pages && (
            <div className="studio-pages">
              {pages.map((pg, n) => (
                <button key={pg.original} type="button" className={`studio-page ${n === page ? 'active' : ''}`} onClick={() => goPage(n - page)} aria-label={`Page ${n + 1}`}>
                  {n + 1}
                </button>
              ))}
            </div>
          )}
          <p className="small">
            {inEagle && <span className="in-eagle-pill">🦅 In Eagle</span>}
            {item.similarity != null && <span className="in-eagle-pill similar-pill">{item.similarity}% match</span>}
            <b>{res(item)}</b>
            {item.score != null && <> · ★ {item.score}</>}
            {item.pages > 1 && <> · {item.pages} pages</>}
            {item.level > 0 && <> · {item.level > 1 ? '🔞' : '🌶️'}</>}
          </p>
          {renderInfo?.(item)}
          {item.artist && (
            <p className="small">
              🖌️{' '}
              {item.artistKey ? (
                <a href={artistHref(item.artistKey)} onClick={onClose} title="Artist page: their work on every site">
                  {label(item.artist)}
                </a>
              ) : (
                label(item.artist)
              )}
              {item.artistKey && (
                <button type="button" className="link-btn" onClick={() => actions.follow(item.artistKey, label(item.artist))}>
                  ➕ Follow
                </button>
              )}
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
          <div className="studio-more">
            {extraActions
              .filter((a) => !a.show || a.show(item))
              .map((a) => (
                <button key={a.label} type="button" className="btn ghost small-btn" onClick={() => a.onSelect(item)}>
                  {a.icon} {a.label}
                </button>
              ))}
            {item.artistKey && item.artist && (
              <button type="button" className="btn ghost small-btn" onClick={() => actions.search([{ tag: item.artistKey, label: label(item.artist), kind: 'artist' }])}>
                🖌️ More by {label(item.artist)}
              </button>
            )}
            {charChips.length > 0 && (
              <button type="button" className="btn ghost small-btn" onClick={() => actions.search(charChips.slice(0, 3))}>
                👥 Same characters
              </button>
            )}
            {likeThis.length > 1 && (
              <button type="button" className="btn ghost small-btn" onClick={() => actions.search(likeThis)}>
                🧬 More like this
              </button>
            )}
            <button type="button" className="btn ghost small-btn" onClick={() => actions.similar(item, shown)} title="Reverse image search: the highest-resolution original and similar pictures">
              🔎 Original & similar
            </button>
            <button type="button" className="btn ghost small-btn" onClick={() => actions.wallpaper(item)}>
              📱 Wallpaper
            </button>
            {item.level === 0 && item.rawPreview && (
              <button type="button" className="btn ghost small-btn" onClick={() => actions.avatar(item)}>
                👤 Profile photo
              </button>
            )}
            <button
              type="button"
              className="btn ghost small-btn"
              onClick={async () => {
                const url = await originalUrl();
                if (url) window.open(url, '_blank', 'noopener');
              }}
            >
              ↗️ Original
            </button>
          </div>
          {[...item.characters, ...item.series].length > 0 && (
            <div className="studio-tags">
              {item.characters.length > 12 && <span className="muted tiny">{item.characters.length} characters, first 12:</span>}
              {item.characters.slice(0, 12).map((t) => (
                <button key={t} type="button" className="chip kind-character" onClick={() => onAddTag({ tag: t, label: label(t), kind: 'character' })}>
                  👤 {label(t)}
                </button>
              ))}
              {item.series.slice(0, 8).map((t) => (
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

// ---- Grid with selection, viewer and Eagle --------------------------------------------------------

// tools: from useArtActions (boards, wallpapers, What is this?, follow, profile photo).
// onSearch(chips): start a new search. onAddTag(chip): add to the current search.
// extraActions: [{ icon, label, onSelect(item), show?(item) }] for the viewer (e.g. "Remove from board").
// renderInfo(item): extra lines in the viewer. renderTrigger(open): replaces the grid
// (e.g. the Art of the day card opens the viewer).
export function ArtResults({ stream, size = 180, tools, queryChips = [], onSearch, onAddTag, emptyText, eagle, hideInEagle = false, extraActions, renderInfo, renderTrigger, practiceTitle }) {
  const { items: allItems, loading, hasMore, loadMore } = stream;
  const library = useEagleIndex(eagle?.running);
  const items = useMemo(() => (hideInEagle && library.ready ? allItems.filter((i) => !library.has(i)) : allItems), [allItems, hideInEagle, library]);
  const hiddenCount = allItems.length - items.length;
  const [open, setOpen] = useState(null);
  const [selected, setSelected] = useState(new Map());
  const [lastClicked, setLastClicked] = useState(null);
  const [toast, setToast] = useState(null);
  const [sending, setSending] = useState(false);
  const [similarOf, setSimilarOf] = useState(null);
  const [practice, setPractice] = useState(null);
  const sentinel = useRef(null);

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
        const { sent, skipped } = await sendToEagle(list, {
          queryChips,
          onProgress: (n, total) => total > 1 && setToast({ text: `Sending to Eagle… ${n}/${total}` }),
        });
        setToast({ text: `🦅 ${sent} sent to Eagle, tagged${skipped ? ` (${skipped} unavailable)` : ''}` });
        if (list.length > 1) setSelected(new Map());
      } catch (err) {
        setToast({ text: err.message, error: true });
      } finally {
        setSending(false);
        setTimeout(() => setToast(null), 5000);
      }
    },
    [sending, queryChips],
  );

  const scope = scopeOf(queryChips);
  const actions = useMemo(
    () => ({
      board: (i) => tools.openBoard({ ...i, scope, thumb: i.thumbLarge ?? i.thumb, full: i.preview }),
      wallpaper: (i) => tools.openWallpaper({ ...i, remoteUrl: undefined, full: i.originalView ?? i.preview }),
      similar: (i, page) => setSimilarOf({ item: i, url: page?.original ?? i.original ?? i.rawPreview ?? i.boardCopy ?? null }),
      avatar: (i) => tools.useAsAvatar(i.rawPreview),
      follow: (key, name) => tools.follow(key, name),
      search: (chips) => {
        setOpen(null);
        onSearch(chips);
      },
    }),
    [tools, scope, onSearch],
  );

  const big = size > 220;
  const practiceItems = selected.size ? [...selected.values()] : items;
  return (
    <>
      {renderTrigger ? (
        renderTrigger((n) => setOpen(n))
      ) : (
        <div className={`studio-grid ${selected.size ? 'selecting' : ''}`} style={{ '--studio-size': `${size}px` }}>
          {items.map((i, n) => (
            <button
              key={i.key}
              type="button"
              className={`studio-tile ${selected.has(i.key) ? 'selected' : ''} ${library.ready && library.has(i) ? 'in-eagle' : ''}`}
              onClick={(e) => onTileClick(e, i, n)}
              title={`${res(i)} · ${i.sources.map((s) => SOURCE_NAMES[s.source] ?? s.source).join(', ')}${i.artist ? ` · ${label(i.artist)}` : ''}`}
            >
              <img src={big ? (i.thumbLarge ?? i.thumb) : i.thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              {res(i) && <span className="studio-tile-res">{res(i)}</span>}
              {library.ready && library.has(i) && (
                <span className="studio-tile-eagle" title="Already in your Eagle library">
                  🦅 In Eagle
                </span>
              )}
              <span className="studio-tile-src">
                {i.pages > 1 ? `▤${i.pages} ` : ''}
                {i.sources.map((s) => SOURCE_ICONS[s.source] ?? '').join('')}
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
      )}
      {!renderTrigger && (
        <>
          {hiddenCount > 0 && <p className="muted tiny center">{hiddenCount} already in Eagle hidden.</p>}
          {!loading && !items.length && <p className="muted center">{hiddenCount ? 'Everything here is already in Eagle.' : (emptyText ?? 'No pictures match. Try fewer tags, a smaller minimum size, or more sites.')}</p>}
          {loading && <p className="muted center small">{items.length ? 'Loading more…' : 'Searching…'}</p>}
          {hasMore && <div ref={sentinel} />}
          {items.length > 1 && selected.size === 0 && practiceTitle !== false && (
            <button type="button" className="btn ghost small-btn practice-launch" onClick={() => setPractice(items)} title="Timed drawing practice with these pictures">
              ✏️ Practice with {items.length}
            </button>
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="studio-selection">
          <span>
            <b>{selected.size}</b> selected
          </span>
          <button type="button" className="btn primary small-btn" onClick={() => send([...selected.values()])} disabled={sending || !eagle?.running} title={eagle?.running ? undefined : 'Open Eagle on this computer'}>
            🦅 Send to Eagle
          </button>
          <button type="button" className="btn ghost small-btn" onClick={() => setPractice(practiceItems)}>
            ✏️ Practice
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
          onAddTag={(chip) => {
            setOpen(null);
            (onAddTag ?? ((c) => onSearch([...queryChips, c])))(chip);
          }}
          queryChips={queryChips}
          actions={actions}
          isInEagle={library.ready ? library.has : null}
          extraActions={extraActions}
          renderInfo={renderInfo}
        />
      )}
      {similarOf && <SimilarDialog of={similarOf} tools={tools} eagle={eagle} onSearch={onSearch} onClose={() => setSimilarOf(null)} />}
      {practice && <GesturePractice items={practice} onClose={() => setPractice(null)} />}
    </>
  );
}

// Static lists (For you, boards, the gallery) in the same grid.
export const staticStream = (items) => ({ items, loading: false, hasMore: false, loadMore: () => {}, sources: {}, tags: null, error: null });

// Pictures from For you, Trending, boards and the gallery (the older format)
// for the grid and viewer. Danbooru ones get their tags when opened.
export function adaptItem(i) {
  const key = `${i.source}:${i.id}`;
  const local = typeof i.full === 'string' && i.full.startsWith('/images/') ? i.full : null;
  const artistTag = i.source === 'danbooru' && i.artist ? String(i.artist).trim().replace(/\s+/g, '_') : null;
  return {
    ...i,
    key: i.savedId ? `saved:${i.savedId}` : i.itemId ? `board:${i.itemId}` : key,
    keys: [key],
    sources: [{ source: i.source, id: i.id, postUrl: i.postUrl }],
    thumb: i.thumb,
    thumbLarge: i.thumb,
    preview: i.full ?? i.thumb,
    original: null,
    originalView: i.full ?? null,
    boardCopy: local,
    rawPreview: i.remoteUrl ?? null,
    width: i.width ?? null,
    height: i.height ?? null,
    score: i.score ?? null,
    artist: i.artist ?? null,
    artists: artistTag ? [artistTag] : [],
    artistKey: artistTag,
    characters: [],
    series: [],
    tags: [],
    level: Number(i.spicy) || 0,
    ai: false,
    pages: 1,
    pagesList: null,
    legacy: true,
  };
}

// ---- Original & similar ----------------------------------------------------------------------------

function SimilarDialog({ of, tools, eagle, onSearch, onClose }) {
  const [job, setJob] = useState({ status: 'starting', seconds: 0 });
  useEffect(() => {
    let stop = false;
    let timer;
    (async () => {
      try {
        if (!of.url) throw new Error('No picture file to compare for this one.');
        const { id } = await api.studioSimilar(of.url);
        const poll = async () => {
          if (stop) return;
          const s = await api.studioSimilarStatus(id);
          setJob(s);
          if (s.status === 'running') timer = setTimeout(poll, 3000);
        };
        poll();
      } catch (err) {
        setJob({ status: 'error', error: err.message });
      }
    })();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [of]);
  const items = job.items ?? [];
  return createPortal(
    <div className="similar-dialog" role="dialog" aria-modal="true" aria-label="Original and similar pictures">
      <div className="similar-head">
        <h3>🔎 Original & similar</h3>
        <button type="button" className="viewer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {job.status === 'error' && <p className="error-text">{job.error}</p>}
      {(job.status === 'running' || job.status === 'starting') && (
        <p className="muted">
          <span className="spinner inline-small" aria-hidden="true" /> {job.stage === 'checking' ? 'Checking the matches…' : 'Asking iqdb.org (Danbooru, Yande.re, Konachan, Gelbooru, Zerochan)…'} {job.seconds ? `${job.seconds}s` : ''}
          <br />
          <span className="tiny">This usually takes 30–60 seconds.</span>
        </p>
      )}
      {job.status === 'done' && (
        <>
          <p className="muted small">
            {items.length
              ? `Closest first; the top one is the original or its largest copy (${res(items[0])}).`
              : 'No matches found on the supported sites.'}
          </p>
          <ArtResults stream={staticStream(items)} tools={tools} eagle={eagle} onSearch={(chips) => (onClose(), onSearch(chips))} practiceTitle={false} renderInfo={() => null} />
        </>
      )}
    </div>,
    document.body,
  );
}

// ---- Gesture practice -------------------------------------------------------------------------------

const SESSIONS = [
  { key: '30s', label: '30 seconds each', plan: [30] },
  { key: '1m', label: '1 minute each', plan: [60] },
  { key: '2m', label: '2 minutes each', plan: [120] },
  { key: '5m', label: '5 minutes each', plan: [300] },
  { key: '10m', label: '10 minutes each', plan: [600] },
  { key: 'class', label: 'Class: 10×30s, 5×1m, 2×5m, 1×10m', plan: [...Array(10).fill(30), ...Array(5).fill(60), 300, 300, 600] },
];
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Timed drawing practice: one picture at a time with a countdown.
export function GesturePractice({ items, onClose }) {
  const [setup, setSetup] = useState(true);
  const [session, setSession] = useState('1m');
  const [count, setCount] = useState(Math.min(20, items.length));
  const [shuffle, setShuffle] = useState(true);
  const [mirror, setMirror] = useState(false);
  const [grey, setGrey] = useState(false);
  const [queue, setQueue] = useState([]);
  const [at, setAt] = useState(0);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState([]);
  const [finished, setFinished] = useState(false);

  const start = () => {
    const pool = shuffle ? [...items].sort(() => Math.random() - 0.5) : [...items];
    const s = SESSIONS.find((x) => x.key === session);
    const n = s.key === 'class' ? s.plan.length : count;
    const q = Array.from({ length: Math.min(n, pool.length) }, (_, k) => ({ item: pool[k], seconds: s.plan[Math.min(k, s.plan.length - 1)] }));
    setQueue(q);
    setAt(0);
    setLeft(q[0]?.seconds ?? 0);
    setDone([]);
    setFinished(false);
    setPaused(false);
    setSetup(false);
  };
  const next = useCallback(
    (d = 1) => {
      setDone((list) => (d > 0 && queue[at] ? [...list, queue[at]] : list));
      const n = at + d;
      if (n >= queue.length) {
        setFinished(true);
        return;
      }
      if (n < 0) return;
      setAt(n);
      setLeft(queue[n].seconds);
    },
    [at, queue],
  );

  useEffect(() => {
    if (setup || finished || paused) return undefined;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [setup, finished, paused]);
  useEffect(() => {
    if (!setup && !finished && left <= 0 && queue.length) next(1);
  }, [left, setup, finished, queue.length, next]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (setup || finished) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'ArrowRight') next(1);
      else if (e.key === 'ArrowLeft') next(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setup, finished, next, onClose]);

  const cur = queue[at];
  const total = done.reduce((s, x) => s + x.seconds, 0);
  return createPortal(
    <div className="practice" role="dialog" aria-modal="true" aria-label="Gesture practice">
      {setup ? (
        <div className="practice-setup card">
          <h3>✏️ Gesture practice</h3>
          <p className="muted small">{items.length} pictures. One at a time with a timer; draw until it runs out.</p>
          <label>
            Session
            <select value={session} onChange={(e) => setSession(e.target.value)}>
              {SESSIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {session !== 'class' && (
            <label>
              Pictures
              <input type="number" min="1" max={items.length} value={count} onChange={(e) => setCount(Math.max(1, Math.min(items.length, Number(e.target.value) || 1)))} />
            </label>
          )}
          <label className="switch-row small">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            <span>Shuffle</span>
          </label>
          <label className="switch-row small">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
            <span>Mirror pictures</span>
          </label>
          <label className="switch-row small">
            <input type="checkbox" checked={grey} onChange={(e) => setGrey(e.target.checked)} />
            <span>Greyscale (values only)</span>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <div className="spacer" />
            <button type="button" className="btn primary" onClick={start}>
              Start
            </button>
          </div>
        </div>
      ) : finished ? (
        <div className="practice-setup card">
          <h3>🎉 Done!</h3>
          <p className="small">
            {done.length === 1 ? '1 drawing' : `${done.length} drawings`} in {clock(total)}.
          </p>
          <div className="practice-done">
            {done.map((d, k) => (
              <img key={k} src={d.item.thumbLarge ?? d.item.thumb} alt="" referrerPolicy="no-referrer" />
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setSetup(true)}>
              Again
            </button>
            <div className="spacer" />
            <button type="button" className="btn primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="practice-stage" onClick={() => setPaused((p) => !p)}>
            {cur && (
              <img
                key={cur.item.key}
                src={cur.item.pagesList?.[0]?.preview ?? cur.item.preview}
                alt=""
                referrerPolicy="no-referrer"
                style={{ transform: mirror ? 'scaleX(-1)' : undefined, filter: grey ? 'grayscale(1)' : undefined }}
              />
            )}
            {paused && <span className="practice-paused">⏸ Paused</span>}
          </div>
          <div className="practice-bar">
            <span className={`practice-clock ${left <= 5 ? 'ending' : ''}`}>{clock(Math.max(0, left))}</span>
            <span className="muted small">
              {at + 1} / {queue.length}
            </span>
            <div className="practice-progress">
              <div style={{ width: `${cur ? (1 - left / cur.seconds) * 100 : 0}%` }} />
            </div>
            <button type="button" className="btn ghost small-btn" onClick={() => next(-1)} disabled={at === 0}>
              ←
            </button>
            <button type="button" className="btn ghost small-btn" onClick={() => setPaused((p) => !p)}>
              {paused ? '▶' : '⏸'}
            </button>
            <button type="button" className="btn ghost small-btn" onClick={() => next(1)}>
              Skip →
            </button>
            <button type="button" className="btn ghost small-btn" onClick={() => setFinished(true)}>
              End
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

// ---- Search view ----------------------------------------------------------------------------------

function useStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    api.studioStatus().then(setStatus).catch(() => {});
  }, []);
  return status;
}

const searchParams = (query) => ({
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

export function SearchView({ tools, onSearch }) {
  const [query, setQuery] = useState(() => load().query);
  const [size, setSize] = useState(() => load().size);
  const [hideInEagle, setHideInEagle] = useState(() => load().hideInEagle);
  const [panel, setPanel] = useState(null); // 'filters' | 'presets' | null
  const [searches, setSearches] = useState([]);
  const [error, setError] = useState(null);
  const status = useStatus();
  const eagle = useEagle();

  useEffect(() => {
    api.studioSearches().then(setSearches).catch(() => {});
  }, []);

  const update = useCallback((patch) => {
    setQuery((q) => {
      const next = { ...q, ...patch };
      store({ query: next });
      return next;
    });
  }, []);

  // Only what the server sees: a chip's icon or series changing doesn't search again.
  const key = JSON.stringify(searchParams(query));
  const fetcher = useCallback((page, onObject, signal) => api.studioSearch({ ...JSON.parse(key), page }, onObject, signal), [key]);
  const stream = useArtStream(fetcher, key);

  // Danbooru knows each tag's kind: fix chips typed by hand.
  useEffect(() => {
    if (!stream.tags) return;
    const kinds = new Map(stream.tags.map((t) => [t.tag, CATEGORY_KIND[t.category] ?? 'tag']));
    if (query.chips.some((c) => kinds.has(c.tag) && c.kind !== 'ship' && kinds.get(c.tag) !== c.kind)) {
      update({ chips: query.chips.map((c) => (kinds.has(c.tag) && c.kind !== 'ship' ? { ...c, kind: kinds.get(c.tag) } : c)) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.tags]);

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
  const deleteSearch = async (s) => {
    if (!window.confirm(`Delete the saved search “${s.name}”?`)) return;
    await api.deleteStudioSearch(s.id).catch(() => {});
    setSearches((list) => list.filter((x) => x.id !== s.id));
  };

  const available = (status?.sources ?? []).filter((s) => s.available);
  const enabled = (k) => !query.sources || query.sources.includes(k);
  const toggleSource = (k) => {
    const all = available.map((s) => s.key);
    const current = query.sources ?? all;
    const next = current.includes(k) ? current.filter((x) => x !== k) : [...current, k];
    update({ sources: next.length === all.length ? null : next });
  };
  // How many filters differ from the defaults (shown on the Filters button).
  const active = [
    query.minScore > 0,
    query.sketch !== 'include',
    query.solo,
    query.ai !== 'hide',
    query.comics !== 'hide',
    hideInEagle && eagle.running,
    !!query.sources,
  ].filter(Boolean).length;
  const presetCount = query.chips.filter((c) => PRESETS.some(([, tags]) => tags.includes(c.tag))).length;
  const ok = Object.values(stream.sources).filter((s) => s.state === 'ok');
  const problems = Object.values(stream.sources).filter((s) => s.state === 'error' || s.state === 'skipped');
  const toggle = (name) => setPanel((p) => (p === name ? null : name));

  return (
    <div className="studio">
      <div className="art-search-top">
        <TagInput chips={query.chips} onChange={(chips) => update({ chips })} />
        <div className="art-search-buttons">
          <button type="button" className={`btn ghost small-btn ${panel === 'filters' ? 'active' : ''}`} onClick={() => toggle('filters')} aria-expanded={panel === 'filters'}>
            ⚙ Filters{active ? ` · ${active}` : ''}
          </button>
          <button type="button" className={`btn ghost small-btn ${panel === 'presets' ? 'active' : ''}`} onClick={() => toggle('presets')} aria-expanded={panel === 'presets'}>
            🎯 Presets{presetCount ? ` · ${presetCount}` : ''}
          </button>
          <Menu
            title="Saved searches"
            label="Saved searches"
            icon="📁"
            text={searches.length ? `Saved · ${searches.length}` : 'Saved'}
            className="btn ghost small-btn"
            items={[
              ...searches.map((s) => ({ icon: '🔍', label: s.name, onSelect: () => update({ ...DEFAULT_QUERY, ...s.query }) })),
              searches.length > 0 && 'divider',
              { icon: '💾', label: 'Save this search…', onSelect: saveSearch },
              ...searches.map((s) => ({ icon: '🗑️', label: `Delete “${s.name}”`, danger: true, onSelect: () => deleteSearch(s) })),
            ].filter(Boolean)}
          />
        </div>
      </div>

      <div className="art-search-row">
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
        <select className="quiet-select" value={query.minEdge} onChange={(e) => update({ minEdge: Number(e.target.value) })} aria-label="Minimum size">
          {[0, 1000, 1500, 2000, 3000, 4000, 6000].map((v) => (
            <option key={v} value={v}>
              {v ? `≥ ${v}px` : 'Any size'}
            </option>
          ))}
        </select>
        <select className="quiet-select" value={query.orient} onChange={(e) => update({ orient: e.target.value })} aria-label="Shape">
          <option value="">Any shape</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
          <option value="square">Square</option>
        </select>
        <span className="spacer" />
        <EagleControls eagle={eagle} />
        <input
          className="art-size-slider"
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
          title="Thumbnail size"
        />
      </div>

      {panel === 'filters' && (
        <div className="art-panel card">
          <div className="art-panel-grid">
            <label>
              Minimum score
              <select value={query.minScore} onChange={(e) => update({ minScore: Number(e.target.value) })}>
                {[0, 10, 25, 50, 100, 250].map((v) => (
                  <option key={v} value={v}>
                    {v ? `★ ${v} or more` : 'Any'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sketches and lineart
              <select value={query.sketch} onChange={(e) => update({ sketch: e.target.value })}>
                <option value="include">Include</option>
                <option value="exclude">Hide</option>
                <option value="only">Only these</option>
              </select>
            </label>
          </div>
          <div className="art-panel-switches">
            <label className="switch-row small">
              <input type="checkbox" checked={query.solo} onChange={(e) => update({ solo: e.target.checked })} />
              <span>Solo only</span>
            </label>
            <label className="switch-row small">
              <input type="checkbox" checked={query.ai === 'hide'} onChange={(e) => update({ ai: e.target.checked ? 'hide' : 'show' })} />
              <span>Hide AI-generated</span>
            </label>
            <label className="switch-row small">
              <input type="checkbox" checked={query.comics === 'hide'} onChange={(e) => update({ comics: e.target.checked ? 'hide' : 'show' })} />
              <span>Hide comics</span>
            </label>
            {eagle.running && (
              <label className="switch-row small">
                <input
                  type="checkbox"
                  checked={hideInEagle}
                  onChange={(e) => {
                    setHideInEagle(e.target.checked);
                    store({ hideInEagle: e.target.checked });
                  }}
                />
                <span>Hide pictures already in Eagle</span>
              </label>
            )}
          </div>
          <div>
            <span className="muted small">Sites</span>
            <div className="studio-sources">
              {available.map((s) => (
                <button key={s.key} type="button" className={`studio-source ${enabled(s.key) ? 'on' : ''}`} onClick={() => toggleSource(s.key)}>
                  <span className="studio-source-icon">{SOURCE_ICONS[s.key]}</span> {s.label}
                </button>
              ))}
              {(status?.sources ?? [])
                .filter((s) => !s.available)
                .map((s) => (
                  <span key={s.key} className="studio-source off muted" title={s.note}>
                    {s.label} (needs setup)
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}

      {panel === 'presets' && (
        <div className="art-panel card studio-presets">
          {PRESETS.map(([group, tags]) => (
            <div key={group} className="studio-preset-group">
              <span className="muted small">{group}</span>
              <div className="studio-tags">
                {tags.map((t) => (
                  <button key={t} type="button" className={`chip ${query.chips.some((c) => c.tag === t) ? 'active' : ''}`} onClick={() => togglePreset(t)}>
                    {label(t).replace(/ theme$/, '')}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="muted tiny">Pose, angle, colour and other tags are searched on Danbooru, Yande.re, Konachan and Gelbooru; Zerochan, Wallhaven and Pixiv only search characters and series.</p>
        </div>
      )}

      {(ok.length > 0 || problems.length > 0) && (
        <p className="art-status muted tiny" title={problems.map((s) => `${s.label}: ${s.note}`).join('\n') || undefined}>
          {ok.map((s) => `${s.label} ${s.count}`).join(' · ')}
          {problems.length > 0 && <> · {problems.map((s) => `${s.label} –`).join(' · ')}</>}
          {stream.loading && ' · …'}
        </p>
      )}
      {(error || stream.error) && <p className="error-text small">{error || stream.error}</p>}

      <ArtResults
        stream={stream}
        hideInEagle={hideInEagle}
        size={size}
        tools={tools}
        queryChips={query.chips}
        eagle={eagle}
        onSearch={(chips) => {
          update({ chips });
          onSearch?.();
        }}
        onAddTag={(chip) => {
          if (!query.chips.some((c) => c.tag === chip.tag)) update({ chips: [...query.chips, chip].slice(0, 8) });
        }}
        emptyText={query.chips.length ? undefined : 'Search for a character, series, artist or tags, or open the presets.'}
      />
    </div>
  );
}

// ---- Artists -----------------------------------------------------------------------------------

// One artist across sites: links, follow button, and their work (Danbooru,
// Yande.re, Konachan, Gelbooru by their Danbooru name; Pixiv by their account).
export function ArtistView({ artistKey, tools, onSearch, following, onFollowChange }) {
  const [info, setInfo] = useState(null);
  const [sort, setSort] = useState('new');
  const eagle = useEagle();
  useEffect(() => {
    setInfo(null);
    api.studioArtist(artistKey).then(setInfo).catch(() => setInfo({ key: artistKey, name: label(artistKey.replace(/^pixiv:/, 'Pixiv ')), links: [], otherNames: [] }));
  }, [artistKey]);
  const key = JSON.stringify({ tags: artistKey, sort, minEdge: 0, ai: 'hide', comics: 'show', sketch: 'include' });
  const fetcher = useCallback((page, onObject, signal) => api.studioSearch({ ...JSON.parse(key), page }, onObject, signal), [key]);
  const stream = useArtStream(fetcher, key);
  const isFollowing = following?.some((f) => f.artist === artistKey || (info?.tag && f.artist === info.tag));
  const name = info?.name ?? label(artistKey);

  const toggleFollow = async () => {
    if (isFollowing) {
      const f = following.find((x) => x.artist === artistKey || x.artist === info?.tag);
      await api.unfollow(f.artist).catch(() => {});
    } else await tools.follow(artistKey, name);
    onFollowChange?.();
  };
  const counts = Object.values(stream.sources).filter((s) => s.state === 'ok' && s.count);

  return (
    <div className="studio artist-page">
      <div className="artist-head">
        <div>
          <h2>🖌️ {name}</h2>
          {info?.otherNames?.length > 0 && <p className="muted small">{info.otherNames.filter((n) => !n.includes('@')).slice(0, 6).join(' · ')}</p>}
          <div className="studio-links small">
            {(info?.links ?? []).map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                {l.site} ↗
              </a>
            ))}
          </div>
        </div>
        <div className="artist-actions">
          <button type="button" className={`btn small-btn ${isFollowing ? 'ghost' : 'primary'}`} onClick={toggleFollow}>
            {isFollowing ? '✓ Following' : '➕ Follow'}
          </button>
          <EagleControls eagle={eagle} />
        </div>
      </div>
      <div className="studio-bar">
        <div className="segmented small" role="radiogroup" aria-label="Sort">
          {[
            ['new', 'Newest'],
            ['best', 'Best'],
          ].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={sort === v} className={sort === v ? 'active' : ''} onClick={() => setSort(v)}>
              {l}
            </button>
          ))}
        </div>
        <span className="muted small">{counts.map((s) => `${s.label} ${s.count}`).join(' · ')}</span>
      </div>
      {stream.error && <p className="error-text small">{stream.error}</p>}
      <ArtResults stream={stream} tools={tools} eagle={eagle} hideInEagle={load().hideInEagle} queryChips={[{ tag: artistKey, kind: "artist", label: name }]} onSearch={onSearch} emptyText="No pictures by this artist found." />
    </div>
  );
}

// Newest work of everyone you follow, from every site, newest first.
export function FollowingFeed({ tools, onSearch, version }) {
  const eagle = useEagle();
  const fetcher = useCallback((page, onObject, signal) => api.studioFollowing(onObject, signal), []);
  const stream = useArtStream(fetcher, `following|${version ?? 0}`, { sortByDate: true });
  return (
    <>
      <div className="studio-bar">
        <EagleControls eagle={eagle} />
      </div>
      <ArtResults stream={{ ...stream, hasMore: false, loadMore: () => {} }} tools={tools} eagle={eagle} hideInEagle={load().hideInEagle} onSearch={onSearch} emptyText="Nothing new yet." />
    </>
  );
}
