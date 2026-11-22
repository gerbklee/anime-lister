import { useState } from 'react';
import { api } from '../api.js';
import ThemeToggle from './ThemeToggle.jsx';

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (isSignup && password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = isSignup ? await api.register(username.trim(), password) : await api.login(username.trim(), password);
      onAuthed(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setConfirm('');
  };

  return (
    <div className="auth-page">
      <div className="auth-theme">
        <ThemeToggle />
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h1 className="logo auth-logo">
          <span className="logo-mark" aria-hidden="true">✦</span> Anime Hub
        </h1>

        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? 'active' : ''} onClick={() => switchMode('login')}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? 'active' : ''} onClick={() => switchMode('signup')}>
            Sign up
          </button>
        </div>

        <label className="field">
          <span>Username</span>
          <input
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {isSignup && (
          <label className="field">
            <span>Repeat password</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
        )}

        {error && <p className="error-text">{error}</p>}

        <button className="btn primary wide" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'}
        </button>
        {isSignup && <p className="muted small">At least 6 characters. You'll stay logged in on this device.</p>}
      </form>
    </div>
  );
}
