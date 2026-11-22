import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { api } from '../api.js';
import SearchBox from './SearchBox.jsx';
import EntryRow from './EntryRow.jsx';

export default function ListView({ listId, onListsChanged }) {
  const [list, setList] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const cancelRename = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getList(listId)
      .then((data) => {
        if (cancelled) return;
        setList({ id: data.id, name: data.name });
        setEntries(data.entries);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [listId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const existingIds = useMemo(() => new Set(entries.map((e) => e.anilistId)), [entries]);

  // Optimistically show the new order, then persist it; revert on failure.
  const applyOrder = async (next) => {
    const previous = entries;
    setEntries(next);
    try {
      await api.reorder(listId, next.map((e) => e.id));
    } catch (err) {
      setEntries(previous);
      setError(`Could not save the new order: ${err.message}`);
    }
  };

  const onDragEnd = ({ active, over }) => {
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

  const handleAdd = async (result) => {
    const entry = await api.addEntry(listId, result.anilistId);
    setEntries((prev) => [...prev, entry]);
    onListsChanged();
  };

  const updateEntry = async (id, patch) => {
    try {
      const updated = await api.updateEntry(id, patch);
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Remove ${entry.name} from this list?`)) return;
    try {
      await api.deleteEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      onListsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const startRename = () => {
    setNameDraft(list.name);
    setEditingName(true);
  };

  const finishRename = async () => {
    setEditingName(false);
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    const name = nameDraft.trim();
    if (!name || name === list.name) return;
    try {
      const updated = await api.renameList(listId, name);
      setList((prev) => ({ ...prev, name: updated.name }));
      onListsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteList = async () => {
    const count = entries.length;
    const msg = `Delete the list "${list.name}"${count ? ` and its ${count} character${count === 1 ? '' : 's'}` : ''}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteList(listId);
      onListsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!list) {
    return error ? <div className="banner error">{error}</div> : <p className="muted">Loading…</p>;
  }

  return (
    <section className="list-view">
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
          <h2 className="list-name" onClick={startRename} title="Click to rename">
            {list.name}
          </h2>
        )}
        <span className="muted">
          {entries.length} character{entries.length === 1 ? '' : 's'}
        </span>
        <div className="spacer" />
        <button className="btn ghost" onClick={startRename}>
          Rename
        </button>
        <button className="btn danger" onClick={deleteList}>
          Delete list
        </button>
      </div>

      <SearchBox existingIds={existingIds} onAdd={handleAdd} />

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
          <p className="muted">This list is empty. Search for a character above to add them.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
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
