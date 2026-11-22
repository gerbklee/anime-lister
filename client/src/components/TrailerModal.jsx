import Modal from './Modal.jsx';

export function embedUrl(trailer, { api = false } = {}) {
  if (trailer.site === 'dailymotion') return `https://www.dailymotion.com/embed/video/${encodeURIComponent(trailer.id)}?autoplay=1`;
  const extra = api ? `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}` : '';
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.id)}?autoplay=1&rel=0${extra}`;
}

export default function TrailerModal({ trailer, title, onClose }) {
  return (
    <Modal title={`Trailer · ${title}`} onClose={onClose} wide>
      <div className="video-frame">
        <iframe
          src={embedUrl(trailer)}
          title={`${title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </Modal>
  );
}
