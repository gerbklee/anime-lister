import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

const placementText = (p) => `#${p.rank} of ${p.listSize} · ${p.listName}`;
const pct = (n) => `${Math.round(n * 100)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Must match CLOSE in server/src/compare.js.
const CLOSE = 0.15;

function Portrait({ src, name, small }) {
  return src ? (
    <img className={`portrait ${small ? 'small' : ''}`} src={src} alt={name} loading="lazy" />
  ) : (
    <div className={`portrait img-placeholder ${small ? 'small' : ''}`} aria-hidden="true">?</div>
  );
}

function Verdict({ diff, otherName }) {
  if (diff >= CLOSE) return <span className="verdict me">▲ You rank higher</span>;
  if (diff <= -CLOSE) return <span className="verdict them">▲ {otherName} ranks higher</span>;
  return <span className="verdict same">≈ Same</span>;
}

function BothRow({ c, otherName }) {
  return (
    <li className="compare-row">
      <Portrait src={c.image} name={c.name} />
      <div className="compare-info">
        <div className="entry-name">{c.name}</div>
        <div className="series">{c.seriesTitle || 'Unknown series'}</div>
        <div className="placements">
          <span>
            <b>You:</b> {placementText(c.me)}
          </span>
          <span>
            <b>{otherName}:</b> {placementText(c.them)}
          </span>
        </div>
      </div>
      <Verdict diff={c.diff} otherName={otherName} />
    </li>
  );
}

function MiniList({ title, items, emptyText }) {
  return (
    <div className="card compare-card">
      <h3>
        {title} <span className="muted small">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <ul className="mini-list">
          {items.map((c) => (
            <li key={c.anilistId}>
              <Portrait src={c.image} name={c.name} small />
              <div className="compare-info">
                <div className="mini-name">{c.name}</div>
                <div className="muted small">{placementText(c.placement)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeriesBars({ title, items }) {
  const max = Math.max(1, ...items.map((s) => s.count));
  return (
    <div className="series-col">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="muted small">No characters yet.</p>
      ) : (
        <ul className="series-bars">
          {items.map((s) => (
            <li key={s.title}>
              <div className="series-bar-label">
                <span className="series-bar-title">{s.title}</span>
                <span className="muted small">{s.count}</span>
              </div>
              <div className="series-bar">
                <div style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ComparePage({ me, users }) {
  const others = users.filter((u) => u.id !== me.id);
  const [withId, setWithId] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const firstOtherId = others[0]?.id ?? null;
  const selectedId = withId ?? firstOtherId;

  useEffect(() => {
    if (selectedId == null) return undefined;
    let cancelled = false;
    setLoading(true);
    api
      .compare(selectedId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (others.length === 0) {
    return (
      <section className="compare">
        <h2>Compare</h2>
        <div className="empty-state">
          <p className="muted">Nobody else has an account yet. Once someone signs up, you can compare your rankings here.</p>
        </div>
      </section>
    );
  }

  const other = data?.other;
  const otherName = other?.username ?? '';
  const s = data?.stats;

  return (
    <section className="compare">
      <div className="compare-header">
        <h2>Compare</h2>
        <label className="compare-picker">
          <span className="muted">You vs</span>
          <select value={selectedId ?? ''} onChange={(e) => setWithId(Number(e.target.value))} aria-label="Compare with">
            {others.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </label>
        {loading && <span className="muted small">Updating…</span>}
      </div>
      <p className="muted small">
        Uses everyone's personal lists (shared lists are left out). When a character is in several of your lists, their
        best placement counts, adjusted for list length.
      </p>

      {error && <div className="banner error">{error}</div>}

      {data && other?.id === selectedId && (
        <>
          <div className="card score-card">
            <div className="score-people">
              <Avatar user={me} size={36} />
              <span className="muted">vs</span>
              <Avatar user={other} size={36} />
            </div>
            <div className="score-value">{s.score}%</div>
            <div className="score-label">taste match</div>
            <div className="score-details muted small">
              <span>{s.sharedCount} characters in common</span>
              <span>Overlap {pct(s.overlap)}</span>
              <span>Ranking similarity {s.sharedCount ? pct(s.rankSimilarity) : '–'}</span>
            </div>
            <div className="score-details muted small">
              <span>
                You: {plural(s.mine.characters, 'character')} in {plural(s.mine.lists, 'list')}
              </span>
              <span>
                {otherName}: {plural(s.theirs.characters, 'character')} in {plural(s.theirs.lists, 'list')}
              </span>
            </div>
            <p className="muted small score-explain">
              40% overlap (how many characters you share, relative to the smaller collection) + 60% how similarly you
              rank the ones you share.
            </p>
          </div>

          {data.both.length > 0 && (
            <div className="compare-grid">
              <div className="card compare-card">
                <h3>🤝 You agree most on</h3>
                {data.agreements.length === 0 && (
                  <p className="muted small">No characters you rank about the same yet.</p>
                )}
                <ul className="compare-rows">
                  {data.agreements.map((c) => (
                    <BothRow key={c.anilistId} c={c} otherName={otherName} />
                  ))}
                </ul>
              </div>
              <div className="card compare-card">
                <h3>⚔️ Biggest disagreements</h3>
                {data.disagreements.length === 0 ? (
                  <p className="muted small">You rank everything you share almost the same. 💞</p>
                ) : (
                  <ul className="compare-rows">
                    {data.disagreements.map((c) => (
                      <BothRow key={c.anilistId} c={c} otherName={otherName} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="card compare-card">
            <h3>
              Ranked by both of you <span className="muted small">({data.both.length})</span>
            </h3>
            {data.both.length === 0 ? (
              <p className="muted small">No characters in common yet.</p>
            ) : (
              <ul className="compare-rows">
                {data.both.map((c) => (
                  <BothRow key={c.anilistId} c={c} otherName={otherName} />
                ))}
              </ul>
            )}
          </div>

          <div className="compare-grid">
            <MiniList title="Only you ranked" items={data.onlyMine} emptyText="Nothing: they have all of yours." />
            <MiniList title={`Only ${otherName} ranked`} items={data.onlyTheirs} emptyText="Nothing: you have all of theirs." />
          </div>

          <div className="card compare-card">
            <h3>📺 Favourite series</h3>
            <div className="series-grid">
              <SeriesBars title="You" items={data.favouriteSeries.mine} />
              <SeriesBars title={otherName} items={data.favouriteSeries.theirs} />
              <div className="series-col">
                <h4>💞 You both love</h4>
                {data.favouriteSeries.shared.length === 0 ? (
                  <p className="muted small">No series in common yet.</p>
                ) : (
                  <ul className="series-shared">
                    {data.favouriteSeries.shared.map((x) => (
                      <li key={x.title}>
                        <span className="series-bar-title">{x.title}</span>
                        <span className="muted small">
                          you {x.mine} · {otherName} {x.theirs}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
