import { useEffect, useState } from 'react';

// Light / Dark / Auto (follow the phone). Lives in Settings.
function savedChoice() {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

const systemTheme = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export default function ThemeToggle() {
  const [choice, setChoice] = useState(savedChoice);

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = choice === 'auto' ? systemTheme() : choice;
    };
    apply();
    try {
      if (choice === 'auto') localStorage.removeItem('theme');
      else localStorage.setItem('theme', choice);
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
    if (choice !== 'auto' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [choice]);

  const options = [
    ['light', '☀️ Light'],
    ['dark', '🌙 Dark'],
    ['auto', '📱 Auto'],
  ];
  return (
    <div className="segmented" role="radiogroup" aria-label="Appearance">
      {options.map(([key, label]) => (
        <button key={key} type="button" role="radio" aria-checked={choice === key} className={choice === key ? 'active' : ''} onClick={() => setChoice(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
