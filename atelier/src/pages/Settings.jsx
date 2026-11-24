import { useEffect, useState } from 'react';
import { api, hubUrl } from '../api.js';
import { useApp } from '../App.jsx';
import { MusicSettings } from '../components/Music.jsx';
import AppSection from '../components/AppSection.jsx';

export default function Settings() {
  const { profile, setProfile, critiqueInfo, toast, theme, setTheme, user } = useApp();
  const [f, setF] = useState(null);
  const [confirm18, setConfirm18] = useState(false);
  useEffect(() => {
    if (profile) setF({ ...profile, critiqueCapDollars: (profile.critiqueCap / 100).toFixed(2) });
  }, [profile]);
  if (!f) return <p className="muted">Loading…</p>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async () => {
    const patch = {
      dailyMinutes: f.dailyMinutes,
      weekDays: f.weekDays,
      dayMinutes: f.dayMinutes,
      planWhen: f.planWhen,
      planWhere: f.planWhere,
      reminderAt: f.reminderAt,
      focusMinutes: f.focusMinutes,
      breakMinutes: f.breakMinutes,
      critiqueCap: Math.round(Number(f.critiqueCapDollars) * 100),
    };
    const r = await api.saveProfile(patch);
    setProfile(r.profile);
    toast('Saved');
  };
  const setAdult = async (on) => {
    const r = await api.saveProfile({ adultTrack: on, confirm18: on ? confirm18 : false });
    setProfile(r.profile);
    toast(on ? (r.profile.adultTrack ? 'Adult track on' : 'Couldn’t turn it on') : 'Adult track off');
  };
  const logout = async () => {
    await api.logout();
    window.location.reload();
  };

  return (
    <div style={{ maxWidth: 720, marginTop: 10 }}>
      <div className="kicker">Your plan</div>
      <h1>Settings</h1>

      <section className="card section">
        <h3>Your drawing plan</h3>
        <p className="small muted">A concrete “when and where” makes you far more likely to actually sit down and draw.</p>
        <div className="grid-2">
          <label className="field">
            When
            <input type="text" placeholder="After dinner" value={f.planWhen} onChange={set('planWhen')} />
          </label>
          <label className="field">
            Where
            <input type="text" placeholder="At my desk with the tablet" value={f.planWhere} onChange={set('planWhere')} />
          </label>
        </div>
        <p className="small" style={{ marginTop: 10 }}>
          <em>“{f.planWhen || 'When …'}{f.planWhere ? `, ${f.planWhere}` : ''}, I draw.”</em>
        </p>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <label className="field">
            Daily session (minutes)
            <input type="number" min="10" max="300" value={f.dailyMinutes} onChange={set('dailyMinutes')} />
          </label>
          <label className="field">
            Reminder (push, if you haven’t drawn yet)
            <input type="time" value={f.reminderAt} onChange={set('reminderAt')} />
          </label>
        </div>
        <p className="tiny muted">Reminders use Anime Hub’s notifications: turn them on there (Profile → Notifications) on each device.</p>
      </section>

      <section className="card section">
        <h3>Weekly target</h3>
        <p className="small muted">Weeks, not days: a missed day doesn’t break anything. You get two grace days a month for short weeks.</p>
        <div className="grid-2">
          <label className="field">
            Days per week
            <input type="number" min="1" max="7" value={f.weekDays} onChange={set('weekDays')} />
          </label>
          <label className="field">
            Minutes that count as a day
            <input type="number" min="5" max="240" value={f.dayMinutes} onChange={set('dayMinutes')} />
          </label>
        </div>
      </section>

      <section className="card section">
        <h3>Focus timer</h3>
        <div className="grid-2">
          <label className="field">
            Focus block (minutes)
            <input type="number" min="5" max="180" value={f.focusMinutes} onChange={set('focusMinutes')} />
          </label>
          <label className="field">
            Break (minutes)
            <input type="number" min="1" max="60" value={f.breakMinutes} onChange={set('breakMinutes')} />
          </label>
        </div>
      </section>

      <section className="card section">
        <h3>Music (Spotify)</h3>
        <p className="small muted">A small Spotify player in the corner of Atelier that follows the focus timer: your focus playlist starts with a block, the break playlist (or a pause) comes with the bell.</p>
        <MusicSettings />
      </section>

      <section className="card section">
        <h3>Critiques</h3>
        {critiqueInfo?.available ? (
          <p className="small muted">
            By Claude, about 5¢ each. This month: ${critiqueInfo.spent.toFixed(2)} of ${critiqueInfo.cap.toFixed(2)}.
          </p>
        ) : (
          <p className="small muted">Not set up: the server needs an ANTHROPIC_API_KEY.</p>
        )}
        <label className="field" style={{ maxWidth: 240 }}>
          Monthly budget ($)
          <input type="number" min="0" max="100" step="0.5" value={f.critiqueCapDollars} onChange={set('critiqueCapDollars')} />
        </label>
      </section>

      <div className="row section">
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>

      <section className="card section">
        <h3>Your data</h3>
        <p className="small muted">Download your whole sketchbook as one archive: every drawing, reference and original .clip file with readable names, plus a spreadsheet (index.csv) with dates, lessons, scores and critiques. Large sketchbooks take a while.</p>
        <a className="btn small" href="/api/atelier/export">
          Download everything (.tar)
        </a>
      </section>

      <section className="card section">
        <h3>App</h3>
        <AppSection />
      </section>

      <section className="card section">
        <h3>Look</h3>
        <div className="seg">
          {[
            ['auto', 'Like my device'],
            ['light', 'Paper'],
            ['dark', 'Night'],
          ].map(([k, l]) => (
            <button key={k} className={theme === k ? 'active' : ''} onClick={() => setTheme(k)}>
              {l}
            </button>
          ))}
        </div>
      </section>

      <section className="card section">
        <h3>Adult track (18+)</h3>
        {!profile.adultAllowed ? (
          <p className="small muted">
            Life drawing, pin-up and nude illustration of adult characters. It needs Spicy or Explicit art turned on in <a href={hubUrl()}>Anime Hub</a> (Profile → Spicy art) first.
          </p>
        ) : profile.adultTrack ? (
          <>
            <p className="small">On. Its units appear on the path as you reach the stages they build on. All references are of adult characters only, using your Anime Hub adult settings.</p>
            <button className="btn small" onClick={() => setAdult(false)}>
              Turn off
            </button>
          </>
        ) : (
          <>
            <p className="small muted">Eight units: life drawing, adult proportions, pin-up posing, sensual expression, skin and light, clothing and reveal, nude illustration and an adult portfolio. Adult characters only.</p>
            <label className="row small" style={{ gap: 8, cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" checked={confirm18} onChange={(e) => setConfirm18(e.target.checked)} /> I’m 18 or older and want to see nude and sexual art references.
            </label>
            <button className="btn small" disabled={!confirm18} onClick={() => setAdult(true)}>
              Turn on the adult track
            </button>
          </>
        )}
      </section>

      <section className="card section row" style={{ justifyContent: 'space-between' }}>
        <span className="small">
          Logged in as <strong>{user.username}</strong> (same account as Anime Hub)
        </span>
        <button className="btn small" onClick={logout}>
          Log out
        </button>
      </section>
    </div>
  );
}
