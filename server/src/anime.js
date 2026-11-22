// Anime/manga metadata cache and character <-> media links.
// The `anime` table holds both anime and manga (column `type`); AniList media
// ids are unique across both.
const { db } = require('./db');
const { fetchAnime, getCharacter } = require('./anilist');
const { cacheImage } = require('./images');

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const META_VERSION = 2; // bump to refresh rows fetched with fewer fields

const q = {
  get: db.prepare('SELECT * FROM anime WHERE id = ?'),
  upsert: db.prepare(`
    INSERT INTO anime (id, id_mal, type, title, title_romaji, cover_url, cover_file, banner_url, color, format, episodes,
                       chapters, volumes, duration, season, season_year, status, genres, studios, description,
                       trailer_site, trailer_id, average_score, characters, relations, meta_version, fetched_at)
    VALUES (@id, @idMal, @type, @title, @titleRomaji, @cover, @coverFile, @banner, @color, @format, @episodes,
            @chapters, @volumes, @duration, @season, @seasonYear, @status, @genres, @studios, @description,
            @trailerSite, @trailerId, @averageScore, @characters, @relations, @metaVersion, @fetchedAt)
    ON CONFLICT (id) DO UPDATE SET
      id_mal = excluded.id_mal, type = excluded.type, title = excluded.title, title_romaji = excluded.title_romaji,
      cover_url = excluded.cover_url, cover_file = COALESCE(excluded.cover_file, anime.cover_file),
      banner_url = excluded.banner_url, color = excluded.color, format = excluded.format,
      episodes = excluded.episodes, chapters = excluded.chapters, volumes = excluded.volumes,
      duration = excluded.duration, season = excluded.season, season_year = excluded.season_year,
      status = excluded.status, genres = excluded.genres, studios = excluded.studios,
      description = excluded.description, trailer_site = excluded.trailer_site, trailer_id = excluded.trailer_id,
      average_score = excluded.average_score, characters = excluded.characters, relations = excluded.relations,
      meta_version = excluded.meta_version, fetched_at = excluded.fetched_at`),
  link: db.prepare('INSERT OR IGNORE INTO character_media (character_id, anime_id) VALUES (?, ?)'),
  markSynced: db.prepare('INSERT OR REPLACE INTO character_sync (character_id) VALUES (?)'),
  setSeries: db.prepare('UPDATE entries SET series_options = ? WHERE anilist_id = ? AND list_id IN (SELECT id FROM lists WHERE kind = \'character\')'),
  unsynced: db.prepare(`
    SELECT DISTINCT e.anilist_id AS id FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'character' AND e.anilist_id NOT IN (SELECT character_id FROM character_sync)`),
};

const coverPath = (row) => (row.cover_file ? `/images/${row.cover_file}` : row.cover_url);

// Small card-sized info, used in catalogues, lists and the feed.
function toAnimeSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type ?? 'ANIME',
    title: row.title,
    cover: coverPath(row),
    color: row.color,
    format: row.format,
    episodes: row.episodes,
    chapters: row.chapters,
    volumes: row.volumes,
    duration: row.duration,
    seasonYear: row.season_year,
    genres: JSON.parse(row.genres),
    trailer: row.trailer_id ? { site: row.trailer_site, id: row.trailer_id } : null,
  };
}

function toAnime(row) {
  return {
    ...toAnimeSummary(row),
    titleRomaji: row.title_romaji,
    banner: row.banner_url,
    season: row.season,
    status: row.status,
    studios: row.studios,
    description: row.description,
    averageScore: row.average_score,
    characters: JSON.parse(row.characters),
    relations: JSON.parse(row.relations ?? '[]'),
  };
}

// Records which characters appear in an anime/manga (from its character list).
const linkCharacters = db.transaction((animeId, characters) => {
  for (const c of characters) q.link.run(c.id, animeId);
});

function needsRefresh(row) {
  return !row || Date.now() - row.fetched_at > STALE_MS || (row.meta_version ?? 1) < META_VERSION;
}

// Returns the media's DB row, fetching it from AniList if missing or stale.
// With `cover: true` the cover image is also cached locally.
async function ensureAnime(id, { cover = false } = {}) {
  let row = q.get.get(id);
  if (needsRefresh(row)) {
    try {
      const a = await fetchAnime(id);
      q.upsert.run({
        ...a,
        coverFile: null,
        genres: JSON.stringify(a.genres),
        trailerSite: a.trailer?.site ?? null,
        trailerId: a.trailer?.id ?? null,
        characters: JSON.stringify(a.characters),
        relations: JSON.stringify(a.relations),
        metaVersion: META_VERSION,
        fetchedAt: Date.now(),
      });
      linkCharacters(a.id, a.characters);
      row = q.get.get(id);
    } catch (err) {
      if (!row) throw err; // keep serving the old copy if AniList is unavailable
    }
  }
  if (cover && !row.cover_file && row.cover_url) {
    try {
      const file = await cacheImage(row.cover_url, `anime-${row.id}`);
      db.prepare('UPDATE anime SET cover_file = ? WHERE id = ?').run(file, row.id);
      row = q.get.get(id);
    } catch (err) {
      console.warn(`Could not cache cover for ${id}: ${err.message}`);
    }
  }
  return row;
}

// Refreshes a few outdated rows (e.g. to learn episode lengths), gently.
async function refreshSome(ids, limit = 12) {
  let n = 0;
  for (const id of ids) {
    if (n >= limit) break;
    if (!needsRefresh(q.get.get(id))) continue;
    n += 1;
    await ensureAnime(id).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
  }
}

// Stores a character's appearances (from a full AniList character fetch).
const saveCharacterLinks = db.transaction((character) => {
  for (const m of character.media) if (m.type === 'ANIME' || m.type === 'MANGA') q.link.run(character.anilistId, m.id);
  q.markSynced.run(character.anilistId);
});

// Background job: links characters added before anime support existed.
// Paced at ~1 request per 1.5 s to stay well inside AniList's rate limit.
async function backfillCharacterLinks() {
  const ids = q.unsynced.all().map((r) => r.id);
  if (!ids.length) return;
  console.log(`Linking ${ids.length} characters to their anime…`);
  let done = 0;
  for (const id of ids) {
    try {
      const c = await getCharacter(id);
      db.transaction(() => {
        saveCharacterLinks(c);
        q.setSeries.run(JSON.stringify(c.media), id);
      })();
      done += 1;
    } catch (err) {
      console.warn(`Could not link character ${id}: ${err.message}`);
      if (err.status === 503) await new Promise((r) => setTimeout(r, 60_000));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`Linked ${done}/${ids.length} characters.`);
}

module.exports = { ensureAnime, refreshSome, toAnime, toAnimeSummary, saveCharacterLinks, backfillCharacterLinks };
