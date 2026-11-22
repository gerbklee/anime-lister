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
    nodes { id title { romaji english } }
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

async function gql(query, variables) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AniListError(502, 'Could not reach AniList. Check the internet connection.');
  }

  if (res.status === 429) {
    throw new AniListError(503, 'AniList rate limit reached. Please wait a minute and try again.');
  }

  const body = await res.json().catch(() => null);
  if (res.status === 404) throw new AniListError(404, 'Character not found on AniList.');
  if (!res.ok || !body || body.errors) {
    const detail = body?.errors?.[0]?.message;
    throw new AniListError(502, `AniList request failed${detail ? `: ${detail}` : ''}`);
  }
  return body.data;
}

// Converts an AniList character into the shape the app uses.
// Series titles are deduplicated and ordered most popular first.
function normalize(c) {
  const seen = new Set();
  const series = [];
  for (const m of c.media?.nodes ?? []) {
    const title = m?.title?.english || m?.title?.romaji;
    if (!title || seen.has(title)) continue;
    seen.add(title);
    series.push(title);
  }
  return {
    anilistId: c.id,
    name: c.name?.full || c.name?.native || 'Unknown',
    nativeName: c.name?.native || null,
    image: c.image?.large || c.image?.medium || null,
    series,
  };
}

async function searchCharacters(term) {
  const key = term.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) return cached.results;

  const data = await gql(SEARCH_QUERY, { search: term });
  const results = (data?.Page?.characters ?? []).filter(Boolean).map(normalize);

  searchCache.delete(key);
  searchCache.set(key, { at: Date.now(), results });
  if (searchCache.size > SEARCH_CACHE_MAX) {
    searchCache.delete(searchCache.keys().next().value);
  }
  return results;
}

async function getCharacter(id) {
  const data = await gql(CHARACTER_QUERY, { id });
  if (!data?.Character) throw new AniListError(404, 'Character not found on AniList.');
  return normalize(data.Character);
}

module.exports = { searchCharacters, getCharacter, AniListError };
