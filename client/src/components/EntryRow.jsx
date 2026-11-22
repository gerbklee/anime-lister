import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function RankInput({ rank, total, onMove }) {
  const [value, setValue] = useState(String(rank));
  const cancelled = useRef(false);

  useEffect(() => setValue(String(rank)), [rank]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setValue(String(rank));
      return;
    }
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) {
      setValue(String(rank));
      return;
    }
    const target = Math.min(Math.max(n, 1), total);
    setValue(String(target));
    if (target !== rank) onMove(target);
  };

  return (
    <label className="rank" title="Type a new position and press Enter">
      <span className="rank-hash">#</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Rank"
        value={value}
        size={Math.max(String(total).length, 1)}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function NoteEditor({ note, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const cancelled = useRef(false);

  const startEditing = () => {
    setDraft(note);
    setEditing(true);
  };

  if (!editing) {
    return note ? (
      <p className="note" onClick={startEditing} title="Click to edit note">
        {note}
      </p>
    ) : (
      <button className="link-btn" onClick={startEditing}>
        + Add note
      </button>
    );
  }

  return (
    <textarea
      className="note-input"
      autoFocus
      rows={2}
      maxLength={1000}
      value={draft}
      placeholder="Why are they ranked here? (Enter to save, Esc to cancel)"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        setEditing(false);
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        if (draft.trim() !== note) onSave(draft.trim());
      }}
    />
  );
}

export default function EntryRow({ entry, rank, total, onMove, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={style} className={`entry ${isDragging ? 'dragging' : ''}`}>
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        aria-label={`Drag to reorder ${entry.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <RankInput rank={rank} total={total} onMove={(target) => onMove(entry.id, target)} />

      {entry.image ? (
        <img className="portrait" src={entry.image} alt={entry.name} loading="lazy" />
      ) : (
        <div className="portrait img-placeholder" aria-hidden="true">?</div>
      )}

      <div className="entry-info">
        <a
          className="entry-name"
          href={`https://anilist.co/character/${entry.anilistId}`}
          target="_blank"
          rel="noreferrer"
          title="Open on AniList"
        >
          {entry.name}
        </a>
        {entry.seriesOptions.length > 1 ? (
          <select
            className="series-select"
            value={entry.seriesTitle ?? ''}
            onChange={(e) => onUpdate(entry.id, { seriesTitle: e.target.value })}
            title="Change which series is shown"
            aria-label={`Series shown for ${entry.name}`}
          >
            {entry.seriesOptions.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
        ) : (
          <span className="series">{entry.seriesTitle || 'Unknown series'}</span>
        )}
        <NoteEditor note={entry.note} onSave={(note) => onUpdate(entry.id, { note })} />
      </div>

      <button className="icon-btn danger" onClick={() => onDelete(entry)} aria-label={`Remove ${entry.name}`} title="Remove">
        ✕
      </button>
    </li>
  );
}
