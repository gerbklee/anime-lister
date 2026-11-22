import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { timeAgo } from '../util.js';
import Avatar from './Avatar.jsx';
import Reactions from './Reactions.jsx';

// A comment thread with a reply box. `onCount` reports the number of comments.
export default function Thread({ thread, onCount, placeholder = 'Write a comment…', autoFocus = false }) {
  const { me } = useApp();
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .comments(thread)
      .then((c) => !cancelled && setComments(c))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [thread]);

  const update = (next) => {
    setComments(next);
    onCount?.(next.length);
  };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      update(await api.addComment(thread, body));
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await api.deleteComment(c.id);
      update(comments.filter((x) => x.id !== c.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="thread">
      {comments === null && !error && <p className="muted small">Loading comments…</p>}
      {comments?.map((c) => (
        <div className="comment" key={c.id}>
          <Avatar user={c.user} size={26} />
          <div className="comment-body">
            <div className="comment-head">
              <b>{c.user?.username ?? 'unknown'}</b>
              <span className="muted small">{timeAgo(c.createdAt)}</span>
              {c.user?.id === me.id && (
                <button className="link-btn small" onClick={() => remove(c)}>
                  delete
                </button>
              )}
            </div>
            <p className="comment-text">{c.body}</p>
            <Reactions target={`comment:${c.id}`} initial={c.reactions} />
          </div>
        </div>
      ))}
      <form className="comment-form" onSubmit={send}>
        <textarea
          rows={1}
          value={text}
          maxLength={2000}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
        />
        <button className="btn primary" type="submit" disabled={!text.trim() || busy}>
          Send
        </button>
      </form>
      {error && <p className="error-text small">{error}</p>}
    </div>
  );
}
