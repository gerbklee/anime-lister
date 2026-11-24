import { useEffect, useState } from 'react';
import { subscribeUploads } from '../api.js';

const mb = (b) => `${(b / 1048576).toFixed(b > 10485760 ? 0 : 1)} MB`;

// One bar for every upload: file name, percent, MB, then "reading layers"
// while the server unpacks a .clip, or a clear error.
export default function UploadStatus() {
  const [s, setS] = useState(null);
  useEffect(
    () =>
      subscribeUploads((x) => {
        setS(x);
        if (x.phase === 'done') setTimeout(() => setS((cur) => (cur?.phase === 'done' ? null : cur)), 1500);
        if (x.phase === 'error') setTimeout(() => setS((cur) => (cur?.phase === 'error' ? null : cur)), 8000);
      }),
    [],
  );
  if (!s) return null;
  const pct = s.total ? Math.round((s.loaded / s.total) * 100) : 0;
  return (
    <div className={`upload-status ${s.phase}`} role="status" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
        <strong className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
          {s.name}
        </strong>
        <span className="tiny">
          {s.phase === 'upload' && `${pct}% · ${mb(s.loaded)} of ${mb(s.total)}`}
          {s.phase === 'processing' && (s.clip ? 'Reading Clip Studio layers…' : 'Saving…')}
          {s.phase === 'done' && '✓ Saved'}
        </span>
      </div>
      {s.phase === 'error' ? (
        <p className="tiny" style={{ margin: '4px 0 0' }}>
          {s.message}
        </p>
      ) : (
        <div className="meter" style={{ marginTop: 6 }}>
          <span className={s.phase === 'processing' ? 'indeterminate' : ''} style={{ width: `${s.phase === 'upload' ? pct : 100}%` }} />
        </div>
      )}
    </div>
  );
}
