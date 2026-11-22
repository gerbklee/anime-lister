// Thin client for the public AniList GraphQL API (no API key required).
const ENDPOINT = 'https://graphql.anilist.co';

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX = 500;
const searchCache = new Map();

class AniListError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const characterFields = (mediaPerPage) => `
  id
  name { full native }
  image { large medium }
  media(perPage: ${mediaPerPage}, sort: [POPULARITY_DESC]) {
    nodes { id idMal type title { romaji english } }
  }
`;

const SEARCH_QUERY = `
  query ($search: String) {
    Page(perPage: 8) {
      characters(search: $search, sort: [SEARCH_MATCH]) { ${characterFields(3)} }
    }
  }
`;

const CHARACTER_QUERY = `
  query ($id: Int) {
    Character(id: $id) { ${characterFields(25)} }
  }
`;

const ANIME_SEARCH_QUERY = `
  query ($search: String) {
    Page(perPage: 8) {
      media(search: $search, type: ANIME, sort: [SEARCH_MATCH], isAdult: false) {
        id title { romaji english } coverImage { large } format episodes seasonYear
      }
    }
  }
`;

const ANIME_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id idMal title { romaji english }
      coverImage { extraLarge large color } bannerImage
      episodes format season seasonYear status genres averageScore
      description(asHtml: false)
      studios(isMain: true) { nodes { name } }
      trailer { id site }
      characters(sort: [ROLE, RELEVANCE, ID], perPage: 12) {
        edges { role node { id name { full } image { large } } }
      }
    }
  }
`;

async function gql(query, variables) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AniListError(502, 'Could not reach AniList. Check the internet connection.');
  }

  if (res.status === 429) {
    throw new AniListError(503, 'AniList rate limit reached. Please wait a minute and try again.');
  }

  const body = await res.json().catch(() => null);
  if (res.status === 404) throw new AniListError(404, 'Not found on AniList.');
  if (!res.ok || !body || body.errors) {
    const detail = body?.errors?.[0]?.message;
    throw new AniListError(502, `AniList request failed${detail ? `: ${detail}` : ''}`);
  }
  return body.data;
}

const titleOf = (t) => t?.english || t?.romaji || null;

// Converts an AniList character into the shape the app uses.
// `series` (titles) and `media` are deduplicated by title, most popular first.
function normalizeCharacter(c) {
  const seen = new Set();
  const media = [];
  for (const m of c.media?.nodes ?? []) {
    const title = titleOf(m?.title);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    media.push({ id: m.id, idMal: m.idMal ?? null, type: m.type, title, romaji: m.title?.romaji ?? null });
  }
  return {
    anilistId: c.id,
    name: c.name?.full || c.name?.native || 'Unknown',
    nativeName: c.name?.native || null,
    image: c.image?.large || c.image?.medium || null,
    series: media.map((m) => m.title),
    media,
  };
}

// AniList descriptions contain light HTML (<br>, <i>) and source notes.
function cleanDescription(text) {
  if (!text) return null;
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeAnime(m) {
  const trailerId = m.trailer?.id ? String(m.trailer.id).trim() : null;
  const trailerOk = trailerId && ['youtube', 'dailymotion'].includes(m.trailer.site);
  return {
    id: m.id,
    idMal: m.idMal ?? null,
    title: titleOf(m.title) || 'Unknown',
    titleRomaji: m.title?.romaji ?? null,
    cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
    color: m.coverImage?.color ?? null,
    banner: m.bannerImage ?? null,
    format: m.format ?? null,
    episodes: m.episodes ?? null,
    season: m.season ?? null,
    seasonYear: m.seasonYear ?? null,
    status: m.status ?? null,
    genres: m.genres ?? [],
    averageScore: m.averageScore ?? null,
    studios: (m.studios?.nodes ?? []).map((s) => s.name).join(', ') || null,
    description: cleanDescription(m.description),
    trailer: trailerOk ? { site: m.trailer.site, id: trailerId } : null,
    characters: (m.characters?.edges ?? [])
      .filter((e) => e?.node)
      .map((e) => ({
        id: e.node.id,
        name: e.node.name?.full ?? 'Unknown',
        image: e.node.image?.large ?? null,
        role: e.role,
      })),
  };
}

async function cachedSearch(prefix, term, run) {
  const key = `${prefix}:${term.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) return cached.results;
  const results = await run();
  searchCache.delete(key);
  searchCache.set(key, { at: Date.now(), results });
  if (searchCache.size > SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value);
  return results;
}

function searchCharacters(term) {
  return cachedSearch('c', term, async () => {
    const data = await gql(SEARCH_QUERY, { search: term });
    return (data?.Page?.characters ?? []).filter(Boolean).map(normalizeCharacter);
  });
}

function searchAnime(term) {
  return cachedSearch('a', term, async () => {
    const data = await gql(ANIME_SEARCH_QUERY, { search: term });
    return (data?.Page?.media ?? []).filter(Boolean).map((m) => ({
      id: m.id,
      title: titleOf(m.title) || 'Unknown',
      cover: m.coverImage?.large ?? null,
      format: m.format ?? null,
      episodes: m.episodes ?? null,
      seasonYear: m.seasonYear ?? null,
    }));
  });
}

async function getCharacter(id) {
  const data = await gql(CHARACTER_QUERY, { id });
  if (!data?.Character) throw new AniListError(404, 'Character not found on AniList.');
  return normalizeCharacter(data.Character);
}

async function fetchAnime(id) {
  const data = await gql(ANIME_QUERY, { id });
  if (!data?.Media) throw new AniListError(404, 'Anime not found on AniList.');
  return normalizeAnime(data.Media);
}

module.exports = { gql, titleOf, searchCharacters, searchAnime, getCharacter, fetchAnime, AniListError };
