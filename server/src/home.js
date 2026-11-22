// Home page data: airing schedule, "continue" items, the tonight picker,
// and the background job that sends "new episode" notifications.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap } = require('./http');
const { gql } = require('./anilist');
const { refreshSome, toAnimeSummary } = require('./anime');
const { usersById } = require('./users');
const { notify } = require('./notify');

const AIRING_QUERY = `
  query ($ids: [Int], $from: Int, $to: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      airingSchedules(mediaId_in: $ids, airingAt_greater: $from, airingAt_lesser: $to, sort: [TIME]) {
        airingAt episode mediaId
      }
    }
  }
`;

const q = {
  anime: db.prepare('SELECT * FROM anime WHERE id = ?'),
  myWatching: db.prepare(`
    SELECT ua.*, a.type FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
    WHERE ua.user_id = ? AND ua.status = 'watching' ORDER BY ua.updated_at DESC`),
  othersOn: db.prepare(`SELECT user_id, status, progress FROM user_anime WHERE anime_id = ? AND user_id != ?`),
  myStatus: db.prepare("SELECT status FROM user_anime WHERE user_id = ? AND anime_id = ?"),
  myWatchlistAnime: db.prepare(`
    SELECT e.anilist_id AS id, e.position, l.id AS list_id, l.name AS list_name,
           (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) AS list_size
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'watchlist' AND (l.owner_id = @me OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))`),
  allWatching: db.prepare(`
    SELECT DISTINCT ua.anime_id AS id FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
    WHERE ua.status = 'watching' AND a.type = 'ANIME'`),
  allWatchlisted: db.prepare(`
    SELECT DISTINCT e.anilist_id AS id FROM entries e JOIN lists l ON l.id = e.list_id
    JOIN anime a ON a.id = e.anilist_id WHERE l.kind = 'watchlist' AND a.type = 'ANIME' AND a.status = 'RELEASING'`),
  watchersOf: db.prepare(`SELECT user_id FROM user_anime WHERE anime_id = ? AND status = 'watching'`),
  watchlistersOf: db.prepare(`
    SELECT DISTINCT u.id AS user_id FROM entries e JOIN lists l ON l.id = e.list_id
    JOIN users u ON u.id = l.owner_id OR u.id IN (SELECT user_id FROM list_members WHERE list_id = l.id)
    WHERE l.kind = 'watchlist' AND e.anilist_id = ?`),
  wasNotified: db.prepare('SELECT 1 FROM airing_notified WHERE anime_id = ? AND episode = ?'),
  markNotified: db.prepare('INSERT OR IGNORE INTO airing_notified (anime_id, episode) VALUES (?, ?)'),
};

// ---- Airing schedule --------------------------------------------------------------

const airingCache = new Map();

async function airingFor(ids, from, to) {
  if (!ids.length) return [];
  const key = `${[...ids].sort((a, b) => a - b).join(',')}:${Math.floor(from / 1200)}:${Math.floor(to / 1200)}`;
  const hit = airingCache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.value;
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const data = await gql(AIRING_QUERY, { ids, from, to, page });
    out.push(...(data?.Page?.airingSchedules ?? []));
    if (!data?.Page?.pageInfo?.hasNextPage) break;
  }
  airingCache.set(key, { at: Date.now(), value: out });
  if (airingCache.size > 100) airingCache.delete(airingCache.keys().next().value);
  return out;
}

// Every 30 minutes: notify people when a new episode of something they watch
// (or have on a watchlist) has just aired.
async function airingJob() {
  try {
    const ids = [...new Set([...q.allWatching.all(), ...q.allWatchlisted.all()].map((r) => r.id))];
    if (!ids.length) return;
    const now = Math.floor(Date.now() / 1000);
    const aired = await airingFor(ids, now - 3 * 3600, now);
    for (const s of aired) {
      if (q.wasNotified.get(s.mediaId, s.episode)) continue;
      q.markNotified.run(s.mediaId, s.episode);
      const a = q.anime.get(s.mediaId);
      if (!a) continue;
      const users = [...q.watchersOf.all(s.mediaId), ...q.watchlistersOf.all(s.mediaId)].map((r) => r.user_id);
      notify(users, 'episodes', {
        title: `📺 ${a.title}`,
        body: `Episode ${s.episode} is out now.`,
        url: `#/anime/${a.id}`,
        tag: `ep-${a.id}-${s.episode}`,
      });
    }
  } catch (err) {
    console.warn(`Airing check failed: ${err.message}`);
  }
}

function startAiringJob() {
  setTimeout(airingJob, 60_000);
  setInterval(airingJob, 30 * 60 * 1000);
}

// ---- Tonight picker ----------------------------------------------------------------

const TIME_LIMITS = { short: 45, hour: 75, evening: 200, weekend: Infinity };
const MOODS = {
  chill: ['Slice of Life', 'Comedy', 'Romance'],
  hype: ['Action', 'Sports', 'Mecha', 'Adventure'],
  romance: ['Romance'],
  funny: ['Comedy'],
  dark: ['Horror', 'Psychological', 'Thriller', 'Mystery'],
};

const fmtMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`);

async function tonight(me, { time = 'hour', moods = [], together = true }) {
  const limit = TIME_LIMITS[time] ?? 75;
  const moodGenres = new Set(moods.flatMap((m) => MOODS[m] ?? []));
  const users = usersById();

  const candidates = new Map();
  const add = (id, extra) => {
    const cur = candidates.get(id) ?? { id, reasons: [], priority: 0, continue: null };
    Object.assign(cur, extra(cur));
    candidates.set(id, cur);
  };

  for (const w of q.myWatchlistAnime.all({ me })) {
    add(w.id, (cur) => ({
      priority: Math.max(cur.priority, 1 - (w.position - 1) / Math.max(w.list_size, 1)),
      reasons: [...cur.reasons, `#${w.position} on ${w.list_name}`],
    }));
  }
  for (const r of q.myWatching.all(me)) {
    if (r.type !== 'ANIME') continue;
    const others = q.othersOn.all(r.anime_id, me).filter((o) => o.status === 'watching');
    if (together && !others.length) continue;
    add(r.anime_id, () => ({ continue: { mine: r.progress, others: others.map((o) => ({ user: users.get(o.user_id), progress: o.progress })) } }));
  }

  const ids = [...candidates.keys()];
  await refreshSome(ids, 15); // learn episode lengths for older entries

  const scored = [];
  for (const c of candidates.values()) {
    const a = q.anime.get(c.id);
    if (!a || a.type !== 'ANIME' || a.status === 'NOT_YET_RELEASED') continue;
    // Already seen (or given up on): only suggest it to continue together.
    const mine = q.myStatus.get(me, c.id)?.status;
    if (!c.continue && (mine === "watched" || mine === "dropped")) continue;
    const genres = JSON.parse(a.genres);
    const epLen = a.duration ?? 24;
    const isMovie = a.format === 'MOVIE' || a.episodes === 1;
    let score = 1 + c.priority;
    let plan;

    if (c.continue) {
      const lowest = Math.min(c.continue.mine, ...c.continue.others.map((o) => o.progress));
      const from = lowest + 1;
      const remaining = a.episodes ? a.episodes - lowest : 3;
      const eps = Math.max(1, Math.min(remaining, Math.floor(limit / epLen) || 1, 12));
      plan = `Episodes ${from}${eps > 1 ? `–${from + eps - 1}` : ''} (~${fmtMinutes(eps * epLen)})`;
      score += c.continue.others.length ? 2 : 1;
      const ahead = c.continue.others.filter((o) => o.progress > c.continue.mine);
      if (ahead.length) c.reasons.push(`${ahead.map((o) => o.user?.username).join(' & ')} ${ahead.length > 1 ? 'are' : 'is'} ahead`);
      else if (c.continue.others.some((o) => o.progress < c.continue.mine)) c.reasons.push('You are ahead; they can catch up');
      else c.reasons.push('You are both watching it');
    } else if (isMovie) {
      const len = epLen;
      plan = `Movie · ${fmtMinutes(len)}`;
      if (len <= limit) score += 1;
      else score -= 2;
    } else {
      const total = (a.episodes ?? 12) * epLen;
      const eps = Math.max(1, Math.min(a.episodes ?? 12, Math.floor(limit / epLen) || 1));
      if (total <= limit) {
        score += 1;
        plan = `The whole thing (${a.episodes ?? '?'} ep · ~${fmtMinutes(total)})`;
      } else {
        plan = `Start: episode${eps > 1 ? `s 1–${eps}` : ' 1'} (~${fmtMinutes(eps * epLen)})`;
        if (limit <= 45 && epLen > 30) score -= 1;
      }
    }

    const moodHit = genres.filter((g) => moodGenres.has(g));
    if (moodGenres.size) {
      if (moodHit.length) {
        score += 1.5;
        c.reasons.push(moodHit.slice(0, 2).join(' & '));
      } else score -= 0.75;
    }
    score += Math.random() * 0.8;
    scored.push({ anime: toAnimeSummary(a), plan, reasons: c.reasons, score: Math.round(score * 100) / 100 });
  }

  scored.sort((a, b) => b.score - a.score);
  return { pick: scored[0] ?? null, candidates: scored.slice(0, 12) };
}

// ---- Routes ------------------------------------------------------------------------

const router = express.Router();

router.get('/home', wrap(async (req, res) => {
  const me = req.user.id;
  const users = usersById();
  const watching = q.myWatching.all(me);

  const cont = watching.map((r) => {
    const a = q.anime.get(r.anime_id);
    return {
      anime: toAnimeSummary(a),
      status: r.status,
      progress: r.progress,
      progressVolumes: r.progress_volumes ?? 0,
      total: a?.type === 'MANGA' ? a.chapters : a?.episodes,
      updatedAt: r.updated_at,
      others: q.othersOn
        .all(r.anime_id, me)
        .filter((o) => o.status !== 'dropped')
        .map((o) => ({ user: users.get(o.user_id) ?? null, status: o.status, progress: o.progress })),
    };
  });

  // Airing: anime you're watching or have on a watchlist, from 12 h ago to 7 days ahead.
  const animeIds = [
    ...new Set([...watching.filter((r) => r.type === 'ANIME').map((r) => r.anime_id), ...q.myWatchlistAnime.all({ me }).map((w) => w.id)]),
  ];
  let airing = [];
  let airingError = null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const myProgress = new Map(watching.map((r) => [r.anime_id, r.progress]));
    airing = (await airingFor(animeIds, now - 12 * 3600, now + 7 * 86400))
      .map((s) => ({
        anime: toAnimeSummary(q.anime.get(s.mediaId)),
        episode: s.episode,
        airingAt: s.airingAt * 1000,
        watching: myProgress.has(s.mediaId),
        progress: myProgress.get(s.mediaId) ?? null,
      }))
      .filter((s) => s.anime);
  } catch (err) {
    airingError = err.message;
  }

  res.json({ continue: cont, airing, airingError });
}));

router.post('/home/tonight', wrap(async (req, res) => {
  const { time, moods, together } = req.body ?? {};
  if (time && !TIME_LIMITS[time]) throw new HttpError(400, 'Unknown time option');
  res.json(await tonight(req.user.id, { time, moods: Array.isArray(moods) ? moods : [], together: together !== false }));
}));

module.exports = { homeRouter: router, startAiringJob };
