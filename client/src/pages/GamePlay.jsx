import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../AppContext.jsx';
import Avatar from '../components/Avatar.jsx';

const LIMIT_MS = 15000;

function Media({ q, onReady }) {
  const videoRef = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const [sharp, setSharp] = useState(false);

  useEffect(() => {
    setSharp(false);
    const t = setTimeout(() => setSharp(true), 50); // start the un-blur transition
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (q.kind !== 'opening') return undefined;
    const v = videoRef.current;
    if (!v) return undefined;
    v.currentTime = q.start ?? 0;
    v.play()
      .then(() => onReady?.())
      .catch(() => setBlocked(true));
    const stop = () => v.currentTime > (q.start ?? 0) + 15 && v.pause();
    v.addEventListener('timeupdate', stop);
    return () => v.removeEventListener('timeupdate', stop);
  }, [q, onReady]);

  if (q.kind === 'opening') {
    return (
      <div className="game-media opening">
        {/* The picture is hidden so it doesn't give the anime away. */}
        <video ref={videoRef} src={q.video} playsInline preload="auto" className="hidden-video" />
        <div className="vinyl" aria-hidden="true">
          🎵
        </div>
        {blocked && (
          <button
            className="btn primary"
            onClick={() => {
              videoRef.current?.play().then(() => setBlocked(false));
            }}
          >
            ▶ Play clip
          </button>
        )}
      </div>
    );
  }
  if (q.kind === 'character' || (q.kind === 'ranked' && q.image)) {
    return (
      <div className="game-media">
        <img src={q.image} alt="" className={`game-image ${q.kind === 'character' ? (sharp ? 'unblur' : 'blur') : ''}`} referrerPolicy="no-referrer" />
      </div>
    );
  }
  if (q.kind === 'higherlower') {
    return (
      <div className="game-media hl">
        <div className="hl-item">
          {q.a.cover && <img src={q.a.cover} alt="" />}
          <b>{q.a.title}</b>
          <span className="hl-value">{q.a.value.toLocaleString()} users</span>
        </div>
        <span className="battle-vs">vs</span>
        <div className="hl-item">
          {q.b.cover && <img src={q.b.cover} alt="" />}
          <b>{q.b.title}</b>
          <span className="hl-value">?</span>
        </div>
      </div>
    );
  }
  return null;
}

function Results({ game, me }) {
  const answers = game.myAnswers ?? [];
  const done = game.players.every((p) => p.finished);
  const best = Math.max(...game.players.map((p) => p.score ?? 0));
  return (
    <div className="game-results">
      <div className="scoreboard">
        {game.players.map((p) => (
          <div key={p.user?.id} className={`score-player ${done && p.score === best ? 'winner' : ''}`}>
            <Avatar user={p.user} size={44} />
            <b>{p.user?.id === me.id ? 'You' : p.user?.username}</b>
            {p.finished ? (
              <>
                <span className="score-points">{p.score ?? '?'}</span>
                <span className="muted tiny">
                  {p.correct ?? '?'} / {p.total} right
                </span>
              </>
            ) : (
              <span className="muted small">hasn't played yet</span>
            )}
            {done && p.score === best && <span className="pill">🏆</span>}
          </div>
        ))}
      </div>
      <h4>Your answers</h4>
      <ol className="answer-list">
        {game.questions.map((q, i) => {
          const a = answers[i] ?? {};
          const chosen = q.options.find((o) => String(o.id) === String(a.choice));
          return (
            <li key={i} className={a.correct ? 'right' : 'wrong'}>
              <span>{a.correct ? '✅' : '❌'}</span>
              <div>
                <div className="small">{q.prompt}</div>
                <div className="tiny muted">
                  {a.correct ? 'Right' : `You: ${chosen?.label ?? 'no answer'}`} · {q.reveal}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <a className="btn ghost" href="#/us/games">
        ← All games
      </a>
    </div>
  );
}

export default function GamePlay({ id }) {
  const { me } = useApp();
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(-1); // -1 = intro
  const [answers, setAnswers] = useState([]);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .game(id)
      .then(setGame)
      .catch((err) => setError(err.message));
  }, [id]);

  const q = game && index >= 0 ? game.questions[index] : null;

  const submit = useCallback(
    async (all) => {
      setSubmitting(true);
      try {
        setGame(await api.answerGame(id, all));
      } catch (err) {
        setError(err.message);
      } finally {
        setSubmitting(false);
      }
    },
    [id],
  );

  const answer = useCallback(
    (choice) => {
      if (!game || index < 0) return;
      const next = [...answers, { choice, ms: Date.now() - startedAt }];
      setAnswers(next);
      if (index + 1 >= game.questions.length) {
        setIndex(game.questions.length);
        submit(next);
      } else {
        setIndex(index + 1);
        setStartedAt(Date.now());
      }
    },
    [game, index, answers, startedAt, submit],
  );

  // Countdown; unanswered questions are skipped after 15 s.
  useEffect(() => {
    if (!q) return undefined;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [q]);
  useEffect(() => {
    if (q && now - startedAt > LIMIT_MS) answer(null);
  }, [now, q, startedAt, answer]);

  const onMediaReady = useCallback(() => setStartedAt(Date.now()), []);

  if (error) return <div className="banner error">{error}</div>;
  if (!game) return <p className="muted">Loading…</p>;
  if (game.myAnswers) return <Results game={game} me={me} />;

  if (index < 0) {
    return (
      <div className="card game-intro">
        <h2>{game.label}</h2>
        <p>
          {game.questions.length} questions. Each correct answer is worth 100 points, plus up to 100 more for answering fast
          (within 15 seconds).
        </p>
        <p className="muted small">
          Your score is shown to the others once they've played too.
          {game.type === 'opening' && ' Turn your sound on!'}
        </p>
        <button
          className="btn primary wide"
          onClick={() => {
            setIndex(0);
            setStartedAt(Date.now());
          }}
        >
          Start
        </button>
      </div>
    );
  }

  if (!q) return <p className="muted">{submitting ? 'Counting your points…' : 'Done!'}</p>;
  const left = Math.max(0, LIMIT_MS - (now - startedAt));

  return (
    <div className="game-play">
      <div className="game-progress">
        <span className="muted small">
          Question {index + 1} / {game.questions.length}
        </span>
        <div className="timer">
          <div style={{ width: `${(left / LIMIT_MS) * 100}%` }} />
        </div>
      </div>
      <h3 className="game-prompt">{q.prompt}</h3>
      <Media q={q} onReady={onMediaReady} key={index} />
      <div className={`game-options ${q.options.length === 2 ? 'two' : ''}`}>
        {q.options.map((o) => (
          <button key={o.id} type="button" className="game-option" onClick={() => answer(o.id)}>
            {o.image && <img src={o.image} alt="" />}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
