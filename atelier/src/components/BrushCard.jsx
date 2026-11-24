import { useState } from 'react';

const SLOT_ICON = { sketch: '✎', line: '✒', erase: '⌫', colour: '◧', paint: '🖌', world: '☁', manga: '▦' };

// One brush of the kit, folded until opened: what it's for and where to find
// it, then how to set it up, how to use it, and what to avoid.
export default function BrushCard({ b, open: initial = false, showStages = false }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="guide brush-card">
      <button className="guide-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="guide-icon brush-icon" aria-hidden="true">
          {SLOT_ICON[b.slot] ?? '🖌'}
        </span>
        <span style={{ flex: 1 }}>
          <strong>{b.name}</strong>
          {b.isNew && <span className="chip sage" style={{ marginLeft: 8 }}>new in this stage</span>}
          <span className="chip" style={{ marginLeft: 8 }}>{b.asset ? 'download' : 'built in'}</span>
          {showStages && <span className="chip" style={{ marginLeft: 8 }}>{b.from != null ? `from Stage ${b.from}` : `${b.tracks?.[0] ? `${b.tracks[0]} track` : b.track ? `${b.track[0].toUpperCase()}${b.track.slice(1)} track` : 'track'}`}</span>}
          <br />
          <span className="small muted">{b.where}</span>
        </span>
        <span className="muted" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="guide-body">
          <p style={{ margin: '0 0 10px' }}>{b.use}</p>
          {b.asset && (
            <p className="small" style={{ margin: '0 0 10px' }}>
              <a href={b.asset.url} target="_blank" rel="noreferrer">
                {b.asset.title}
                {b.asset.by ? ` by ${b.asset.by}` : ''} on Clip Studio Assets ↗
              </a>
            </p>
          )}
          <h4 className="brush-h">Set it up</h4>
          <ol>
            {b.setup.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <h4 className="brush-h">How to use it</h4>
          <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
            {b.how.map((s) => (
              <li key={s} style={{ marginBottom: 4 }}>
                {s}
              </li>
            ))}
          </ul>
          {b.avoid?.length > 0 && (
            <ul className="mistakes small" style={{ paddingLeft: 20 }}>
              {b.avoid.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {b.alt?.length > 0 && (
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              If you’d rather (pick one and stick with it):{' '}
              {b.alt.map((a, i) => (
                <span key={a.name}>
                  {i > 0 && '; '}
                  {a.asset ? (
                    <a href={a.asset.url} target="_blank" rel="noreferrer">
                      {a.name} ↗
                    </a>
                  ) : (
                    a.name
                  )}{' '}
                  ({a.note})
                </span>
              ))}
            </p>
          )}
          {showStages && b.stages?.length > 0 && (
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>
              Used in Stage {b.stages.join(', ')}
              {b.tracks?.length ? ` · tracks: ${b.tracks.join(', ')}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
