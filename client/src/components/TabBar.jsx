const TABS = [
  { key: 'lists', href: '#/lists', icon: '📋', label: 'Lists' },
  { key: 'anime', href: '#/anime', icon: '🎬', label: 'Anime' },
  { key: 'discover', href: '#/discover', icon: '🧭', label: 'Discover' },
  { key: 'watch', href: '#/watch', icon: '🍿', label: 'Watchlists' },
  { key: 'feed', href: '#/feed', icon: '📰', label: 'Feed' },
  { key: 'compare', href: '#/compare', icon: '📊', label: 'Compare' },
];

// Tab band under the header on desktop; app-style bottom bar on phones.
export default function TabBar({ active }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <a
          key={t.key}
          href={t.href}
          className={`tab ${active === t.key ? 'active' : ''}`}
          aria-current={active === t.key ? 'page' : undefined}
        >
          <span className="tab-icon" aria-hidden="true">
            {t.icon}
          </span>
          <span className="tab-label">{t.label}</span>
        </a>
      ))}
    </nav>
  );
}
