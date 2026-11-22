import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { animeMeta, plural } from '../util.js';
import Avatar from '../components/Avatar.jsx';
import Stars from '../components/Stars.jsx';
import AddToListMenu from '../components/AddToListMenu.jsx';
import { ShipCover, StatusBadge } from '../components/ShipBits.jsx';
import { VOTES } from '../util.js';

function ShipRow({ ship, me, them, otherName }) {
  return (
    <li className="ship-compare-row">
      <a href={`#/ship/${ship.id}`} className="mini-ship">
        <ShipCover ship={ship} className="small" />
        <span>
          <b>{ship.name}</b>
          <span className="muted tiny">{ship.members.map((m) => m.name).join(' × ')}</span>
          <StatusBadge status={ship.status} />
        </span>
      </a>
      <span className="ship-compare-votes small">
        {me != null && (
          <span title={`You: ${VOTES[me].label}`}>
            You {VOTES[me].emoji}
          </span>
        )}
        {them != null && (
          <span title={`${otherName}: ${VOTES[them].label}`}>
            {otherName} {VOTES[them].emoji}
          </span>
        )}
      </span>
    </li>
  );
}

function ShipList({ title, rows, emptyText, otherName }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <ul className="ship-compare">
          {rows.map((r) => (
            <ShipRow key={r.ship.id} ship={r.ship} me={r.me} them={r.them} otherName={otherName} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShipsTab({ data, me, other }) {
  const s = data.stats;
  const n = other.username;
  return (
    <>
      <ScoreCard
        me={me}
        other={other}
        score={s.score}
        label={s.score >= 70 ? 'Shipping soulmates 💞' : s.score >= 40 ? 'Mostly on the same ship' : s.both ? 'Rival fleets ⚔️' : 'Vote on some ships first'}
        details={[[plural(s.both, 'ship') + ' you both voted on', s.similarity != null ? `${Math.round(s.similarity * 100)}% similar votes` : null].filter(Boolean)]}
        explain="Shipping match: 40% how many of the same ships you voted on, 60% how close your votes are."
      />
      <div className="compare-grid">
        <ShipList title="💕 You both ship it" rows={data.bothLove} otherName={n} emptyText="No ship you both love yet." />
        <ShipList title="⚔️ Ship wars" rows={data.wars} otherName={n} emptyText="No big disagreements. Suspicious." />
        <ShipList
          title={`🙋 Only you (${n} hasn't voted)`}
          rows={data.onlyMine.map((x) => ({ ship: x.ship, me: x.vote }))}
          otherName={n}
          emptyText="Nothing here."
        />
        <ShipList
          title={`🙋 Only ${n} (you haven't voted)`}
          rows={data.onlyTheirs.map((x) => ({ ship: x.ship, them: x.vote }))}
          otherName={n}
          emptyText="Nothing here."
        />
      </div>
    </>
  );
}

const placementText = (p) => `#${p.rank} of ${p.listSize} · ${p.listName}`;
const pct = (n) => `${Math.round(n * 100)}%`;
// Must match CLOSE in server/src/compare.js.
const CLOSE = 0.15;

function Portrait({ src, name, small }) {
  return src ? (
    <img className={`portrait ${small ? 'small' : ''}`} src={src} alt={name} loading="lazy" />
  ) : (
    <div className={`portrait img-placeholder ${small ? 'small' : ''}`} aria-hidden="true">
      ?
    </div>
  );
}

function Verdict({ diff, otherName }) {
  if (diff >= CLOSE) return <span className="verdict me">▲ You rank higher</span>;
  if (diff <= -CLOSE) return <span className="verdict them">▲ {otherName} ranks higher</span>;
  return <span className="verdict same">≈ Same</span>;
}

function BothRow({ c, otherName, isAnime }) {
  return (
    <li className="compare-row">
      <Portrait src={c.image} name={c.name} />
      <div className="compare-info">
        <div className="entry-name">
          <a href={isAnime ? `#/anime/${c.anilistId}` : `#/character/${c.anilistId}`}>{c.name}</a>
        </div>
        <div className="series">{c.seriesTitle || ''}</div>
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

function MiniList({ title, items, emptyText, isAnime }) {
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
                <a className="mini-name" href={isAnime ? `#/anime/${c.anilistId}` : `#/character/${c.anilistId}`}>
                  {c.name}
                </a>
                <div className="muted small">{placementText(c.placement)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Bars({ title, items, valueOf, labelOf, formatValue }) {
  const max = Math.max(0.0001, ...items.map(valueOf));
  return (
    <div className="series-col">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="muted small">Nothing yet.</p>
      ) : (
        <ul className="series-bars">
          {items.map((s) => (
            <li key={labelOf(s)}>
              <div className="series-bar-label">
                <span className="series-bar-title">{labelOf(s)}</span>
                <span className="muted small">{formatValue(s)}</span>
              </div>
              <div className="series-bar">
                <div style={{ width: `${(valueOf(s) / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreCard({ me, other, score, label, details, explain }) {
  return (
    <div className="card score-card">
      <div className="score-people">
        <Avatar user={me} size={36} />
        <span className="muted">vs</span>
        <Avatar user={other} size={36} />
      </div>
      <div className="score-value">{score}%</div>
      <div className="score-label">{label}</div>
      {details.map((row, i) => (
        <div className="score-details muted small" key={i}>
          {row.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      ))}
      <p className="muted small score-explain">{explain}</p>
    </div>
  );
}

// Ranking comparison for character lists or anime lists.
function ListComparison({ data, me, other, kind }) {
  const s = data.stats;
  const otherName = other.username;
  const isAnime = kind === 'anime';
  const word = isAnime ? 'anime' : 'character';
  const words = isAnime ? 'anime' : 'characters';
  return (
    <>
      <ScoreCard
        me={me}
        other={other}
        score={s.score}
        label={isAnime ? 'anime list match' : 'character taste match'}
        details={[
          [`${plural(s.sharedCount, word, words)} in common`, `Overlap ${pct(s.overlap)}`, `Ranking similarity ${s.sharedCount ? pct(s.rankSimilarity) : '–'}`],
          [
            `You: ${plural(s.mine.items, word, words)} in ${plural(s.mine.lists, 'list')}`,
            `${otherName}: ${plural(s.theirs.items, word, words)} in ${plural(s.theirs.lists, 'list')}`,
          ],
        ]}
        explain={`40% overlap (how many ${words} you share, relative to the smaller collection) + 60% how similarly you rank the ones you share.`}
      />

      {data.both.length > 0 && (
        <div className="compare-grid">
          <div className="card compare-card">
            <h3>🤝 You agree most on</h3>
            {data.agreements.length === 0 && <p className="muted small">Nothing you rank about the same yet.</p>}
            <ul className="compare-rows">
              {data.agreements.map((c) => (
                <BothRow key={c.anilistId} c={c} otherName={otherName} isAnime={isAnime} />
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
                  <BothRow key={c.anilistId} c={c} otherName={otherName} isAnime={isAnime} />
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
          <p className="muted small">Nothing in common yet.</p>
        ) : (
          <ul className="compare-rows">
            {data.both.map((c) => (
              <BothRow key={c.anilistId} c={c} otherName={otherName} isAnime={isAnime} />
            ))}
          </ul>
        )}
      </div>

      <div className="compare-grid">
        <MiniList title="Only you ranked" items={data.onlyMine} emptyText="Nothing: they have all of yours." isAnime={isAnime} />
        <MiniList title={`Only ${otherName} ranked`} items={data.onlyTheirs} emptyText="Nothing: you have all of theirs." isAnime={isAnime} />
      </div>
    </>
  );
}

function CharacterTab({ data, me, other }) {
  const otherName = other.username;
  return (
    <>
      <ListComparison data={data} me={me} other={other} kind="character" />
      <div className="card compare-card">
        <h3>📺 Favourite series (from character lists)</h3>
        <div className="series-grid">
          <Bars title="You" items={data.favouriteSeries.mine} valueOf={(s) => s.count} labelOf={(s) => s.title} formatValue={(s) => s.count} />
          <Bars title={otherName} items={data.favouriteSeries.theirs} valueOf={(s) => s.count} labelOf={(s) => s.title} formatValue={(s) => s.count} />
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
  );
}

function RatingRow({ r, otherName }) {
  return (
    <li className="compare-row">
      <Portrait src={r.anime.cover} name={r.anime.title} />
      <div className="compare-info">
        <div className="entry-name">
          <a href={`#/anime/${r.anime.id}`}>{r.anime.title}</a>
        </div>
        <div className="placements">
          <span className="rating-line">
            <b>You:</b> <Stars value={r.me} readOnly size={14} />
          </span>
          <span className="rating-line">
            <b>{otherName}:</b> <Stars value={r.them} readOnly size={14} />
          </span>
        </div>
      </div>
    </li>
  );
}

function AnimeTab({ data, me, other, manga = false }) {
  const c = data.catalogue;
  const s = c.stats;
  const otherName = other.username;
  return (
    <>
      <ScoreCard
        me={me}
        other={other}
        score={s.score}
        label={manga ? 'manga taste match' : 'anime taste match'}
        details={[
          [`${plural(s.bothSeen, 'anime', 'anime')} you've both seen`, `Overlap ${pct(s.overlap)}`, `Rating similarity ${s.ratingSimilarity == null ? '–' : pct(s.ratingSimilarity)}`],
          [`You: ${s.mine.seen} seen, ${s.mine.rated} rated`, `${otherName}: ${s.theirs.seen} seen, ${s.theirs.rated} rated`],
        ]}
        explain="40% overlap (anime you've both watched or are watching, relative to the smaller catalogue) + 60% how similarly you rate them. Dropped anime don't count as seen."
      />

      {c.recommendations.length > 0 && (
        <div className="card compare-card">
          <h3>✨ {otherName} loved these and you haven't seen them</h3>
          <ul className="rec-grid">
            {c.recommendations.map((r) => (
              <li key={r.anime.id} className="rec">
                <a href={`#/anime/${r.anime.id}`}>{r.anime.cover && <img src={r.anime.cover} alt="" loading="lazy" />}</a>
                <div className="rec-info">
                  <a href={`#/anime/${r.anime.id}`} className="mini-name">
                    {r.anime.title}
                  </a>
                  <span className="muted tiny">{animeMeta(r.anime)}</span>
                  <Stars value={r.rating} readOnly size={14} />
                  <AddToListMenu kind="watchlist" itemId={r.anime.id} label="🍿 Watchlist" className="btn ghost small-btn" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.bothRated.length > 0 && (
        <div className="compare-grid">
          <div className="card compare-card">
            <h3>🤝 Rated the same</h3>
            {c.agreements.length === 0 ? (
              <p className="muted small">No anime you rate within half a star of each other yet.</p>
            ) : (
              <ul className="compare-rows">
                {c.agreements.map((r) => (
                  <RatingRow key={r.anime.id} r={r} otherName={otherName} />
                ))}
              </ul>
            )}
          </div>
          <div className="card compare-card">
            <h3>⚔️ Biggest rating disagreements</h3>
            {c.disagreements.length === 0 ? (
              <p className="muted small">No big disagreements (1.5 stars or more). 💞</p>
            ) : (
              <ul className="compare-rows">
                {c.disagreements.map((r) => (
                  <RatingRow key={r.anime.id} r={r} otherName={otherName} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="card compare-card">
        <h3>
          Rated by both of you <span className="muted small">({c.bothRated.length})</span>
        </h3>
        {c.bothRated.length === 0 ? (
          <p className="muted small">Rate anime you've both seen to compare here.</p>
        ) : (
          <ul className="compare-rows">
            {c.bothRated.map((r) => (
              <RatingRow key={r.anime.id} r={r} otherName={otherName} />
            ))}
          </ul>
        )}
      </div>

      <div className="card compare-card">
        <h3>🎭 Favourite genres</h3>
        <p className="muted tiny">Share of each person's catalogue, weighted by rating (unrated anime count as 3 stars).</p>
        <div className="series-grid">
          <Bars title="You" items={c.genres.mine} valueOf={(g) => g.share} labelOf={(g) => g.genre} formatValue={(g) => pct(g.share)} />
          <Bars title={otherName} items={c.genres.theirs} valueOf={(g) => g.share} labelOf={(g) => g.genre} formatValue={(g) => pct(g.share)} />
          <div className="series-col">
            <h4>💞 You both love</h4>
            {c.genres.shared.length === 0 ? (
              <p className="muted small">No genres in common yet.</p>
            ) : (
              <ul className="series-shared">
                {c.genres.shared.map((g) => (
                  <li key={g.genre}>
                    <span className="series-bar-title">{g.genre}</span>
                    <span className="muted small">
                      you {pct(g.mine)} · {otherName} {pct(g.theirs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <h3 className="section-title">📋 {manga ? 'Manga' : 'Anime'} lists</h3>
      <ListComparison data={data.lists} me={me} other={other} kind="anime" />
    </>
  );
}

export default function ComparePage() {
  const { me, users } = useApp();
  const others = users.filter((u) => u.id !== me.id);
  const [withId, setWithId] = useState(null);
  const [tab, setTab] = useState('characters');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const selectedId = withId ?? others[0]?.id ?? null;

  useEffect(() => {
    if (selectedId == null) return undefined;
    let cancelled = false;
    setLoading(true);
    const req =
      tab === 'characters'
        ? api.compare(selectedId, 'character')
        : tab === 'ships'
          ? api.compareShips(selectedId)
          : api.compareAnime(selectedId, tab === 'manga' ? 'MANGA' : 'ANIME');
    req
      .then((d) => {
        if (cancelled) return;
        setData({ tab, ...d });
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId, tab]);

  if (others.length === 0) {
    return (
      <section className="compare">
        <h2>Compare</h2>
        <div className="empty-state">
          <p className="muted">Nobody else has an account yet. Once someone signs up, you can compare your tastes here.</p>
        </div>
      </section>
    );
  }

  const ready = data && data.tab === tab && data.other?.id === selectedId;

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

      <div className="tabs compact" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'characters'} className={tab === 'characters' ? 'active' : ''} onClick={() => setTab('characters')}>
          👤 Characters
        </button>
        <button type="button" role="tab" aria-selected={tab === 'anime'} className={tab === 'anime' ? 'active' : ''} onClick={() => setTab('anime')}>
          🎬 Anime
        </button>
        <button type="button" role="tab" aria-selected={tab === 'manga'} className={tab === 'manga' ? 'active' : ''} onClick={() => setTab('manga')}>
          📖 Manga
        </button>
        <button type="button" role="tab" aria-selected={tab === 'ships'} className={tab === 'ships' ? 'active' : ''} onClick={() => setTab('ships')}>
          💕 Ships
        </button>
      </div>

      <p className="muted small">
        {tab === 'characters'
          ? "Uses everyone's character lists (shared lists with each person's own ranking). When a character is in several of your lists, their best placement counts, adjusted for list length."
          : tab === 'ships'
            ? 'Uses your Ship-o-meter votes on the Ship board.'
            : `Uses everyone's ${tab} catalogue (status and ratings) and their ${tab} lists.`}
      </p>

      {error && <div className="banner error">{error}</div>}

      {ready && tab === 'characters' && <CharacterTab data={data} me={me} other={data.other} />}
      {ready && tab === 'ships' && <ShipsTab data={data} me={me} other={data.other} />}
      {ready && (tab === 'anime' || tab === 'manga') && <AnimeTab data={data} me={me} other={data.other} manga={tab === 'manga'} />}
    </section>
  );
}
