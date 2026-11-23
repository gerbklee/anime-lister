import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, subjectHref } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { plural } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import Reactions from '../components/Reactions.jsx';
import { ArtResults, adaptItem, staticStream, useEagle } from '../components/ArtSearch.jsx';

// Everything you both saved, newest first.
// goSearch(chips): "More like this" and friends start a search in the Art tab.
export default function GalleryPage({ tools, goSearch }) {
  const { me, users } = useApp();
  const [by, setBy] = useState('');
  const [subject, setSubject] = useState('');
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const params = useCallback((extra = {}) => Object.fromEntries(Object.entries({ by, subject, ...extra }).filter(([, v]) => v)), [by, subject]);

  useEffect(() => {
    setData(null);
    api
      .gallery(params())
      .then((d) => {
        setData(d);
        setSubjects(d.subjects);
      })
      .catch((err) => setError(err.message));
  }, [params]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const d = await api.gallery(params({ before: data.nextBefore }));
      setData((cur) => ({ ...d, items: [...cur.items, ...d.items] }));
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = (item) => setData((d) => ({ ...d, items: d.items.filter((x) => x.savedId !== item.savedId) }));
  const unsave = async (item) => {
    await api.unsaveFanart(item.savedId);
    remove(item);
  };
  const hide = async (item) => {
    if (!window.confirm('Hide this picture for both of you? It will also be removed from the gallery.')) return;
    await api.hideFanart(item, item.subjectName);
    remove(item);
  };

  const items = data?.items ?? [];
  const adapted = useMemo(() => items.map(adaptItem), [items]);
  const eagle = useEagle();
  const total = subjects.reduce((s, x) => s + x.count, 0);

  return (
    <div className="gallery-page">
      <div className="gallery-head">
        <div>
          <h3>🖼️ Our gallery</h3>
          <p className="muted small">
            {total ? `${plural(total, 'picture')} of ${plural(subjects.length, 'character or ship', 'characters and ships')}` : 'Pictures you save on character and ship pages show up here.'}
          </p>
        </div>
      </div>
      <div className="gallery-filters">
        <div className="chip-row" role="tablist" aria-label="Saved by">
          <button type="button" className={`chip ${by === '' ? 'active' : ''}`} onClick={() => setBy('')}>
            Everyone
          </button>
          {users.map((u) => (
            <button key={u.id} type="button" className={`chip ${by === String(u.id) ? 'active' : ''}`} onClick={() => setBy(String(u.id))}>
              {u.id === me.id ? 'Mine' : `${u.username}'s`}
            </button>
          ))}
        </div>
        {subjects.length > 1 && (
          <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Character or ship">
            <option value="">All characters & ships</option>
            {subjects.map((s) => (
              <option key={s.subject} value={s.subject}>
                {s.subject.startsWith('ship:') ? '💕 ' : ''}
                {s.name} ({s.count})
              </option>
            ))}
          </select>
        )}
      </div>
      {subject && (
        <a className="link-btn small" href={subjectHref(subject)}>
          Open {subjects.find((s) => s.subject === subject)?.name} →
        </a>
      )}
      {error && <div className="banner error">{error}</div>}
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <ArtResults
            stream={staticStream(adapted)}
            size={160}
            tools={tools}
            eagle={eagle}
            onSearch={goSearch}
            emptyText="Nothing saved yet. Open a character or ship, find a picture you love and tap ♡ Save."
            extraActions={[
              { icon: '💔', label: 'Remove from gallery', onSelect: unsave },
              { icon: '🙈', label: 'Hide for both of you', onSelect: hide },
            ]}
            renderInfo={(item) => (
              <>
                <p className="small">
                  {item.savedBy && (
                    <>
                      <Avatar user={item.savedBy} size={18} /> saved by {item.savedBy.username}
                    </>
                  )}
                  {item.subject && (
                    <>
                      {' · '}
                      <a href={subjectHref(item.subject)}>{item.subjectName ?? 'Open'}</a>
                    </>
                  )}
                </p>
                {item.savedId && <Reactions target={`fanart:${item.savedId}`} initial={item.reactions} emojis={['❤️', '😂', '😳', '🔥']} />}
              </>
            )}
          />
          {data.nextBefore && (
            <button type="button" className="btn ghost wide load-more" onClick={more} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
