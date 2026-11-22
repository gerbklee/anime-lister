import { useState } from 'react';

// 0.5–5 star rating. Each star has a left (half) and right (full) tap area.
// Tapping the current value again clears the rating.
export default function Stars({ value, onChange, size = 20, readOnly = false }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value ?? 0;
  const label = value ? `${value} of 5 stars` : 'Not rated';

  return (
    <span
      className={`stars ${readOnly ? 'read-only' : ''}`}
      style={{ fontSize: size }}
      onMouseLeave={() => setHover(null)}
      role={readOnly ? 'img' : 'group'}
      aria-label={label}
      title={readOnly ? label : undefined}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = shown >= i ? 100 : shown >= i - 0.5 ? 50 : 0;
        return (
          <span key={i} className="star">
            ★
            <span className="star-fill" style={{ width: `${fill}%` }} aria-hidden="true">
              ★
            </span>
            {!readOnly && (
              <>
                <button
                  type="button"
                  className="star-hit left"
                  aria-label={`${i - 0.5} stars`}
                  onMouseEnter={() => setHover(i - 0.5)}
                  onClick={() => onChange(value === i - 0.5 ? null : i - 0.5)}
                />
                <button
                  type="button"
                  className="star-hit right"
                  aria-label={`${i} stars`}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => onChange(value === i ? null : i)}
                />
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}
