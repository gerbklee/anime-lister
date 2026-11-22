// Games for two. A challenge has a fixed set of questions; each player plays it
// once on their own device and the results are compared.
//
// Types:
//   opening     – an OP/ED clip plays, pick the anime (AnimeThemes)
//   character   – a blurred character picture, pick the name
//   ranked      – questions about the other person's lists and ratings
//   higherlower – which anime is more popular on AniList?
//
// Answers are kept on the server and only revealed after you've played.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { gql, titleOf } = require('./anilist');
const { getUser, usersById } = require('./users');
const { fetchThemes } = require('./themes');
const { notify } = require('./notify');

const TYPES = {
  opening: { label: 'Guess the opening', count: 8 },
  character: { label: "Who's this character?", count: 10 },
  ranked: { label: 'Who ranked them higher?', count: 8 },
  higherlower: { label: 'Higher or lower', count: 12 },
};

const q = {
  insertGame: db.prepare('INSERT INTO games (type, created_by, questions, created_at) VALUES (?, ?, ?, ?)'),
  addPlayer: db.prepare('INSERT INTO game_players (game_id, user_id) VALUES (?, ?)'),
  game: db.prepare('SELECT * FROM games WHERE id = ?'),
  players: db.prepare('SELECT * FROM game_players WHERE game_id = ?'),
  myGames: db.prepare(`
    SELECT g.* FROM games g JOIN game_players p ON p.game_id = g.id
    WHERE p.user_id = ? ORDER BY g.created_at DESC LIMIT 60`),
  finish: db.prepare('UPDATE game_players SET answers = ?, score = ?, correct = ?, finished_at = ? WHERE game_id = ? AND user_id = ?'),
  catalogue: db.prepare(`
    SELECT ua.anime_id, ua.status, ua.rating, a.title, a.cover_file, a.cover_url, a.characters, a.type
    FROM user_anime ua JOIN anime a ON a.id = ua.anime_id WHERE ua.user_id = ?`),
  // Characters in lists both players can see.
  sharedCharacters: db.prepare(`
    SELECT DISTINCT e.anilist_id AS id, e.name, e.image_file, e.image_url FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'character' AND (
      (l.is_shared = 0 AND l.owner_id IN (@a, @b))
      OR (l.is_shared = 1 AND (l.owner_id = @a OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @a))
                          AND (l.owner_id = @b OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @b))))`),
  // A user's rankings that the viewer may see: personal lists, or shared lists both are in.
  rankedBy: db.prepare(`
    SELECT e.id AS entry_id, e.anilist_id AS id, e.name, e.image_file, e.image_url, l.id AS list_id, l.name AS list_name,
           l.kind, COALESCE(r.position, e.position) AS pos
    FROM entries e JOIN lists l ON l.id = e.list_id
    LEFT JOIN rankings r ON r.entry_id = e.id AND r.user_id = @user
    WHERE l.kind IN ('character', 'anime', 'manga') AND (
      (l.is_shared = 0 AND l.owner_id = @user)
      OR (l.is_shared = 1 AND r.user_id IS NOT NULL
          AND (l.owner_id = @viewer OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @viewer))))`),
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const imgOf = (r) => (r.image_file ? `/images/${r.image_file}` : r.image_url);
const coverOf = (r) => (r.cover_file ? `/images/${r.cover_file}` : r.cover_url);

function options(correct, pool, n = 4, key = (x) => x.id) {
  const others = shuffle(pool.filter((p) => key(p) !== key(correct))).slice(0, n - 1);
  return shuffle([correct, ...others]);
}

// ---- Question builders ----------------------------------------------------------------

async function openingQuestions(a, b) {
  const seen = new Map();
  for (const r of [...q.catalogue.all(a), ...q.catalogue.all(b)]) {
    if (r.type === 'ANIME' && r.status !== 'dropped' && !seen.has(r.anime_id)) seen.set(r.anime_id, { id: r.anime_id, title: r.title });
  }
  const pool = [...seen.values()];
  if (pool.length < 4) {
    for (const p of await popularAnime()) if (!seen.has(p.id)) pool.push({ id: p.id, title: p.title });
  }
  const withThemes = [];
  for (const anime of shuffle(pool).slice(0, 24)) {
    const themes = await fetchThemes(anime.id); // throws 503 if AnimeThemes is down
    if (themes.length) withThemes.push({ anime, theme: shuffle(themes)[0] });
    if (withThemes.length >= TYPES.opening.count) break;
  }
  if (withThemes.length < 3) throw new HttpError(400, 'Not enough openings found for your anime yet. Add more watched anime and try again.');
  return withThemes.map(({ anime, theme }) => ({
    kind: 'opening',
    prompt: 'Which anime is this from?',
    video: theme.video,
    start: 0,
    options: options(anime, pool).map((o) => ({ id: o.id, label: o.title })),
    answer: anime.id,
    reveal: `${theme.slug}${theme.title ? ` · “${theme.title}”` : ''}${theme.artists.length ? ` by ${theme.artists.join(', ')}` : ''}`,
  }));
}

function characterQuestions(a, b) {
  const chars = new Map();
  for (const c of q.sharedCharacters.all({ a, b })) if (imgOf(c)) chars.set(c.id, { id: c.id, name: c.name, image: imgOf(c) });
  for (const r of [...q.catalogue.all(a), ...q.catalogue.all(b)]) {
    if (r.status === 'dropped') continue;
    for (const c of JSON.parse(r.characters ?? '[]')) {
      if (c.role === 'MAIN' && c.image && !chars.has(c.id)) chars.set(c.id, { id: c.id, name: c.name, image: c.image });
    }
  }
  const pool = [...chars.values()];
  if (pool.length < 5) throw new HttpError(400, 'Not enough characters yet. Add characters to your lists or anime to your catalogues.');
  return shuffle(pool)
    .slice(0, TYPES.character.count)
    .map((c) => ({
      kind: 'character',
      prompt: "Who's this?",
      image: c.image,
      options: options(c, pool).map((o) => ({ id: o.id, label: o.name })),
      answer: c.id,
      reveal: c.name,
    }));
}

const STARS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

// Questions for `player` about `subject`.
function rankedQuestions(player, subject) {
  const name = getUser(subject)?.username ?? 'they';
  const lists = new Map();
  for (const r of q.rankedBy.all({ user: subject, viewer: player })) {
    if (!lists.has(r.list_id)) lists.set(r.list_id, { name: r.list_name, kind: r.kind, items: [] });
    lists.get(r.list_id).items.push({ id: r.id, name: r.name, image: imgOf(r), pos: r.pos });
  }
  const usable = [...lists.values()].filter((l) => l.items.length >= 2).map((l) => ({ ...l, items: l.items.sort((x, y) => x.pos - y.pos) }));
  const rated = q.catalogue.all(subject).filter((r) => r.rating != null);

  const out = [];
  const makers = [];
  for (const l of usable) {
    makers.push(() => {
      const [x, y] = shuffle(l.items).slice(0, 2);
      const higher = x.pos < y.pos ? x : y;
      return {
        kind: 'ranked',
        prompt: `Who did ${name} rank higher in “${l.name}”?`,
        options: shuffle([x, y]).map((o) => ({ id: o.id, label: o.name, image: o.image })),
        answer: higher.id,
        reveal: `${higher.name} (#${higher.pos})`,
      };
    });
    if (l.items.length >= 4) {
      makers.push(() => {
        const top = l.items[0];
        return {
          kind: 'ranked',
          prompt: `Who is ${name}'s #1 in “${l.name}”?`,
          options: options(top, l.items).map((o) => ({ id: o.id, label: o.name, image: o.image })),
          answer: top.id,
          reveal: top.name,
        };
      });
    }
  }
  for (const r of rated) {
    makers.push(() => {
      const wrong = shuffle(STARS.filter((s) => s !== r.rating)).slice(0, 3);
      return {
        kind: 'ranked',
        prompt: `How many stars did ${name} give “${r.title}”?`,
        image: coverOf(r),
        options: shuffle([r.rating, ...wrong]).map((s) => ({ id: s, label: `${s} ★` })),
        answer: r.rating,
        reveal: `${r.rating} ★`,
      };
    });
  }
  for (const make of shuffle(makers).slice(0, TYPES.ranked.count)) out.push(make());
  if (out.length < 3) throw new HttpError(400, `Not enough about ${name} yet (ranked lists or rated anime).`);
  return out;
}

let popularCache = null;
async function popularAnime() {
  if (popularCache && Date.now() - popularCache.at < 24 * 3600 * 1000) return popularCache.items;
  const items = [];
  for (const page of shuffle([1, 2, 3, 4, 5, 6]).slice(0, 3)) {
    const data = await gql(
      `query ($page: Int) { Page(page: $page, perPage: 50) { media(type: ANIME, sort: [POPULARITY_DESC], isAdult: false) {
        id title { romaji english } coverImage { large } popularity } } }`,
      { page },
    );
    for (const m of data?.Page?.media ?? []) items.push({ id: m.id, title: titleOf(m.title), cover: m.coverImage?.large, popularity: m.popularity });
  }
  popularCache = { at: Date.now(), items };
  return items;
}

async function higherLowerQuestions() {
  const chain = shuffle(await popularAnime()).slice(0, TYPES.higherlower.count + 1);
  const out = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const [x, y] = [chain[i], chain[i + 1]];
    if (x.popularity === y.popularity) continue;
    out.push({
      kind: 'higherlower',
      prompt: `Does “${y.title}” have more or fewer AniList users than “${x.title}”?`,
      a: { title: x.title, cover: x.cover, value: x.popularity },
      b: { title: y.title, cover: y.cover },
      options: [
        { id: 'higher', label: '⬆️ More' },
        { id: 'lower', label: '⬇️ Fewer' },
      ],
      answer: y.popularity > x.popularity ? 'higher' : 'lower',
      reveal: `${y.popularity.toLocaleString('en')} users`,
    });
  }
  return out;
}

// ---- Views ------------------------------------------------------------------------------

const strip = ({ answer, reveal, ...rest }) => rest;

function playerView(game, me) {
  const users = usersById();
  const data = JSON.parse(game.questions);
  const players = q.players.all(game.id);
  const mine = players.find((p) => p.user_id === me);
  const questions = data.byUser ? data.byUser[me] ?? [] : data.shared;
  const done = !!mine?.finished_at;
  return {
    id: game.id,
    type: game.type,
    label: TYPES[game.type]?.label ?? game.type,
    createdAt: game.created_at,
    createdBy: users.get(game.created_by) ?? null,
    questions: done ? questions : questions.map(strip),
    myAnswers: done ? JSON.parse(mine.answers) : null,
    players: players.map((p) => ({
      user: users.get(p.user_id) ?? null,
      finished: !!p.finished_at,
      score: p.finished_at && (done || p.user_id === me) ? p.score : null,
      correct: p.finished_at && (done || p.user_id === me) ? p.correct : null,
      total: (data.byUser ? data.byUser[p.user_id] ?? [] : data.shared).length,
    })),
  };
}

function summaryView(game, me, users) {
  const players = q.players.all(game.id);
  const mine = players.find((p) => p.user_id === me);
  const done = !!mine?.finished_at;
  return {
    id: game.id,
    type: game.type,
    label: TYPES[game.type]?.label ?? game.type,
    createdAt: game.created_at,
    createdBy: users.get(game.created_by) ?? null,
    myTurn: !done,
    players: players.map((p) => ({
      user: users.get(p.user_id) ?? null,
      finished: !!p.finished_at,
      score: p.finished_at && done ? p.score : null,
    })),
  };
}

// ---- Routes -----------------------------------------------------------------------------

const router = express.Router();

router.get('/games', (req, res) => {
  const me = req.user.id;
  const users = usersById();
  const games = q.myGames.all(me).map((g) => summaryView(g, me, users));
  // Head-to-head over finished games.
  const h2h = new Map();
  for (const g of games) {
    const mine = g.players.find((p) => p.user?.id === me);
    for (const o of g.players) {
      if (o.user?.id === me || mine?.score == null || o.score == null) continue;
      const rec = h2h.get(o.user.id) ?? { opponent: o.user, wins: 0, losses: 0, ties: 0 };
      if (mine.score > o.score) rec.wins += 1;
      else if (mine.score < o.score) rec.losses += 1;
      else rec.ties += 1;
      h2h.set(o.user.id, rec);
    }
  }
  res.json({ types: TYPES, games, headToHead: [...h2h.values()] });
});

router.post('/games', wrap(async (req, res) => {
  const me = req.user.id;
  const type = req.body?.type;
  if (!TYPES[type]) throw new HttpError(400, 'Unknown game');
  const opponent = parseId(req.body?.opponentId);
  if (opponent === me || !getUser(opponent)) throw new HttpError(400, 'Pick someone to play against.');

  let data;
  if (type === 'ranked') data = { byUser: { [me]: rankedQuestions(me, opponent), [opponent]: rankedQuestions(opponent, me) } };
  else if (type === 'opening') data = { shared: await openingQuestions(me, opponent) };
  else if (type === 'character') data = { shared: characterQuestions(me, opponent) };
  else data = { shared: await higherLowerQuestions() };

  const id = db.transaction(() => {
    const gid = Number(q.insertGame.run(type, me, JSON.stringify(data), Date.now()).lastInsertRowid);
    q.addPlayer.run(gid, me);
    q.addPlayer.run(gid, opponent);
    return gid;
  })();
  notify([opponent], 'games', {
    title: `🎮 ${req.user.username} challenged you`,
    body: `${TYPES[type].label}: play it and beat their score!`,
    url: `#/us/games/${id}`,
    tag: `game-${id}`,
  });
  res.status(201).json(playerView(q.game.get(id), me));
}));

function gameFor(req) {
  const game = q.game.get(parseId(req.params.id));
  if (!game || !q.players.all(game.id).some((p) => p.user_id === req.user.id)) throw new HttpError(404, 'Game not found');
  return game;
}

router.get('/games/:id', (req, res) => {
  res.json(playerView(gameFor(req), req.user.id));
});

// Points: 100 for a correct answer + up to 100 for speed (within 15 s).
router.post('/games/:id/answers', (req, res) => {
  const me = req.user.id;
  const game = gameFor(req);
  const mine = q.players.all(game.id).find((p) => p.user_id === me);
  if (mine.finished_at) throw new HttpError(409, 'You already played this one.');
  const data = JSON.parse(game.questions);
  const questions = data.byUser ? data.byUser[me] : data.shared;
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];

  let score = 0;
  let correct = 0;
  const graded = questions.map((qq, i) => {
    const a = answers[i] ?? {};
    const ok = a.choice != null && String(a.choice) === String(qq.answer);
    const ms = Math.max(0, Number(a.ms) || 15000);
    if (ok) {
      correct += 1;
      score += 100 + Math.round(100 * Math.max(0, 1 - ms / 15000));
    }
    return { choice: a.choice ?? null, ms, correct: ok };
  });
  q.finish.run(JSON.stringify(graded), score, correct, Date.now(), game.id, me);

  const others = q.players.all(game.id).filter((p) => p.user_id !== me);
  const allDone = others.every((p) => p.finished_at);
  notify(
    others.map((p) => p.user_id),
    'games',
    {
      title: allDone ? `🏁 ${req.user.username} finished your challenge` : `🎮 ${req.user.username} played ${TYPES[game.type].label}`,
      body: allDone ? 'See who won!' : 'Your turn: beat their score.',
      url: `#/us/games/${game.id}`,
      tag: `game-${game.id}`,
    },
  );
  res.json(playerView(q.game.get(game.id), me));
});

module.exports = { gamesRouter: router };
