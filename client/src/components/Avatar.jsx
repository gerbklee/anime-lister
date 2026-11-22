import { useApp } from '../AppContext.jsx';

// Small coloured circle with a user's initial. The colour is stable per user.
export function userColor(id) {
  return `hsl(${(id * 137) % 360} 55% 48%)`;
}

// Shows the user's profile photo, or their initial if they haven't picked one.
export default function Avatar({ user, size = 20, title }) {
  const app = useApp();
  if (!user) return null;
  const current = app?.usersById?.get(user.id) ?? user;
  const label = title ?? current.username;
  const style = { width: size, height: size, fontSize: size * 0.55 };
  if (current.avatar) {
    return <img className="avatar photo" src={current.avatar} alt={label} title={label} style={style} />;
  }
  return (
    <span className="avatar" style={{ ...style, background: userColor(current.id) }} title={label} aria-label={label}>
      {current.username.charAt(0).toUpperCase()}
    </span>
  );
}
