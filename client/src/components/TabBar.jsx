const TABS = [
  { key: 'home', href: '#/', icon: '🏠', label: 'Home' },
  { key: 'lists', href: '#/lists', icon: '📋', label: 'Lists' },
  { key: 'discover', href: '#/discover', icon: '🧭', label: 'Discover' },
  { key: 'art', href: '#/art', icon: '🎨', label: 'Art' },
  { key: 'us', href: '#/us', icon: '💞', label: 'Us' },
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
