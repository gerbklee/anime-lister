import Modal from './Modal.jsx';

// Phones only allow videos to start by themselves when they are muted, so on
// touch devices the trailer autoplays muted (tap the speaker for sound).
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function embedUrl(trailer, { api = false } = {}) {
  const mute = isTouch() ? '&mute=1' : '';
  if (trailer.site === 'dailymotion') {
    return `https://www.dailymotion.com/embed/video/${encodeURIComponent(trailer.id)}?autoplay=1&playsinline=1${mute}`;
  }
  const extra = api ? `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}` : '';
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.id)}?autoplay=1&playsinline=1&rel=0${mute}${extra}`;
}

export default function TrailerModal({ trailer, title, onClose }) {
  return (
    <Modal title={`Trailer · ${title}`} onClose={onClose} wide center>
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
