// Character overview: everything AniList knows about a character, plus where
// the character appears in this app's lists.
const express = require('express');
const { db } = require('./db');
const { wrap, parseId } = require('./http');
const { gql, titleOf, AniListError } = require('./anilist');
const { usersById } = require('./users');

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

// Voice actors are requested per language through two root aliases: asking for
// both languages on the same edge makes AniList return one language twice.
const CHARACTER_DETAIL_QUERY = `
  query ($id: Int) {
    main: Character(id: $id) {
      id
      name { full native alternative alternativeSpoiler }
      image { large }
      description(asHtml: false)
      gender
      dateOfBirth { year month day }
      age
      bloodType
      favourites
      siteUrl
      media(sort: [POPULARITY_DESC], perPage: 25) {
        pageInfo { total }
        edges {
          characterRole
          node {
            id type format title { romaji english } coverImage { large color }
            seasonYear episodes chapters popularity isAdult
          }
          voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full native } image { large } }
        }
      }
    }
    en: Character(id: $id) {
      media(sort: [POPULARITY_DESC], perPage: 25) {
        edges {
          node { id }
          voiceActors(language: ENGLISH, sort: [RELEVANCE, ID]) { id name { full native } image { large } }
        }
      }
    }
  }
`;

const q = {
  link: db.prepare('INSERT OR IGNORE INTO character_media (character_id, anime_id) VALUES (?, ?)'),
  lists: db.prepare(`
    SELECT e.id AS entry_id, e.position, e.note, e.image_file, e.image_url,
           l.id AS list_id, l.name AS list_name, l.owner_id, l.is_shared,
           (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) AS list_size
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE e.anilist_id = @id AND l.kind = 'character' AND (
      l.is_shared = 0 OR l.owner_id = @me
      OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))
    ORDER BY l.id`),
};

// AniList descriptions are light markdown: keep __bold__ and ~!spoilers!~ for
// the browser, turn <br> into newlines and decode entities.
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

function collectVoiceActors(edges, language) {
  const byId = new Map();
  for (const e of edges ?? []) {
    for (const va of e?.voiceActors ?? []) {
      const cur = byId.get(va.id) ?? {
        id: va.id,
        name: va.name?.full ?? 'Unknown',
        native: va.name?.native ?? null,
        image: va.image?.large ?? null,
        language,
        roles: 0,
      };
      cur.roles += 1;
      byId.set(va.id, cur);
    }
  }
  return [...byId.values()].sort((a, b) => b.roles - a.roles).slice(0, 3);
}

async function fetchDetail(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const data = await gql(CHARACTER_DETAIL_QUERY, { id });
  const c = data?.main;
  if (!c) throw new AniListError(404, 'Character not found on AniList.');

  const appearances = (c.media?.edges ?? [])
    .filter((e) => e?.node && !e.node.isAdult)
    .map((e) => ({
      id: e.node.id,
      type: e.node.type,
      format: e.node.format,
      title: titleOf(e.node.title) || 'Unknown',
      cover: e.node.coverImage?.large ?? null,
      color: e.node.coverImage?.color ?? null,
      seasonYear: e.node.seasonYear ?? null,
      episodes: e.node.episodes ?? null,
      chapters: e.node.chapters ?? null,
      popularity: e.node.popularity ?? 0,
      role: e.characterRole,
    }));

  const value = {
    id: c.id,
    name: c.name?.full ?? 'Unknown',
    native: c.name?.native ?? null,
    alternative: (c.name?.alternative ?? []).filter(Boolean),
    alternativeSpoiler: (c.name?.alternativeSpoiler ?? []).filter(Boolean),
    image: c.image?.large ?? null,
    description: cleanDescription(c.description),
    gender: c.gender ?? null,
    birthday: c.dateOfBirth?.month || c.dateOfBirth?.day ? c.dateOfBirth : null,
    age: c.age ?? null,
    bloodType: c.bloodType ?? null,
    favourites: c.favourites ?? 0,
    siteUrl: c.siteUrl ?? `https://anilist.co/character/${c.id}`,
    appearanceCount: c.media?.pageInfo?.total ?? appearances.length,
    appearances,
    voiceActors: [
      ...collectVoiceActors(c.media?.edges, 'Japanese'),
      ...collectVoiceActors(data?.en?.media?.edges, 'English'),
    ],
  };

  // Remember which anime this character appears in (for links elsewhere).
  db.transaction(() => {
    for (const a of appearances) if (a.type === 'ANIME') q.link.run(c.id, a.id);
  })();

  cache.set(id, { at: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return value;
}

const router = express.Router();

router.get('/characters/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const detail = await fetchDetail(id);
  const users = usersById();
  const lists = q.lists.all({ id, me: req.user.id }).map((r) => ({
    entryId: r.entry_id,
    rank: r.position,
    note: r.note || null,
    image: r.image_file ? `/images/${r.image_file}` : r.image_url,
    list: { id: r.list_id, name: r.list_name, size: r.list_size, isShared: !!r.is_shared },
    owner: users.get(r.owner_id) ?? null,
  }));
  res.json({ ...detail, lists });
}));

module.exports = { charactersRouter: router };
