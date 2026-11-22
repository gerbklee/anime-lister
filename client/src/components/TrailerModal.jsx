import Modal from './Modal.jsx';

function embedUrl(trailer) {
  if (trailer.site === 'dailymotion') return `https://www.dailymotion.com/embed/video/${encodeURIComponent(trailer.id)}?autoplay=1`;
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.id)}?autoplay=1&rel=0`;
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
