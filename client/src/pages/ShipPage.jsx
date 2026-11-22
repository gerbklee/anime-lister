import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import { SHIP_STATUS, VOTES, compactCount, timeAgo } from '../util.js';
import AddToListMenu from '../components/AddToListMenu.jsx';
import Menu from '../components/Menu.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';
import Reactions from '../components/Reactions.jsx';
import Thread from '../components/Thread.jsx';
import FanartBrowser from '../components/FanartBrowser.jsx';
import { PopularityBadge, ShipCover, ShipOMeter, isWar } from '../components/ShipBits.jsx';

const HC_EMOJIS = ['❤️', '😂', '😳', '🔥'];

function Headcanon({ h, onDelete }) {
  const { me } = useApp();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(h.commentCount);
  return (
    <li className="headcanon card">
      <div className="headcanon-head">
        <Avatar user={h.user} size={24} />
        <b>{h.user?.id === me.id ? 'You' : h.user?.username}</b>
        <span className="muted tiny">{timeAgo(h.createdAt)}</span>
        <div className="spacer" />
        {h.user?.id === me.id && (
          <button type="button" className="icon-btn danger" onClick={() => onDelete(h)} aria-label="Delete headcanon" title="Delete">
            ✕
          </button>
        )}
      </div>
      <p className="headcanon-body">{h.body}</p>
      <div className="entry-social">
        <Reactions target={h.thread} initial={h.reactions} emojis={HC_EMOJIS} />
        <button type="button" className="link-btn small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          💬 {count > 0 ? count : 'Reply'}
        </button>
      </div>
      {open && <Thread thread={h.thread} onCount={setCount} placeholder="Reply…" autoFocus />}
    </li>
  );
}

// Cover picker: saved picks and fan art of the ship, tap one to select it.
function FanartPicker({ ship, onClose, onPicked }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    try {
      onPicked(await api.updateShip(ship.id, { coverUrl: selected }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Pick a cover" onClose={onClose} wide>
      <FanartBrowser subject={`ship:${ship.id}`} subjectName={ship.name} selected={selected} onSelect={setSelected} />
      {error && <div className="banner error">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!selected || busy} onClick={save}>
          {busy ? "Saving…" : "Use as cover"}
        </button>
      </div>
    </Modal>
  );
}

function FanartGallery({ ship, onCover }) {
  const actions = [
    { icon: "🖼️", label: "Use as ship cover", onSelect: async (item, url) => onCover(await api.updateShip(ship.id, { coverUrl: url })) },
    { icon: "↗️", label: "Open full size", onSelect: (item, url) => window.open(url, "_blank", "noopener") },
  ];
  return (
    <div className="card">
      <FanartBrowser
        title={`🎨 Fan art${ship.fanartCount != null ? ` · ${compactCount(ship.fanartCount)}` : ""}`}
        subject={`ship:${ship.id}`}
        subjectName={ship.name}
        actions={actions}
      />
    </div>
  );
}

export default function ShipPage({ id }) {
  const { me, navigate } = useApp();
  const [ship, setShip] = useState(null);
  const [error, setError] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [picking, setPicking] = useState(false);
  const [hcText, setHcText] = useState('');
  const [busy, setBusy] = useState(false);
  const [threadCount, setThreadCount] = useState(null);

  const load = useCallback(() => {
    api
      .ship(id)
      .then(setShip)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !ship) return <div className="banner error">{error}</div>;
  if (!ship) return <p className="muted">Loading…</p>;

  const merge = (next) => setShip((s) => ({ ...s, ...next }));
  const patch = async (p) => {
    try {
      merge(await api.updateShip(ship.id, p));
    } catch (err) {
      setError(err.message);
    }
  };

  const saveName = async () => {
    setEditingName(false);
    const name = nameDraft.trim();
    if (name && name !== ship.name) await patch({ name });
  };

  const postHeadcanon = async (e) => {
    e.preventDefault();
    if (!hcText.trim() || busy) return;
    setBusy(true);
    try {
      await api.addHeadcanon(ship.id, hcText.trim());
      setHcText('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteHeadcanon = async (h) => {
    if (!window.confirm('Delete this headcanon?')) return;
    await api.deleteHeadcanon(h.id).catch((err) => setError(err.message));
    load();
  };

  const deleteShip = async () => {
    if (!window.confirm(`Sink the ship “${ship.name}”? Votes, headcanons and list entries go with it.`)) return;
    try {
      await api.deleteShip(ship.id);
      navigate('#/ships');
    } catch (err) {
      setError(err.message);
    }
  };

  const war = isWar(ship);
  const canDelete = !ship.createdBy || ship.createdBy.id === me.id;

  return (
    <section className="ship-page">
      <a href="#/ships" className="back-link">
        ← Ship board
      </a>
      <div className="ship-hero card">
        <div className="ship-hero-cover">
          <button type="button" className="cover-btn" onClick={() => setPicking(true)} title="Change cover" aria-label="Change cover">
            <ShipCover ship={ship} className="large" />
            <span className="cover-edit" aria-hidden="true">
              🖼️
            </span>
          </button>
        </div>
        <div className="ship-hero-text">
          {editingName ? (
            <input
              className="list-name-input"
              autoFocus
              maxLength={60}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditingName(false);
              }}
              aria-label="Ship name"
            />
          ) : (
            <h2
              className="list-name editable"
              title="Click to rename"
              onClick={() => {
                setNameDraft(ship.name);
                setEditingName(true);
              }}
            >
              {ship.name}
            </h2>
          )}
          <div className="ship-members-row">
            {ship.members.map((m, i) => (
              <span key={m.id} className="builder-member">
                {i > 0 && <span className="ship-x">×</span>}
                <a className="builder-chip" href={`#/character/${m.id}`}>
                  <img src={m.image} alt="" referrerPolicy="no-referrer" />
                  <span>
                    {m.name}
                    {m.series && <span className="muted tiny"> · {m.series}</span>}
                  </span>
                </a>
              </span>
            ))}
          </div>
          <div className="ship-badges">
            <div className="segmented small" role="radiogroup" aria-label="Status">
              {Object.entries(SHIP_STATUS).map(([key, s]) => (
                <button key={key} type="button" role="radio" aria-checked={ship.status === key} className={ship.status === key ? 'active' : ''} onClick={() => patch({ status: key })} title={s.hint}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
            <PopularityBadge ship={ship} />
          </div>

          <h4>Your vote</h4>
          <ShipOMeter ship={ship} onChange={merge} />

          <div className={`ship-votes ${war ? 'at-war' : ''}`}>
            {war && <div className="war-banner">⚔️ Ship war! You don’t agree on this one.</div>}
            {ship.votes.map((v) => (
              <div key={v.user?.id} className="ship-vote-row">
                <Avatar user={v.user} size={24} />
                <span>{v.user?.id === me.id ? 'You' : v.user?.username}</span>
                <span className="vote-meter" aria-hidden="true">
                  {VOTES.map((x) => (
                    <span key={x.value} className={x.value <= v.vote ? 'on' : ''} />
                  ))}
                </span>
                <b>
                  {VOTES[v.vote].emoji} {VOTES[v.vote].label}
                </b>
              </div>
            ))}
          </div>

          <div className="char-actions">
            <AddToListMenu kind="ship" itemId={ship.id} label="+ OTP list" />
            <Menu
              title={ship.name}
              className="icon-btn menu-trigger bordered"
              items={[
                { icon: '🖼️', label: 'Change cover', onSelect: () => setPicking(true) },
                {
                  icon: '✏️',
                  label: 'Rename',
                  onSelect: () => {
                    setNameDraft(ship.name);
                    setEditingName(true);
                  },
                },
                canDelete && 'divider',
                canDelete && { icon: '⚓', label: 'Sink ship (delete)', danger: true, onSelect: deleteShip },
              ]}
            />
          </div>
          {ship.createdBy && (
            <p className="muted tiny">
              Shipped by {ship.createdBy.id === me.id ? 'you' : ship.createdBy.username} · {timeAgo(ship.createdAt)}
            </p>
          )}
        </div>
      </div>
      {error && <div className="banner error">{error}</div>}

      <div className="anime-columns">
        <div className="anime-col">
          <div className="card">
            <h3>💭 Headcanons</h3>
            <form className="headcanon-form" onSubmit={postHeadcanon}>
              <textarea
                rows={2}
                maxLength={1000}
                value={hcText}
                onChange={(e) => setHcText(e.target.value)}
                placeholder={`What do ${ship.members.map((m) => m.name.split(' ')[0]).join(' and ')} do on a Sunday?`}
              />
              <button className="btn primary" type="submit" disabled={!hcText.trim() || busy}>
                Post
              </button>
            </form>
            {ship.headcanons.length === 0 ? (
              <p className="muted small">No headcanons yet.</p>
            ) : (
              <ul className="headcanons">
                {ship.headcanons.map((h) => (
                  <Headcanon key={h.id} h={h} onDelete={deleteHeadcanon} />
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>💬 Talk about it {threadCount ? <span className="muted small">({threadCount})</span> : null}</h3>
            <Thread thread={`ship:${ship.id}`} onCount={setThreadCount} placeholder={`Defend ${ship.name}…`} />
          </div>
        </div>

        <div className="anime-col">
          <FanartGallery ship={ship} onCover={merge} />
          {ship.lists.length > 0 && (
            <div className="card">
              <h3>In OTP lists</h3>
              <div className="char-chips">
                {ship.lists.map((l) => (
                  <a key={l.list.id} className="char-chip" href={`#/list/${l.list.id}`}>
                    <span>
                      <b>
                        #{l.rank} <span className="muted small">of {l.list.size}</span>
                      </b>
                      <span className="muted tiny">
                        {l.list.name}
                        {l.owner && l.owner.id !== me.id && ` · ${l.owner.username}`}
                        {l.list.isShared && ' · 👥'}
                      </span>
                    </span>
                    {l.owner && <Avatar user={l.owner} size={20} />}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {picking && (
        <FanartPicker
          ship={ship}
          onClose={() => setPicking(false)}
          onPicked={(next) => {
            merge(next);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}
