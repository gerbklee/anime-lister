import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApp } from '../AppContext.jsx';
import { STATUS_LABELS } from '../util.js';
import { StatusBadge, VoteChips } from './ShipBits.jsx';
import Avatar from './Avatar.jsx';
import Menu from './Menu.jsx';
import Reactions from './Reactions.jsx';
import Thread from './Thread.jsx';

const ENTRY_EMOJIS = ['😂', '😳', '🔥', '❤️'];

export function RankInput({ rank, total, onMove }) {
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
        style={{ width: `calc(${Math.max(String(total).length, 1)}ch + 8px)` }}
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

// A note under an entry. Shown when there is one (tap to edit); a new note is
// started from the row's ⋯ menu (`editing`).
export function NoteEditor({ note, noteBy, showAuthor, onSave, editing, setEditing, readOnly = false }) {
  const [draft, setDraft] = useState(note);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) setDraft(note);
  }, [editing, note]);

  if (!editing) {
    if (!note) return null;
    return (
      <p className={`note ${readOnly ? 'read-only' : ''}`} onClick={readOnly ? undefined : () => setEditing(true)} title={readOnly ? undefined : 'Tap to edit note'}>
        {note}
        {showAuthor && noteBy && <span className="note-author"> · {noteBy.username}</span>}
      </p>
    );
  }

  return (
    <textarea
      className="note-input"
      autoFocus
      rows={2}
      maxLength={1000}
      value={draft}
      placeholder="Why is it ranked here?"
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
        if ((draft ?? '').trim() !== (note ?? '')) onSave((draft ?? '').trim());
      }}
    />
  );
}

// "✓ ★4.5", "▶ Watching" etc. for an anime in your catalogue.
export function CatalogueBadge({ animeId }) {
  const { catalogue } = useApp();
  const c = catalogue[animeId];
  if (!c) return null;
  const icon = c.status === 'watched' ? '✓' : c.status === 'watching' ? '▶' : '✕';
  return (
    <span className={`cat-badge ${c.status}`} title={`${STATUS_LABELS[c.status]}${c.rating ? ` · ${c.rating} stars` : ''}`}>
      {icon}
      {c.rating ? ` ★${c.rating}` : ` ${STATUS_LABELS[c.status]}`}
    </span>
  );
}

export function Portrait({ src, alt, onClick, label }) {
  const img = src ? (
    <img className="portrait" src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <div className="portrait img-placeholder" aria-hidden="true">
      ?
    </div>
  );
  if (!onClick) return img;
  return (
    <button type="button" className="portrait-btn" onClick={onClick} aria-label={label} title={label}>
      {img}
    </button>
  );
}

export default function EntryRow({
  kind,
  entry,
  rank,
  total,
  readOnly,
  showAuthors,
  onMove,
  onUpdate,
  onDelete,
  onChangeImage,
  social = false,
  extra = null,
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: readOnly,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const isAnime = kind === 'anime' || kind === 'manga';
  const isShip = kind === 'ship';
  const isCharacter = kind === 'character';
  const animeId = isAnime ? entry.anilistId : entry.seriesAnimeId;
  const href = isShip ? `#/ship/${entry.anilistId}` : isAnime ? (kind === 'manga' ? `#/manga/${entry.anilistId}` : `#/anime/${entry.anilistId}`) : `#/character/${entry.anilistId}`;
  const [showThread, setShowThread] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [pickingSeries, setPickingSeries] = useState(false);
  const [commentCount, setCommentCount] = useState(entry.commentCount ?? 0);
  useEffect(() => setCommentCount(entry.commentCount ?? 0), [entry.commentCount]);

  const canSwitchSeries = isCharacter && !readOnly && entry.seriesOptions.length > 1;
  const menuItems = [
    !readOnly && { icon: '📝', label: entry.note ? 'Edit note' : 'Add note', onSelect: () => setEditingNote(true) },
    social && entry.thread && { icon: '💬', label: showThread ? 'Hide comments' : 'Comment', right: commentCount || null, onSelect: () => setShowThread((s) => !s) },
    canSwitchSeries && { icon: '🎬', label: 'Change series shown', onSelect: () => setPickingSeries(true) },
    isCharacter && !readOnly && { icon: '🖼️', label: 'Change picture', onSelect: onChangeImage },
    isCharacter && { icon: '💕', label: `Ship ${entry.name.split(' ')[0]} with…`, href: `#/ships/new/${entry.anilistId}` },
    isCharacter && animeId && { icon: '📺', label: 'Open anime', href: `#/anime/${animeId}` },
    !readOnly && 'divider',
    !readOnly && { icon: '🗑️', label: 'Remove from list', danger: true, onSelect: () => onDelete(entry) },
  ];

  return (
    <li ref={setNodeRef} style={style} className={`entry ${isDragging ? 'dragging' : ''} ${readOnly ? 'read-only' : ''}`}>
      {!readOnly && (
        <button ref={setActivatorNodeRef} className="drag-handle" aria-label={`Drag to reorder ${entry.name}`} {...attributes} {...listeners}>
          ⠿
        </button>
      )}

      {readOnly ? (
        <span className="rank">
          <span className="rank-hash">#</span>
          {rank}
        </span>
      ) : (
        <RankInput rank={rank} total={total} onMove={(target) => onMove(entry.id, target)} />
      )}

      <a href={href} className="portrait-link" tabIndex={-1} aria-hidden="true">
        <Portrait src={entry.image} alt="" />
      </a>

      <div className="entry-info">
        <div className="entry-title">
          <a className="entry-name" href={href}>
            {entry.name}
          </a>
          {showAuthors && entry.addedBy && <Avatar user={entry.addedBy} size={18} title={`Added by ${entry.addedBy.username}`} />}
        </div>

        <div className="series-line">
          {pickingSeries ? (
            <select
              className="series-select"
              autoFocus
              value={entry.seriesTitle ?? ''}
              onChange={(e) => {
                onUpdate(entry.id, { seriesTitle: e.target.value });
                setPickingSeries(false);
              }}
              onBlur={() => setPickingSeries(false)}
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
          {animeId && <CatalogueBadge animeId={animeId} />}
        </div>

        {isShip && entry.ship && (
          <div className="ship-badges">
            <StatusBadge status={entry.ship.status} />
            <VoteChips ship={entry.ship} />
          </div>
        )}

        <NoteEditor
          note={entry.note}
          noteBy={entry.noteBy}
          showAuthor={showAuthors}
          readOnly={readOnly}
          editing={editingNote}
          setEditing={setEditingNote}
          onSave={(note) => onUpdate(entry.id, { note })}
        />

        {extra}

        {social && entry.thread && (
          <div className="entry-social">
            <Reactions target={entry.thread} initial={entry.reactions} emojis={ENTRY_EMOJIS} />
            {commentCount > 0 && (
              <button type="button" className="reaction comment-chip" onClick={() => setShowThread((s) => !s)} aria-expanded={showThread}>
                💬 {commentCount}
              </button>
            )}
          </div>
        )}
        {social && showThread && <Thread thread={entry.thread} onCount={setCommentCount} placeholder={`Say something about ${entry.name}…`} autoFocus />}
      </div>

      <Menu items={menuItems} title={entry.name} label={`Actions for ${entry.name}`} />
    </li>
  );
}
