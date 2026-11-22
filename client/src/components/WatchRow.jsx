import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { animeMeta, mediaHref } from "../util.js";
import Avatar from './Avatar.jsx';
import Thread from './Thread.jsx';
import { CatalogueBadge, NoteEditor, Portrait, RankInput } from './EntryRow.jsx';

// An anime in a watchlist: priority rank, trailer, comments and "Watched it".
export default function WatchRow({ entry, rank, total, onMove, onUpdate, onDelete, onTrailer, onWatched }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const [showComments, setShowComments] = useState(false);
  const [count, setCount] = useState(entry.commentCount ?? 0);
  useEffect(() => setCount(entry.commentCount ?? 0), [entry.commentCount]);
  const a = entry.anime;
  const manga = a?.type === "MANGA";

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={style} className={`entry watch-entry ${isDragging ? 'dragging' : ''}`}>
      <div className="watch-main">
        <button ref={setActivatorNodeRef} className="drag-handle" aria-label={`Drag to reorder ${entry.name}`} {...attributes} {...listeners}>
          ⠿
        </button>
        <RankInput rank={rank} total={total} onMove={(target) => onMove(entry.id, target)} />
        <Portrait src={entry.image} alt={entry.name} />
        <div className="entry-info">
          <div className="entry-title">
            <a className="entry-name" href={a ? mediaHref(a) : `#/anime/${entry.anilistId}`} title="Open page">
              {entry.name}
            </a>
            {manga && <span className="pill tiny">📖 Manga</span>}
            {entry.addedBy && <Avatar user={entry.addedBy} size={18} title={`Added by ${entry.addedBy.username}`} />}
          </div>
          <div className="series-line">
            <span className="series">{animeMeta(a) || entry.seriesTitle}</span>
            <CatalogueBadge animeId={entry.anilistId} />
          </div>
          {a?.genres?.length > 0 && <div className="genres muted small">{a.genres.slice(0, 4).join(' · ')}</div>}
          <NoteEditor note={entry.note} noteBy={entry.noteBy} showAuthor onSave={(note) => onUpdate(entry.id, { note })} />
        </div>
        <button className="icon-btn danger" onClick={() => onDelete(entry)} aria-label={`Remove ${entry.name}`} title="Remove">
          ✕
        </button>
      </div>

      <div className="watch-actions">
        {a?.trailer ? (
          <button className="btn ghost small-btn" onClick={onTrailer}>
            ▶ Trailer
          </button>
        ) : (
          <span className="muted tiny">{manga ? "" : "No trailer"}</span>
        )}
        <button className={`btn ghost small-btn ${showComments ? 'active' : ''}`} onClick={() => setShowComments((s) => !s)} aria-expanded={showComments}>
          💬 {count > 0 ? count : 'Comment'}
        </button>
        <div className="spacer" />
        <button className="btn primary small-btn" onClick={onWatched}>
          {manga ? '✓ Read it' : '✓ Watched it'}
        </button>
      </div>

      {showComments && (
        <div className="watch-thread">
          <Thread thread={`watch:${entry.listId}:${entry.anilistId}`} onCount={setCount} placeholder="e.g. Let's start this on Friday!" autoFocus />
        </div>
      )}
    </li>
  );
}
