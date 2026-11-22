// Anime openings & endings from the free AnimeThemes database
// (https://animethemes.moe), looked up by AniList id and cached.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');

const API = 'https://api.animethemes.moe';
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const DOWN_MS = 10 * 60 * 1000;
let downUntil = 0;

const q = {
  get: db.prepare('SELECT data, fetched_at FROM anime_themes WHERE anime_id = ?'),
  save: db.prepare('INSERT OR REPLACE INTO anime_themes (anime_id, data, fetched_at) VALUES (?, ?, ?)'),
};

function bestVideo(entry) {
  const videos = entry?.videos ?? [];
  // Prefer creditless, no lyrics, around 720p.
  const scored = videos
    .filter((v) => v?.link)
    .map((v) => ({ v, s: (v.nc ? 2 : 0) + (v.lyrics ? -1 : 0) - Math.abs((v.resolution ?? 720) - 720) / 1000 }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0]?.v ?? null;
}

function normalize(json) {
  const themes = json?.anime?.[0]?.animethemes ?? [];
  return themes
    .map((t) => {
      const entry = (t.animethemeentries ?? []).find((e) => bestVideo(e)) ?? null;
      const video = entry ? bestVideo(entry) : null;
      return {
        id: t.id,
        slug: t.slug,
        type: t.type,
        sequence: t.sequence ?? 1,
        title: t.song?.title ?? null,
        artists: (t.song?.artists ?? []).map((a) => a.name).filter(Boolean),
        episodes: entry?.episodes ?? null,
        spoiler: !!entry?.spoiler,
        nsfw: !!entry?.nsfw,
        video: video?.link ?? null,
      };
    })
    .filter((t) => t.video && !t.nsfw)
    .sort((a, b) => (a.type === b.type ? a.sequence - b.sequence : a.type === 'OP' ? -1 : 1));
}

// Returns the themes of an anime (possibly []), or throws 503 if AnimeThemes is down.
async function fetchThemes(animeId) {
  const row = q.get.get(animeId);
  if (row && Date.now() - row.fetched_at < FRESH_MS) return JSON.parse(row.data);
  if (Date.now() < downUntil) {
    if (row) return JSON.parse(row.data);
    throw new HttpError(503, 'AnimeThemes (openings database) is unavailable right now. Try again later.');
  }
  const url =
    `${API}/anime?filter[has]=resources&filter[site]=AniList&filter[external_id]=${animeId}` +
    '&include=animethemes.animethemeentries.videos,animethemes.song.artists';
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; AnimeLister/1.0; self-hosted)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const themes = normalize(await res.json());
    q.save.run(animeId, JSON.stringify(themes), Date.now());
    return themes;
  } catch (err) {
    downUntil = Date.now() + DOWN_MS;
    if (row) return JSON.parse(row.data);
    throw new HttpError(503, `AnimeThemes (openings database) is unavailable right now (${err.message}). Try again later.`);
  }
}

const router = express.Router();

router.get('/anime/:id/themes', wrap(async (req, res) => {
  res.json({ themes: await fetchThemes(parseId(req.params.id)) });
}));

module.exports = { themesRouter: router, fetchThemes };
