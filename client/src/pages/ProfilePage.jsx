import { useApp } from '../AppContext.jsx';
import Avatar from '../components/Avatar.jsx';
import AnimePage from './AnimePage.jsx';
import SettingsPage from './SettingsPage.jsx';

// Your profile: "My anime" (catalogue) and Settings.
// Other people's profiles show their anime (read-only).
export default function ProfilePage({ route, onLogout }) {
  const { me, users } = useApp();
  const userId = route.userId ?? me.id;
  const isMe = userId === me.id;
  const user = isMe ? me : users.find((u) => u.id === userId);
  const view = isMe ? route.view ?? 'anime' : 'anime';

  return (
    <section className="profile">
      <div className="profile-header">
        <Avatar user={user ?? { id: userId, username: '?' }} size={56} />
        <div>
          <h2>{isMe ? 'My profile' : `${user?.username ?? 'Someone'}'s profile`}</h2>
          {isMe ? (
            <span className="muted small">{me.username}</span>
          ) : (
            <a className="link-btn small" href="#/profile">
              ← Back to my profile
            </a>
          )}
        </div>
      </div>

      <div className="tabs compact" role="tablist">
        <a href={isMe ? '#/profile' : `#/profile/u/${userId}`} role="tab" aria-selected={view === 'anime'} className={`tab-link ${view === 'anime' ? 'active' : ''}`}>
          🎬 {isMe ? 'My anime' : `${user?.username ?? 'Their'}'s anime`}
        </a>
        {isMe && (
          <a href="#/profile/settings" role="tab" aria-selected={view === 'settings'} className={`tab-link ${view === 'settings' ? 'active' : ''}`}>
            ⚙️ Settings
          </a>
        )}
      </div>

      {view === 'anime' ? <AnimePage key={userId} userId={userId} /> : <SettingsPage onLogout={onLogout} />}
    </section>
  );
}
