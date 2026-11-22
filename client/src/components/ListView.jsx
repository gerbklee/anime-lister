import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { api } from '../api.js';
import SearchBox from './SearchBox.jsx';
import EntryRow from './EntryRow.jsx';
import MembersPanel from './MembersPanel.jsx';

const POLL_MS = 5000;

export default function ListView({ listId, me, users, onListsChanged }) {
  const [detail, setDetail] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sharing, setSharing] = useState(false);

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

  // ---- Auto-refresh: pick up changes made by other people ----------------------
  useEffect(() => {
    let stopped = false;

    const isBusy = () => {
      if (draggingRef.current || pendingRef.current > 0) return true;
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

  // ---- Ordering ---------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const existingIds = useMemo(() => new Set(entries.map((e) => e.anilistId)), [entries]);

  const applyOrder = async (next) => {
    const previous = entries;
    setEntries(next);
    try {
      await track(api.reorder(listId, next.map((e) => e.id)));
    } catch (err) {
      if (err.status === 409) {
        await reloadAfterConflict('The list was just changed by someone else, so it was reloaded. Please try that move again.');
      } else {
        setEntries(previous);
        setError(`Could not save the new order: ${err.message}`);
      }
    }
  };

  const onDragEnd = ({ active, over }) => {
    draggingRef.current = false;
    if (!over || active.id === over.id) return;
    const from = entries.findIndex((e) => e.id === active.id);
    const to = entries.findIndex((e) => e.id === over.id);
    if (from < 0 || to < 0) return;
    applyOrder(arrayMove(entries, from, to));
  };

  const moveEntry = (entryId, targetRank) => {
    const from = entries.findIndex((e) => e.id === entryId);
    const to = Math.min(Math.max(targetRank - 1, 0), entries.length - 1);
    if (from < 0 || from === to) return;
    applyOrder(arrayMove(entries, from, to));
  };

  // ---- Entries ----------------------------------------------------------------
  const handleAdd = async (result) => {
    try {
      const entry = await track(api.addEntry(listId, result.anilistId));
      setEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]));
      onListsChanged();
    } catch (err) {
      if (err.status === 409) load().catch(() => {});
      throw err;
    }
  };

  const updateEntry = async (id, patch) => {
    try {
      const updated = await track(api.updateEntry(id, patch));
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      if (err.status === 404) await reloadAfterConflict('That character was removed by someone else.');
      else setError(err.message);
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Remove ${entry.name} from this list?`)) return;
    try {
      await track(api.deleteEntry(entry.id));
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      onListsChanged();
    } catch (err) {
      if (err.status === 404) await reloadAfterConflict('That character was already removed by someone else.');
      else setError(err.message);
    }
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
    try {
      const updated = await track(api.renameList(listId, name));
      setDetail((prev) => ({ ...prev, name: updated.name }));
      onListsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteList = async () => {
    const count = entries.length;
    const msg = `Delete the list "${detail.name}"${count ? ` and its ${count} character${count === 1 ? '' : 's'}` : ''}? This cannot be undone.`;
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
        `Share "${detail.name}" with ${username}?\n\nThey will be able to add, remove and reorder characters. The list moves to "Shared", and shared lists don't count in comparisons.`,
      )
    ) {
      return false;
    }
    const updated = await track(api.addMember(listId, username));
    setDetail((prev) => ({ ...prev, ...updated }));
    setSharing(false);
    onListsChanged();
    return true;
  };

  const removeMember = async (user) => {
    if (!window.confirm(`Remove ${user.username} from "${detail.name}"?`)) return;
    try {
      await track(api.removeMember(listId, user.id));
      setDetail((prev) => ({ ...prev, members: prev.members.filter((m) => m.id !== user.id) }));
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

  const readOnly = !detail.canEdit;

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
            {detail.name}
          </h2>
        )}
        <span className="muted">
          {entries.length} character{entries.length === 1 ? '' : 's'}
        </span>
        {detail.isShared && <span className="pill">👥 Shared</span>}
        <div className="spacer" />
        {detail.isOwner && !detail.isShared && (
          <button className="btn ghost" onClick={() => setSharing((s) => !s)} aria-expanded={sharing}>
            Share
          </button>
        )}
        {detail.isOwner && (
          <>
            <button className="btn ghost" onClick={startRename}>
              Rename
            </button>
            <button className="btn danger" onClick={deleteList}>
              Delete list
            </button>
          </>
        )}
        {detail.isShared && !detail.isOwner && (
          <button className="btn ghost" onClick={leave}>
            Leave list
          </button>
        )}
      </div>

      {readOnly && (
        <div className="banner info">
          👀 This is {detail.owner?.username ?? 'someone'}'s personal list. You can look, but only they can edit it.
        </div>
      )}

      {(detail.isShared || sharing) && (
        <MembersPanel detail={detail} me={me} users={users} onInvite={invite} onRemove={removeMember} />
      )}

      {!readOnly && <SearchBox existingIds={existingIds} onAdd={handleAdd} />}

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

      {entries.length === 0 ? (
        <div className="empty-state">
          <p className="muted">
            {readOnly ? 'This list is empty.' : 'This list is empty. Search for a character above to add them.'}
          </p>
        </div>
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
          <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ol className="entries">
              {entries.map((entry, index) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  rank={index + 1}
                  total={entries.length}
                  readOnly={readOnly}
                  showAuthors={detail.isShared}
                  onMove={moveEntry}
                  onUpdate={updateEntry}
                  onDelete={deleteEntry}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
