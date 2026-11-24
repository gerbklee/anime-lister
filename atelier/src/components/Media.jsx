import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Examples for a lesson: recommended YouTube videos (embedded on click, from
// youtube-nocookie.com) and GIFs, videos and pictures from Wikimedia Commons,
// each credited with its author and licence.

function YouTube({ v }) {
  const [play, setPlay] = useState(false);
  return (
    <figure className="media-video">
      {play ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`}
          title={v.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button className="media-play" onClick={() => setPlay(true)} aria-label={`Play: ${v.title}`}>
          <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
          <span className="media-play-icon" aria-hidden="true">
            ▶
          </span>
        </button>
      )}
      <figcaption className="tiny">
        <strong>{v.title}</strong>
        <br />
        <span className="muted">{v.channel} · YouTube</span>
      </figcaption>
    </figure>
  );
}

function Tile({ it, onOpen }) {
  return (
    <figure className="media-tile">
      {it.kind === 'video' ? (
        <video src={it.src} poster={it.thumb} muted loop playsInline controls preload="none" />
      ) : (
        <button className="media-img" onClick={() => onOpen(it)} aria-label={`Open: ${it.title}`}>
          <img src={it.thumb} alt={it.title} loading="lazy" />
          {it.kind === 'gif' && <span className="media-badge">GIF</span>}
        </button>
      )}
      <figcaption className="tiny muted">
        {it.title}
        {it.author ? ` · ${it.author}` : ''}
        {it.license ? ` · ${it.license}` : ''}
      </figcaption>
    </figure>
  );
}

export default function Media({ lessonId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let live = true;
    api
      .lessonMedia(lessonId)
      .then((d) => live && setData(d))
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [lessonId]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <section className="section">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Examples</h3>
        <span className="tiny muted">GIFs and videos first · from Wikimedia Commons{data?.youtube ? ' and YouTube' : ''}</span>
      </div>
      {!data && !err && <p className="small muted">Finding examples… (the first time can take a few seconds)</p>}
      {err && <p className="small muted">Examples couldn’t be loaded right now.</p>}
      {data && (
        <>
          {data.videos?.length > 0 && (
            <div className="media-videos">
              {data.videos.map((v) => (
                <YouTube key={v.id} v={v} />
              ))}
            </div>
          )}
          {data.items.length > 0 ? (
            <div className="media-grid">
              {data.items.map((it) => (
                <Tile key={it.page} it={it} onOpen={setOpen} />
              ))}
            </div>
          ) : (
            <p className="small muted">No examples found for this lesson yet.</p>
          )}
          {!data.youtube && (
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Videos from the recommended creators appear here once a YouTube API key is set on the server (YOUTUBE_API_KEY); until then, use the links under “Watch & read”.
            </p>
          )}
        </>
      )}
      {open && (
        <div className="modal-back" onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label={open.title}>
          <div className="card modal" style={{ width: 'min(1000px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <img src={open.src} alt={open.title} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 12, background: 'var(--paper-2)' }} />
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
              <span className="small">
                <strong>{open.title}</strong>
                <span className="muted">
                  {open.author ? ` · ${open.author}` : ''}
                  {open.license ? ` · ${open.license}` : ''}
                </span>
              </span>
              <div className="row">
                <a className="btn small" href={open.page} target="_blank" rel="noreferrer">
                  On Wikimedia Commons ↗
                </a>
                <button className="btn small primary" onClick={() => setOpen(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
