import { useApp } from '../AppContext.jsx';
import Avatar from '../components/Avatar.jsx';
import AnimePage from './AnimePage.jsx';
import SettingsPage from './SettingsPage.jsx';
import TypePage from './TypePage.jsx';

// Your profile: "My anime" (catalogue), "My type" and Settings.
// Other people's profiles show their anime and type (read-only).
export default function ProfilePage({ route, onLogout }) {
  const { me, users } = useApp();
  const userId = route.userId ?? me.id;
  const isMe = userId === me.id;
  const user = isMe ? me : users.find((u) => u.id === userId);
  const name = user?.username ?? 'Someone';
  const view = route.view === 'settings' && !isMe ? 'anime' : route.view ?? 'anime';
  const base = isMe ? '#/profile' : `#/profile/u/${userId}`;

  const tabs = [
    ['anime', base, `🎬 ${isMe ? 'My anime' : `${name}'s anime`}`],
    ['type', `${base}/type`, `💘 ${isMe ? 'My type' : `${name}'s type`}`],
    ...(isMe ? [['settings', '#/profile/settings', '⚙️ Settings']] : []),
  ];

  let content;
  if (view === 'type') content = <TypePage key={userId} userId={userId} />;
  else if (view === 'settings') content = <SettingsPage onLogout={onLogout} />;
  else content = <AnimePage key={userId} userId={userId} />;

  return (
    <section className="profile">
      <div className="profile-header">
        <Avatar user={user ?? { id: userId, username: '?' }} size={56} />
        <div>
          <h2>{isMe ? 'My profile' : `${name}'s profile`}</h2>
          {isMe ? (
            <span className="muted small">{me.username}</span>
          ) : (
            <a className="link-btn small" href="#/profile">
              ← Back to my profile
            </a>
          )}
        </div>
      </div>

      <div className="tabs compact profile-tabs" role="tablist">
        {tabs.map(([key, href, label]) => (
          <a key={key} href={href} role="tab" aria-selected={view === key} className={`tab-link ${view === key ? 'active' : ''}`}>
            {label}
          </a>
        ))}
      </div>

      {content}
    </section>
  );
}
