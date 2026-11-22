import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { CATEGORIES, plural } from '../util.js';
import AddToListMenu from '../components/AddToListMenu.jsx';
import Avatar from '../components/Avatar.jsx';
import { ShipCover } from '../components/ShipBits.jsx';

function shipperTitle(t) {
  if (t.status.crack >= 0.4) return '🤡 Chaos captain';
  if (t.crossover >= 0.4) return '🌌 Crossover cartographer';
  if (t.rarepair >= 0.5) return '💎 Rarepair hunter';
  if (t.poly >= 0.4) return '🫶 The more the merrier';
  if (t.status.canon >= 0.6) return '💍 Canon loyalist';
  if (t.popular >= 0.5) return '🔥 Fleet admiral';
  return '💫 Fanon dreamer';
}

const pctText = (n) => `${Math.round(n * 100)}%`;

// "Your shipping type", from ships voted 💕 Ship it or 💍 OTP.
function ShippingType({ userId, isMe, name }) {
  const [t, setT] = useState(null);
  useEffect(() => {
    api
      .shippingType(userId)
      .then(setT)
      .catch(() => setT({ count: 0 }));
  }, [userId]);
  if (!t) return null;
  if (!t.count) {
    return (
      <div className="card shipping-type">
        <h3>💕 {isMe ? 'Your' : `${name}'s`} shipping type</h3>
        <p className="muted small">
          {isMe ? 'Vote 💕 Ship it or 💍 OTP on some ships (Lists → 💕 Ships) to find out.' : `${name} hasn't shipped anything yet.`}
        </p>
      </div>
    );
  }
  const bars = [
    ['💍 Canon', t.status.canon],
    ['💫 Fanon', t.status.fanon],
    ['🤡 Crack', t.status.crack],
    ['🌌 Crossover', t.crossover],
    ['💎 Rarepairs', t.rarepair],
    ['🔥 Popular', t.popular],
    ['🫶 3+ characters', t.poly],
  ];
  return (
    <div className="card shipping-type">
      <h3>💕 {isMe ? 'Your' : `${name}'s`} shipping type</h3>
      <div className="shipper-title">{shipperTitle(t)}</div>
      <p className="muted small">
        From {plural(t.count, 'ship')} {isMe ? 'you' : name} ship ({plural(t.otps, 'OTP')}).
        {t.ageGap != null && ` Average age gap: ${t.ageGap} years.`}
        {t.heightGap != null && ` Average height gap: ${t.heightGap} cm.`}
      </p>
      <div className="ship-bars">
        {bars.map(([label, v]) => (
          <div key={label} className="ship-bar-row">
            <span className="small">{label}</span>
            <span className="bar">
              <span style={{ width: pctText(v) }} />
            </span>
            <span className="muted tiny">{pctText(v)}</span>
          </div>
        ))}
      </div>
      <div className="mini-ship-row">
        {t.top.map((s) => (
          <a key={s.id} href={`#/ship/${s.id}`} className="mini-ship-tile" title={s.members.map((m) => m.name).join(' × ')}>
            <ShipCover ship={s} className="small" />
            <span className="tiny">{s.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

const GROUPS = [
  ['hair', 'Hair'],
  ['hairStyle', 'Hair style'],
  ['eyes', 'Eyes'],
  ['features', 'Features'],
  ['outfit', 'Style'],
  ['vibe', 'Vibe'],
];

const pct = (n) => `${Math.round(n * 100)}%`;

function Chip({ label, strength }) {
  return (
    <span className="trait-chip" title={`${pct(strength)} of the weighted pictures`}>
      {label}
      <span className="trait-bar">
        <span style={{ width: pct(Math.min(strength, 1)) }} />
      </span>
    </span>
  );
}

function headline(t) {
  const bits = [
    t.looks.hair?.[0]?.label,
    t.looks.eyes?.[0]?.label,
    t.looks.features?.[0]?.label,
    t.facts.age?.label,
    t.facts.height ? `~${t.facts.height.avg} cm` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

function Suggestions({ category }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.typeSuggest(category));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep checking while traits of candidates are still being worked out.
  useEffect(() => {
    if (!data?.pending) return undefined;
    const t = setTimeout(load, 12_000);
    return () => clearTimeout(t);
  }, [data, load]);

  const label = CATEGORIES[category].label;
  if (error) return <p className="error-text small">{error}</p>;
  if (!data) return <p className="muted small">Looking through the anime you've watched…</p>;
  if (data.reason === 'no-catalogue') {
    return <p className="muted small">Add anime you've watched under My anime to get suggestions from them.</p>;
  }
  return (
    <>
      {data.pending > 0 && (
        <p className="muted small">
          <span className="spinner inline-small" aria-hidden="true" /> Checking {plural(data.pending, 'more candidate')}… (updates by itself)
        </p>
      )}
      {data.results.length === 0 && !data.pending && <p className="muted small">No good match found among the anime you've watched yet.</p>}
      <ul className="suggest-list">
        {data.results.map((s) => (
          <li key={s.id}>
            <a href={`#/character/${s.id}`} className="suggest-img">
              {s.image && <img src={s.image} alt="" loading="lazy" />}
            </a>
            <div className="suggest-info">
              <a href={`#/character/${s.id}`} className="suggest-name">
                {s.name}
              </a>
              <span className="muted tiny">
                {s.anime?.title}
                {s.age ? ` · ${Math.round(s.age)}` : ''}
              </span>
              {s.reasons.length > 0 && <span className="tiny suggest-reasons">{s.reasons.join(' · ')}</span>}
            </div>
            <span className="match" title={`Matches your ${label} type`}>
              {s.match}%
            </span>
            <AddToListMenu kind="character" itemId={s.id} label="+" className="btn ghost small-btn" />
          </li>
        ))}
      </ul>
    </>
  );
}

function TypeCard({ t, isMe, name, other }) {
  const [showSuggest, setShowSuggest] = useState(false);
  const cat = CATEGORIES[t.category];
  const hasLooks = GROUPS.some(([g]) => t.looks[g]?.length);
  const sharedTraits =
    other &&
    GROUPS.flatMap(([g]) => (t.looks[g] ?? []).filter((x) => x.strength >= 0.25 && (other.looks[g] ?? []).some((y) => y.label === x.label && y.strength >= 0.25)).map((x) => x.label));
  const onlyMine = other && GROUPS.flatMap(([g]) => (t.looks[g] ?? []).filter((x) => x.strength >= 0.3 && !(other.looks[g] ?? []).some((y) => y.label === x.label)).map((x) => x.label)).slice(0, 4);
  const onlyTheirs = other && GROUPS.flatMap(([g]) => (other.looks[g] ?? []).filter((x) => x.strength >= 0.3 && !(t.looks[g] ?? []).some((y) => y.label === x.label)).map((x) => x.label)).slice(0, 4);

  return (
    <div className="card type-card">
      <div className="type-head">
        <span className="type-emoji">{cat.emoji}</span>
        <div>
          <h3>
            {isMe ? 'Your' : `${name}'s`} ideal {cat.label}
          </h3>
          <span className="muted tiny">
            From {plural(t.count, 'character')} in {t.lists.map((l) => l.name).join(', ')}
            {t.pending > 0 && ` · analysing ${t.pending} more…`}
          </span>
        </div>
      </div>

      {t.analysed > 0 && <p className="type-headline">{headline(t) || '—'}</p>}

      <div className="collage">
        {t.collage.map((c) => (
          <a key={c.id} href={`#/character/${c.id}`} title={c.name}>
            {c.image ? <img src={c.image} alt={c.name} loading="lazy" /> : <span className="img-placeholder">?</span>}
          </a>
        ))}
      </div>

      {t.analysed === 0 ? (
        <p className="muted small">Working out traits… this takes a little while the first time.</p>
      ) : (
        <>
          <h4>Looks</h4>
          {hasLooks ? (
            <div className="trait-groups">
              {GROUPS.filter(([g]) => t.looks[g]?.length).map(([g, label]) => (
                <div key={g} className="trait-group">
                  <span className="muted tiny">{label}</span>
                  <div className="trait-chips">
                    {t.looks[g].map((x) => (
                      <Chip key={x.label} {...x} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">No looks data found for these characters.</p>
          )}
          {t.withLooks < t.analysed && <p className="muted tiny">Looks based on {t.withLooks} of {t.analysed} characters (no fan art found for the rest).</p>}

          <h4>Profile</h4>
          <div className="fact-chips">
            {t.facts.gender.map((g) => (
              <span key={g.label} className="chip small">
                {g.label} {pct(g.strength)}
              </span>
            ))}
            {t.facts.age && (
              <span className="chip small">
                Age {t.facts.age.label} (avg {Math.round(t.facts.age.avg)}, {Math.round(t.facts.age.min)}–{Math.round(t.facts.age.max)})
              </span>
            )}
            {t.facts.height && <span className="chip small">~{t.facts.height.avg} cm</span>}
            {t.facts.zodiac && <span className="chip small">Mostly {t.facts.zodiac.label}</span>}
            {t.facts.bloodType && <span className="chip small">Blood type {t.facts.bloodType.label}</span>}
            {t.facts.mainShare != null && <span className="chip small">{pct(t.facts.mainShare)} main characters</span>}
          </div>

          <h4>Taste</h4>
          <div className="fact-chips">
            {t.taste.series.map((s) => (
              <a key={s.id} className="chip small" href={`#/anime/${s.id}`}>
                🎬 {s.title} {pct(s.strength)}
              </a>
            ))}
            {t.taste.genres.map((g) => (
              <span key={g.label} className="chip small">
                {g.label}
              </span>
            ))}
            <span className="chip small">{t.taste.popularity.label}</span>
          </div>
          {t.taste.voice && (
            <p className="small voice-line">
              🎙️ {isMe ? 'You have' : `${name} has`} a thing for <b>{t.taste.voice.name}</b>'s voice ({t.taste.voice.count} of them)
            </p>
          )}

          {other && (
            <div className="type-compare">
              <h4>
                vs <Avatar user={other.user} size={18} /> {other.user.username}
              </h4>
              <p className="small">
                {sharedTraits.length ? (
                  <>
                    💞 You both like: <b>{sharedTraits.join(', ')}</b>
                  </>
                ) : (
                  'No looks in common yet.'
                )}
              </p>
              {(onlyMine.length > 0 || onlyTheirs.length > 0) && (
                <p className="small muted">
                  {onlyMine.length > 0 && <>Only {isMe ? 'you' : name}: {onlyMine.join(', ')}. </>}
                  {onlyTheirs.length > 0 && <>Only {other.user.username}: {onlyTheirs.join(', ')}.</>}
                </p>
              )}
            </div>
          )}

          {isMe && (
            <div className="type-suggest">
              {showSuggest ? (
                <>
                  <h4>✨ Your next {cat.label}?</h4>
                  <Suggestions category={t.category} />
                </>
              ) : (
                <button className="btn primary" onClick={() => setShowSuggest(true)}>
                  ✨ Find your next {cat.label}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TypePage({ userId }) {
  const { me, users } = useApp();
  const isMe = userId === me.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [compareId, setCompareId] = useState('');
  const [other, setOther] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.types(userId));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // While traits are being worked out in the background, refresh now and then.
  useEffect(() => {
    if (!data?.pending) return undefined;
    const t = setTimeout(load, 10_000);
    return () => clearTimeout(t);
  }, [data, load]);

  useEffect(() => {
    if (!compareId) {
      setOther(null);
      return;
    }
    api
      .types(Number(compareId))
      .then(setOther)
      .catch(() => setOther(null));
  }, [compareId]);

  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const name = data.user.username;
  const others = users.filter((u) => u.id !== userId);

  if (data.categories.length === 0) {
    return (
      <>
      <div className="empty-state">
        <p className="muted">
          {isMe
            ? 'Your type is worked out from your Daddy, Mommy, Waifu and Husbando lists. Open a character list and set its category with the menu next to the list name (e.g. 👨 Daddy).'
            : `${name} has no Daddy/Mommy/Waifu/Husbando lists you can see yet.`}
        </p>
      </div>
      <ShippingType userId={userId} isMe={isMe} name={name} />
      </>
    );
  }

  return (
    <div className="type-page">
      <div className="type-toolbar">
        <p className="muted small">
          Built from {isMe ? 'your' : `${name}'s`} own rankings: higher-ranked characters count more. Looks come from fan-art tags, so
          they're approximate.
        </p>
        {others.length > 0 && (
          <label className="compare-picker small">
            <span className="muted">Compare with</span>
            <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
              <option value="">nobody</option>
              {others.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me.id ? 'me' : u.username}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {data.pending > 0 && (
        <div className="banner info">
          <span>
            <span className="spinner inline-small" aria-hidden="true" /> Analysing {plural(data.pending, 'character')}. This page
            updates by itself.
          </span>
        </div>
      )}
      <div className="type-grid">
        {data.categories.map((t) => (
          <TypeCard
            key={t.category}
            t={t}
            isMe={isMe}
            name={name}
            other={other ? { user: other.user, ...(other.categories.find((c) => c.category === t.category) ?? { looks: {} }) } : null}
          />
        ))}
      </div>
      <ShippingType userId={userId} isMe={isMe} name={name} />
    </div>
  );
}
