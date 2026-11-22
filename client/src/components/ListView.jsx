import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { animeSearch, api, characterSearch, mangaSearch, mediaSearch, shipSearch } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { listEmoji, plural } from '../util.js';
import SearchBox from './SearchBox.jsx';
import EntryRow from './EntryRow.jsx';
import WatchRow from './WatchRow.jsx';
import MembersPanel from './MembersPanel.jsx';
import ImagePicker from './ImagePicker.jsx';
import TrailerModal from './TrailerModal.jsx';
import WatchedDialog from './WatchedDialog.jsx';
import Avatar from './Avatar.jsx';
import Menu from './Menu.jsx';
import BattleModal from './BattleModal.jsx';
import TierView from './TierView.jsx';
import CategoryPicker from './CategoryPicker.jsx';

const POLL_MS = 5000;

const WORDS = {
  character: ['character', 'Search for a character to add…'],
  anime: ['anime', 'Search for an anime to add…'],
  manga: ['manga', 'Search for a manga to add…'],
  watchlist: ['entry', 'Search for an anime or manga you want to watch or read…'],
  ship: ['ship', 'Search your ships to add… (new ships: Ship board)'],
};

// Entries ranked by one person, in their order.
function orderFor(entries, uid) {
  return entries.filter((e) => e.ranks?.[uid] != null).sort((a, b) => a.ranks[uid] - b.ranks[uid]);
}

// Average of everyone's length-adjusted positions (#1 = 1.0); entries nobody
// ranked yet go last. Also finds the biggest disagreements.
function combine(entries, people) {
  const counts = Object.fromEntries(people.map((p) => [p.id, entries.filter((e) => e.ranks?.[p.id] != null).length]));
  const scored = entries.map((e) => {
    const scores = people
      .filter((p) => e.ranks?.[p.id] != null)
      .map((p) => ({ user: p, rank: e.ranks[p.id], score: 1 - (e.ranks[p.id] - 1) / Math.max(counts[p.id], 1) }));
    const avg = scores.length ? scores.reduce((s, x) => s + x.score, 0) / scores.length : -1;
    const spread = scores.length > 1 ? Math.max(...scores.map((x) => x.score)) - Math.min(...scores.map((x) => x.score)) : 0;
    return { entry: e, scores, avg, spread };
  });
  scored.sort((a, b) => b.avg - a.avg || a.entry.position - b.entry.position);
  const disagreements = scored.filter((s) => s.spread >= 0.3).sort((a, b) => b.spread - a.spread).slice(0, 3);
  return { scored, disagreements };
}

function RankBadges({ scores, me }) {
  return (
    <div className="rank-badges">
      {scores.map((s) => (
        <span key={s.user.id} className="rank-badge" title={`${s.user.id === me.id ? 'You' : s.user.username}: #${s.rank}`}>
          <Avatar user={s.user} size={16} /> #{s.rank}
        </span>
      ))}
    </div>
  );
}

function TrayItem({ entry, maxRank, onPlace, onBattle, onDelete }) {
  const [pos, setPos] = useState('');
  return (
    <li className="tray-item">
      {entry.image ? <img src={entry.image} alt="" /> : <span className="img-placeholder small">?</span>}
      <div className="tray-info">
        <a href={entry.anime ? `#/anime/${entry.anilistId}` : `#/character/${entry.anilistId}`} className="tray-name">
          {entry.name}
        </a>
        <span className="muted tiny">
          {entry.addedBy && (
            <>
              <Avatar user={entry.addedBy} size={14} /> added by {entry.addedBy.username}
            </>
          )}
        </span>
      </div>
      <form
        className="tray-actions"
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseInt(pos, 10);
          onPlace(Number.isNaN(n) ? maxRank + 1 : Math.min(Math.max(n, 1), maxRank + 1));
          setPos('');
        }}
      >
        <input
          className="tray-pos"
          inputMode="numeric"
          placeholder={`#${maxRank + 1}`}
          value={pos}
          onChange={(e) => setPos(e.target.value.replace(/\D/g, ''))}
          aria-label={`Position for ${entry.name}`}
        />
        <button className="btn ghost small-btn" type="submit" title="Place at this position (empty = last)">
          Place
        </button>
        {maxRank > 0 && (
          <button className="btn ghost small-btn" type="button" onClick={onBattle} title="Find its spot with battles">
            ⚔️
          </button>
        )}
        <button className="icon-btn danger" type="button" onClick={onDelete} title="Remove from the list for everyone" aria-label={`Remove ${entry.name}`}>
          ✕
        </button>
      </form>
    </li>
  );
}

export default function ListView({ listId, onListsChanged }) {
  const { me, users, refreshCatalogue } = useApp();
  const [detail, setDetail] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sharing, setSharing] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [view, setView] = useState('mine'); // 'mine' | userId | 'combined'
  const [display, setDisplay] = useState('list'); // 'list' | 'tiers'
  const [picking, setPicking] = useState(null); // entry whose picture is being changed
  const [trailer, setTrailer] = useState(null); // entry whose trailer is playing
  const [watching, setWatching] = useState(null); // entry being marked as watched
  const [battle, setBattle] = useState(null); // { mode, only? }

  const rootRef = useRef(null);
  const versionRef = useRef(null);
  const draggingRef = useRef(false);
  const pendingRef = useRef(0);
  const cancelRename = useRef(false);

  const load = useCallback(async () => {
    const { entries: nextEntries, ...rest } = await api.getList(listId);
    versionRef.current = rest.version;
    setDetail(rest);
    setEntries(nextEntries);
  }, [listId]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  // Counts in-flight changes so auto-refresh doesn't overwrite them mid-way.
  const track = async (promise) => {
    pendingRef.current += 1;
    try {
      return await promise;
    } finally {
      pendingRef.current -= 1;
    }
  };

  const modalOpen = !!(picking || trailer || watching || battle);
  const modalRef = useRef(false);
  modalRef.current = modalOpen;

  // ---- Auto-refresh: pick up changes made by other people ----------------------
  useEffect(() => {
    let stopped = false;

    const isBusy = () => {
      if (draggingRef.current || pendingRef.current > 0 || modalRef.current) return true;
      const el = document.activeElement;
      return !!(
        el &&
        rootRef.current?.contains(el) &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) &&
        !el.closest('.search')
      );
    };

    const check = async () => {
      if (stopped || document.visibilityState !== 'visible' || isBusy()) return;
      try {
        const { version } = await api.listVersion(listId);
        if (stopped || version === versionRef.current || isBusy()) return;
        await load();
        onListsChanged();
      } catch (err) {
        if (err.status === 404) onListsChanged(); // deleted, or you were removed
      }
    };

    const timer = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [listId, load, onListsChanged]);

  const reloadAfterConflict = async (message) => {
    setNotice(message);
    await load().catch(() => {});
  };

  // ---- Derived views ----------------------------------------------------------
  const personal = !!detail?.personalRankings;
  const people = useMemo(() => (detail ? [detail.owner, ...detail.members].filter(Boolean) : []), [detail]);
  const myOrder = useMemo(() => (personal ? orderFor(entries, me.id) : entries), [personal, entries, me.id]);
  const tray = useMemo(() => (personal ? entries.filter((e) => e.ranks?.[me.id] == null) : []), [personal, entries, me.id]);
  const combined = useMemo(() => (personal ? combine(entries, people) : null), [personal, entries, people]);

  // ---- Ordering ---------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const existingIds = useMemo(() => new Set(entries.map((e) => e.anilistId)), [entries]);

  // `next` is the new order of the entries you rank (personal lists: all entries).
  const applyOrder = async (next) => {
    const previous = entries;
    if (personal) {
      const pos = new Map(next.map((e, i) => [e.id, i + 1]));
      setEntries((prev) =>
        prev.map((e) => {
          const ranks = { ...(e.ranks ?? {}) };
          if (pos.has(e.id)) ranks[me.id] = pos.get(e.id);
          else delete ranks[me.id];
          return { ...e, ranks };
        }),
      );
    } else {
      setEntries(next);
    }
    try {
      await track(api.reorder(listId, next.map((e) => e.id)));
    } catch (err) {
      if (err.status === 409) {
        await reloadAfterConflict('The list was just changed by someone else, so it was reloaded. Please try that again.');
      } else {
        setEntries(previous);
        setError(`Could not save the new order: ${err.message}`);
      }
      throw err;
    }
  };

  const onDragEnd = ({ active, over }) => {
    draggingRef.current = false;
    if (!over || active.id === over.id) return;
    const from = myOrder.findIndex((e) => e.id === active.id);
    const to = myOrder.findIndex((e) => e.id === over.id);
    if (from < 0 || to < 0) return;
    applyOrder(arrayMove(myOrder, from, to)).catch(() => {});
  };

  const moveEntry = (entryId, targetRank) => {
    const from = myOrder.findIndex((e) => e.id === entryId);
    const to = Math.min(Math.max(targetRank - 1, 0), myOrder.length - 1);
    if (from < 0 || from === to) return;
    applyOrder(arrayMove(myOrder, from, to)).catch(() => {});
  };

  const placeFromTray = (entry, rank) => {
    const next = [...myOrder];
    next.splice(rank - 1, 0, entry);
    applyOrder(next).catch(() => {});
  };

  // ---- Entries ----------------------------------------------------------------
  const handleAdd = async (result) => {
    try {
      const entry = await track(api.addEntry(listId, result.id));
      setEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]));
      onListsChanged();
    } catch (err) {
      if (err.status === 409) load().catch(() => {});
      throw err;
    }
  };

  const replaceEntry = (updated) => setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

  const updateEntry = async (id, patch) => {
    try {
      replaceEntry(await track(api.updateEntry(id, patch)));
    } catch (err) {
      if (err.status === 404) await reloadAfterConflict('That entry was removed by someone else.');
      else setError(err.message);
    }
  };

  const deleteEntry = async (entry) => {
    const msg = personal ? `Remove ${entry.name} from this list for everyone?` : `Remove ${entry.name} from this list?`;
    if (!window.confirm(msg)) return;
    try {
      await track(api.deleteEntry(entry.id));
      await load();
      onListsChanged();
    } catch (err) {
      if (err.status === 404) await reloadAfterConflict('That entry was already removed by someone else.');
      else setError(err.message);
    }
  };

  const markWatched = async (entry, userIds) => {
    await track(api.markWatched(entry.id, userIds));
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setNotice(
      <>
        🎉 {entry.name} was added to {userIds.includes(me.id) ? 'your catalogue' : 'their catalogues'}.{' '}
        <a href={`#/anime/${entry.anilistId}/suggest`}>Rate it and rank its characters →</a>
      </>,
    );
    refreshCatalogue();
    onListsChanged();
  };

  // ---- List actions -----------------------------------------------------------
  const startRename = () => {
    setNameDraft(detail.name);
    setEditingName(true);
  };

  const finishRename = async () => {
    setEditingName(false);
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    const name = nameDraft.trim();
    if (!name || name === detail.name) return;
    await changeList({ name });
  };

  const changeList = async (patch) => {
    try {
      const updated = await track(api.updateList(listId, patch));
      setDetail((prev) => ({ ...prev, ...updated }));
      onListsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteList = async () => {
    const n = entries.length;
    const msg = `Delete "${detail.name}"${n ? ` and its ${plural(n, 'entry', 'entries')}` : ''}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteList(listId);
      onListsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const invite = async (username) => {
    if (
      !detail.isShared &&
      !window.confirm(
        `Share "${detail.name}" with ${username}?\n\nThey will be able to add and remove entries${detail.kind === 'watchlist' ? ' and reorder them' : ', and rank them in their own order'}.`,
      )
    ) {
      return false;
    }
    const updated = await track(api.addMember(listId, username));
    setDetail((prev) => ({ ...prev, ...updated }));
    setSharing(false);
    await load();
    onListsChanged();
    return true;
  };

  const removeMember = async (user) => {
    if (!window.confirm(`Remove ${user.username} from "${detail.name}"?`)) return;
    try {
      await track(api.removeMember(listId, user.id));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const leave = async () => {
    if (!window.confirm(`Leave "${detail.name}"? You won't see it anymore unless you're invited again.`)) return;
    try {
      await api.removeMember(listId, me.id);
      onListsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!detail) {
    return error ? <div className="banner error">{error}</div> : <p className="muted">Loading…</p>;
  }

  const { kind } = detail;
  const readOnly = !detail.canEdit;
  const [word, placeholder] = WORDS[kind];
  const isRanked = kind !== 'watchlist';
  const social = isRanked && (detail.isShared || readOnly);

  // What is shown: your ranking (editable), someone else's, or the combined one.
  const viewUser = personal && typeof view === 'number' ? people.find((p) => p.id === view) : null;
  const effectiveView = personal ? (view === 'combined' ? 'combined' : viewUser ? 'user' : 'mine') : 'mine';
  let shown;
  if (!personal) shown = entries;
  else if (effectiveView === 'combined') shown = combined.scored.map((s) => s.entry);
  else if (effectiveView === 'user') shown = orderFor(entries, viewUser.id);
  else shown = myOrder;
  const editableView = !readOnly && effectiveView === 'mine';
  const scoresById = effectiveView === 'combined' ? new Map(combined.scored.map((s) => [s.entry.id, s.scores])) : null;
  const viewTitle =
    effectiveView === 'combined' ? `${detail.name} · combined` : effectiveView === 'user' ? `${detail.name} · ${viewUser.username}` : personal ? `${detail.name} · ${me.username}` : detail.name;
  const battleKey = `battle:${listId}:${me.id}`;

  return (
    <section className="list-view" ref={rootRef}>
      <div className="list-header">
        {editingName ? (
          <input
            className="list-name-input"
            autoFocus
            value={nameDraft}
            maxLength={100}
            aria-label="List name"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                cancelRename.current = true;
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <h2
            className={`list-name ${detail.isOwner ? 'editable' : ''}`}
            onClick={detail.isOwner ? startRename : undefined}
            title={detail.isOwner ? 'Click to rename' : undefined}
          >
            {listEmoji(detail) && <span className="list-emoji">{listEmoji(detail)} </span>}
            {detail.name}
          </h2>
        )}
        <div className="spacer" />
        <Menu
          title={detail.name}
          label="List options"
          items={[
            detail.isOwner && kind === 'character' && { icon: listEmoji(detail) || '⭐', label: 'Category & emoji', onSelect: () => setCategoryOpen((o) => !o) },
            detail.isOwner && { icon: '👥', label: detail.isShared ? 'Members & invite' : 'Share…', onSelect: () => setSharing((s) => !s) },
            detail.isOwner && { icon: '✏️', label: 'Rename', onSelect: startRename },
            detail.isShared && !detail.isOwner && { icon: '🚪', label: 'Leave list', onSelect: leave },
            detail.isOwner && 'divider',
            detail.isOwner && { icon: '🗑️', label: 'Delete list', danger: true, onSelect: deleteList },
          ]}
        />
      </div>
      <div className="list-subline">
        <span className="muted small">{plural(entries.length, word, { anime: 'anime', manga: 'manga', entry: 'entries' }[word] ?? `${word}s`)}</span>
        {detail.isShared && (
          <button type="button" className="members-mini" onClick={() => detail.isOwner && setSharing((s) => !s)} title={detail.isOwner ? 'Members & invite' : 'Members'}>
            <span className="avatar-stack" aria-hidden="true">
              {[detail.owner, ...detail.members].filter(Boolean).map((p) => (
                <Avatar key={p.id} user={p} size={20} />
              ))}
            </span>
            <span className="muted small">
              with{' '}
              {[detail.owner, ...detail.members]
                .filter((p) => p && p.id !== me.id)
                .map((p) => p.username)
                .join(', ') || 'nobody yet'}
            </span>
          </button>
        )}
        {readOnly && <span className="pill tiny">👀 {detail.owner?.username ?? 'Someone'}'s list · view only</span>}
      </div>

      {categoryOpen && detail.isOwner && kind === 'character' && (
        <CategoryPicker inline category={detail.category} emoji={detail.emoji} onChange={changeList} onClose={() => setCategoryOpen(false)} />
      )}

      {sharing && detail.isOwner && (
        <MembersPanel detail={detail} me={me} users={users} onInvite={invite} onRemove={removeMember} startOpen manageOnly />
      )}

      {!readOnly && (
        <SearchBox
          search={{ character: characterSearch, anime: animeSearch, manga: mangaSearch, watchlist: mediaSearch, ship: shipSearch }[kind]}
          existingIds={existingIds}
          onAdd={handleAdd}
          placeholder={placeholder}
        />
      )}

      {notice && (
        <div className="banner info">
          <span>{notice}</span>
          <button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {error && (
        <div className="banner error">
          <span>{error}</span>
          <button className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {isRanked && entries.length > 0 && (
        <div className="list-toolbar">
          {personal && (
            <div className="segmented compact-seg" role="tablist" aria-label="Whose ranking">
              <button type="button" className={effectiveView === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>
                Mine
              </button>
              {people
                .filter((p) => p.id !== me.id)
                .map((p) => (
                  <button key={p.id} type="button" className={view === p.id ? 'active' : ''} onClick={() => setView(p.id)}>
                    {p.username}'s
                  </button>
                ))}
              <button type="button" className={effectiveView === 'combined' ? 'active' : ''} onClick={() => setView('combined')}>
                Combined
              </button>
            </div>
          )}
          <div className="toolbar-icons">
            <button
              type="button"
              className={`icon-btn tool-btn ${display === 'tiers' ? 'active' : ''}`}
              onClick={() => setDisplay(display === 'tiers' ? 'list' : 'tiers')}
              aria-pressed={display === 'tiers'}
              title={display === 'tiers' ? 'Show as list' : 'Show as tier list'}
              aria-label="Tier view"
            >
              🏆
            </button>
            {editableView && myOrder.length + tray.length > 1 && (
              <button type="button" className="icon-btn tool-btn" onClick={() => setBattle({ mode: 'full' })} title="Battle sort: this or that" aria-label="Battle sort">
                ⚔️
              </button>
            )}
          </div>
        </div>
      )}

      {editableView && tray.length > 0 && (
        <div className="tray card">
          <div className="tray-head">
            <b>🆕 To rank</b>
            <span className="muted small">
              {plural(tray.length, 'new entry', 'new entries')} you haven't ranked yet. They don't count for your type until you do.
            </span>
            {myOrder.length > 0 && (
              <button className="btn primary small-btn" onClick={() => setBattle({ mode: 'insert' })}>
                ⚔️ Battle all in
              </button>
            )}
          </div>
          <ul className="tray-list">
            {tray.map((e) => (
              <TrayItem
                key={e.id}
                entry={e}
                maxRank={myOrder.length}
                onPlace={(rank) => placeFromTray(e, rank)}
                onBattle={() => setBattle({ mode: 'insert', only: e })}
                onDelete={() => deleteEntry(e)}
              />
            ))}
          </ul>
        </div>
      )}

      {effectiveView === 'combined' && combined.disagreements.length > 0 && (
        <div className="card disagreements">
          <b>⚔️ Biggest disagreements</b>
          <ul>
            {combined.disagreements.map((d) => (
              <li key={d.entry.id}>
                <a href={d.entry.anime ? `#/anime/${d.entry.anilistId}` : `#/character/${d.entry.anilistId}`}>{d.entry.name}</a>
                <RankBadges scores={d.scores} me={me} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {effectiveView === 'user' && (
        <p className="muted small">
          {viewUser.username}'s ranking{' '}
          {entries.length - shown.length > 0 && `· ${plural(entries.length - shown.length, 'entry', 'entries')} not ranked by them yet`}
        </p>
      )}

      {entries.length === 0 ? (
        <div className="empty-state">
          <p className="muted">{readOnly ? 'This list is empty.' : 'This list is empty. Use the search above to add something.'}</p>
        </div>
      ) : display === 'tiers' && isRanked ? (
        <TierView entries={shown} title={viewTitle} />
      ) : shown.length === 0 ? (
        <p className="muted">{effectiveView === 'mine' ? 'You haven’t ranked anything here yet. Place entries from the tray above.' : 'Nothing ranked yet.'}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragStart={() => {
            draggingRef.current = true;
          }}
          onDragCancel={() => {
            draggingRef.current = false;
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={shown.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ol className="entries">
              {shown.map((entry, index) =>
                kind === 'watchlist' ? (
                  <WatchRow
                    key={entry.id}
                    entry={entry}
                    rank={index + 1}
                    total={entries.length}
                    onMove={moveEntry}
                    onUpdate={updateEntry}
                    onDelete={deleteEntry}
                    onTrailer={() => setTrailer(entry)}
                    onWatched={() => setWatching(entry)}
                  />
                ) : (
                  <EntryRow
                    key={entry.id}
                    kind={kind}
                    entry={entry}
                    rank={index + 1}
                    total={shown.length}
                    readOnly={!editableView}
                    showAuthors={detail.isShared}
                    social={social}
                    extra={scoresById ? <RankBadges scores={scoresById.get(entry.id)} me={me} /> : null}
                    onMove={moveEntry}
                    onUpdate={updateEntry}
                    onDelete={deleteEntry}
                    onChangeImage={() => setPicking(entry)}
                  />
                ),
              )}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {picking && (
        <ImagePicker
          characterId={picking.anilistId}
          title={`Picture for ${picking.name}`}
          onClose={() => setPicking(null)}
          onPick={async (url) => replaceEntry(await track(api.updateEntry(picking.id, { imageUrl: url })))}
          onReset={
            picking.customImage
              ? async () => replaceEntry(await track(api.updateEntry(picking.id, { resetImage: true })))
              : undefined
          }
        />
      )}
      {trailer && <TrailerModal trailer={trailer.anime.trailer} title={trailer.name} onClose={() => setTrailer(null)} />}
      {watching && (
        <WatchedDialog entry={watching} people={people} me={me} onClose={() => setWatching(null)} onConfirm={(ids) => markWatched(watching, ids)} />
      )}
      {battle && (
        <BattleModal
          storageKey={battleKey}
          mode={battle.mode}
          ranked={myOrder}
          tray={battle.only ? [battle.only] : battle.mode === 'full' ? tray : tray}
          onSaveOrder={(ordered) => applyOrder(ordered)}
          onClose={() => setBattle(null)}
        />
      )}
    </section>
  );
}
