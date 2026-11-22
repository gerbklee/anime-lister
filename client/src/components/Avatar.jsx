// Small coloured circle with a user's initial. The colour is stable per user.
export function userColor(id) {
  return `hsl(${(id * 137) % 360} 55% 48%)`;
}

export default function Avatar({ user, size = 20, title }) {
  if (!user) return null;
  return (
    <span
      className="avatar"
      style={{ background: userColor(user.id), width: size, height: size, fontSize: size * 0.55 }}
      title={title ?? user.username}
      aria-label={title ?? user.username}
    >
      {user.username.charAt(0).toUpperCase()}
    </span>
  );
}
