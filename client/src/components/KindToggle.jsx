// The list-type switch at the top of the Lists sidebar (watchlists included).
const KINDS = [
  ['character', '👤', 'Characters'],
  ['anime', '🎬', 'Anime'],
  ['manga', '📖', 'Manga'],
  ['ship', '💕', 'Ships'],
  ['watchlist', '🍿', 'Watch'],
];

export default function KindToggle({ active, onSwitch }) {
  return (
    <div className="segmented kind-toggle" role="tablist" aria-label="List type">
      {KINDS.map(([key, emoji, label]) => (
        <button key={key} type="button" role="tab" aria-selected={active === key} className={active === key ? 'active' : ''} onClick={() => onSwitch(key)}>
          <span aria-hidden="true">{emoji}</span> {label}
        </button>
      ))}
    </div>
  );
}
