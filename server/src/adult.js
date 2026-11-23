// "Spicy art", per person, off by default. Levels: 0 off; 1 spicy = suggestive
// but no nudity (Danbooru "sensitive", Zerochan ecchi/fanservice, Wallhaven
// "sketchy"); 2 explicit = also nudity (Danbooru "questionable"/"explicit",
// Zerochan nudity tags).
//
// Firm rule, for every level above 0: such pictures are only ever shown for
// characters the app KNOWS are adults (AniList age 18+), never with tags that
// indicate minors. Characters without a known age get safe art.
//
// Manual verification: when no source gives an age, a person can verify a
// character as an adult by hand (basis 'manual'). This is only possible while
// no source gives an age; whenever a source later finds one, that age wins, so
// a character found to be under 18 loses the manual verification. Minor tags on
// a picture still block it either way.
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');

const AGE_FRESH_MS = 30 * 24 * 3600 * 1000;
// Unknown ages are looked up again sooner (sources fill in, MAL comes back).
const UNKNOWN_FRESH_MS = 3 * 24 * 3600 * 1000;

// Tags that mark a picture as showing a child or a younger version: such a
// picture is never shown as spicy, whoever is in it.
const MINOR_TAGS = new Set([
  'loli', 'shota', 'child', 'female_child', 'male_child', 'aged_down', 'toddler', 'baby', 'kindergarten_uniform',
  'elementary_school_student', 'randoseru', 'young', 'younger', 'kid', 'onee-shota', 'oppai_loli', 'flat_chest',
  'Loli', 'Shota', 'Child', 'Kid', 'Younger Version', 'Toddler', 'Baby',
]);

const q = {
  spicy: db.prepare('SELECT spicy_art FROM users WHERE id = ?'),
  setSpicy: db.prepare('UPDATE users SET spicy_art = ? WHERE id = ?'),
  age: db.prepare('SELECT age, fetched_at, basis FROM character_age WHERE character_id = ?'),
  saveAge: db.prepare('INSERT OR REPLACE INTO character_age (character_id, age, fetched_at, basis) VALUES (?, ?, ?, ?)'),
  myCharacters: db.prepare(`
    SELECT DISTINCT e.anilist_id AS id, e.name, e.image_file, e.image_url FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'character' AND (l.owner_id = @me OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))`),
  ageRow: db.prepare(`
    SELECT a.age, a.basis, u.username AS verified_by FROM character_age a LEFT JOIN users u ON u.id = a.verified_by
    WHERE a.character_id = ?`),
  touchAge: db.prepare('UPDATE character_age SET fetched_at = ? WHERE character_id = ?'),
  verify: db.prepare(`
    INSERT OR REPLACE INTO character_age (character_id, age, fetched_at, basis, verified_by) VALUES (?, ?, ?, 'manual', ?)`),
  unverify: db.prepare(`
    UPDATE character_age SET age = NULL, basis = NULL, verified_by = NULL, fetched_at = 0
    WHERE character_id = ? AND basis = 'manual'`),
  adultTags: db.prepare(`
    SELECT t.tag FROM fanart_tags t JOIN character_age a ON a.character_id = t.character_id
    WHERE t.source = 'danbooru' AND t.tag IS NOT NULL AND a.age >= 18`),
  unknownAges: db.prepare(`
    SELECT DISTINCT id FROM (
      SELECT e.anilist_id AS id FROM entries e JOIN lists l ON l.id = e.list_id WHERE l.kind = 'character'
      UNION SELECT character_id AS id FROM ship_members
    ) WHERE id NOT IN (SELECT character_id FROM character_age WHERE age IS NOT NULL OR fetched_at > @cutoff) LIMIT 40`),
};

// The person's spicy level (0-2).
const isSpicy = (userId) => Math.max(0, Math.min(2, Number(q.spicy.get(userId)?.spicy_art) || 0));

// Same parsing as "My type": "28" -> 28, "17-18" -> 17.5, "Unknown" -> null.
function parseAge(age) {
  const nums = String(age ?? '').match(/\d+/g)?.map(Number).filter((n) => n > 0 && n < 100000);
  if (!nums?.length) return null;
  return nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0];
}

// Ages written in a description: an "Age: …" line, or "a 27-year-old". If any
// age found is under 18 (e.g. before a time skip), the lowest one counts.
function ageFromText(text) {
  const s = String(text ?? '').replace(/<[^>]+>/g, ' ');
  const found = [];
  for (const m of s.matchAll(/(?:^|\n|\s)(?:__|\*\*)?\s*Age\s*(?:__|\*\*)?\s*:\s*(?:__|\*\*)?\s*([^\n]{1,60})/gi)) {
    const nums = m[1].match(/\d{1,4}/g)?.map(Number).filter((n) => n > 0 && n < 100000);
    if (nums?.length) found.push(...nums);
  }
  for (const m of s.matchAll(/\b(\d{1,3})[- ]years?[- ]old\b/gi)) found.push(Number(m[1]));
  return found.length ? Math.min(...found) : null;
}

// The age the sources give (AniList, description, MyAnimeList). Throws when
// AniList can't be reached.
async function lookupAge(id) {
  let age = null;
  let basis = null;
  const traits = require('./traits').getCharacterTraits(id);
  let detail = null;
  if (traits?.facts?.age != null) {
    age = traits.facts.age;
    basis = 'anilist';
  } else {
    detail = await require('./characters').fetchCharacterDetail(id);
    age = parseAge(detail.age);
    if (age != null) basis = 'anilist';
  }
  // AniList has no age: look for one in the description.
  if (age == null) {
    detail = detail ?? (await require('./characters').fetchCharacterDetail(id));
    age = ageFromText(detail.description);
    if (age != null) basis = 'description';
  }
  // Still nothing: MyAnimeList's character profile (when Jikan is reachable).
  if (age == null) {
    const about = await require('./pictures').malAbout(id).catch(() => null);
    age = ageFromText(about);
    if (age != null) basis = 'myanimelist';
  }
  return { age, basis };
}

async function characterAge(id) {
  const cached = q.age.get(id);
  const fresh = cached && Date.now() - cached.fetched_at < (cached.age == null ? UNKNOWN_FRESH_MS : AGE_FRESH_MS);
  if (fresh) return cached.age;
  let found;
  try {
    found = await lookupAge(id);
  } catch {
    return cached?.age ?? null; // AniList down: use what we had (or treat as unknown)
  }
  // Still no source age: a manual verification stays.
  if (found.age == null && cached?.basis === 'manual') {
    q.touchAge.run(Date.now(), id);
    return cached.age;
  }
  q.saveAge.run(id, found.age, Date.now(), found.basis);
  adultCache = null;
  return found.age;
}

// Uses only the ages already learned from the sources (instant). Missing or
// stale ones are looked up in the background, never while pictures wait; until
// then the character counts as "age unknown" (safe art only).
const refreshing = new Set();
function refreshAgeLater(id) {
  if (refreshing.has(id)) return;
  refreshing.add(id);
  characterAge(id)
    .catch(() => {})
    .finally(() => refreshing.delete(id));
}
async function allAdults(ids) {
  if (!ids?.length) return false;
  let ok = true;
  for (const id of ids) {
    const row = q.age.get(id);
    const fresh = row && Date.now() - row.fetched_at < (row.age == null ? UNKNOWN_FRESH_MS : AGE_FRESH_MS);
    if (!fresh) refreshAgeLater(id);
    if (row?.age == null || row.age < 18) ok = false;
  }
  return ok;
}

// Danbooru tags of characters known to be adults (rebuilt every few minutes).
let adultCache = null;
function adultTags() {
  if (!adultCache || Date.now() - adultCache.at > 5 * 60 * 1000) {
    adultCache = { at: Date.now(), tags: new Set(q.adultTags.all().map((r) => r.tag)) };
  }
  return adultCache.tags;
}

const hasMinorTag = (tags) => [...(tags ?? [])].some((t) => MINOR_TAGS.has(t));

// May this spicy Danbooru picture be shown? Every character in it must be a
// known adult, and no tag may suggest a minor.
function danbooruSpicyOk(item) {
  if (!item.spicy) return true;
  const chars = item.characters ?? [];
  if (!chars.length) return false;
  const adults = adultTags();
  if (!chars.every((c) => adults.has(c))) return false;
  const tags = item.all ?? new Set(String(item.tags ?? '').split(/\s+/));
  return !hasMinorTag(tags);
}

// Learn the ages of characters in lists and ships in the background, so the
// adults-only rule knows them before anyone opens their art.
let warming = false;
async function warmAges() {
  if (warming) return;
  warming = true;
  try {
    for (const { id } of q.unknownAges.all({ cutoff: Date.now() - UNKNOWN_FRESH_MS })) {
      await characterAge(id);
      // the Danbooru tag is needed for checking characters in pictures
      await require('./fanart').danbooruTag(id).catch(() => null);
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    warming = false;
  }
}
function startAgeWarm() {
  setTimeout(() => warmAges().catch(() => {}), 45_000);
  setInterval(() => warmAges().catch(() => {}), 2 * 3600 * 1000);
}

const router = express.Router();
// The characters in your lists and what the adults-only rule knows about them.
router.get('/me/spicy/ages', (req, res) => {
  const rows = q.myCharacters.all({ me: req.user.id }).map((c) => {
    const a = q.ageRow.get(c.id);
    return {
      id: c.id, name: c.name, image: c.image_file ? `/images/${c.image_file}` : c.image_url,
      age: a?.age ?? null, basis: a?.basis ?? null, verifiedBy: a?.verified_by ?? null, checked: !!a,
    };
  });
  res.json({
    adults: rows.filter((r) => r.age != null && r.age >= 18),
    minors: rows.filter((r) => r.age != null && r.age < 18),
    unknown: rows.filter((r) => r.age == null),
    checking: warming,
  });
});

const SOURCE_NAME = { anilist: 'AniList', description: 'Their description', myanimelist: 'MyAnimeList' };

// Verify a character in your lists as an adult, when no source gives an age.
router.put('/me/spicy/ages/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  if (!isSpicy(req.user.id)) throw new HttpError(403, 'Switch on spicy art first');
  if (!q.myCharacters.all({ me: req.user.id }).some((c) => c.id === id)) throw new HttpError(404, 'Not a character in your lists');
  const age = Number(req.body?.age);
  if (!Number.isInteger(age) || age < 18 || age > 100000) throw new HttpError(400, 'Enter their age (18 or older)');
  if (req.body?.confirm !== true) throw new HttpError(400, 'Confirm that the character is an adult in canon');
  // A known age can't be overridden. If the sources were checked recently and
  // gave nothing, that result is used (fast); otherwise they're checked now.
  const cached = q.age.get(id);
  const recentlyUnknown = cached && cached.age == null && !cached.basis && Date.now() - cached.fetched_at < UNKNOWN_FRESH_MS;
  let found = { age: null, basis: null };
  if (!recentlyUnknown) {
    try {
      found = await lookupAge(id);
    } catch {
      throw new HttpError(503, "Couldn't check AniList right now, try again in a moment");
    }
  }
  if (found.age != null) {
    q.saveAge.run(id, found.age, Date.now(), found.basis);
    adultCache = null;
    throw new HttpError(409, found.age < 18
      ? `${SOURCE_NAME[found.basis] ?? 'A source'} gives an age under 18, so this character can't be verified as an adult`
      : 'An age was just found for this character, no need to verify');
  }
  q.verify.run(id, age, Date.now(), req.user.id);
  adultCache = null;
  res.json({ ok: true });
}));

// Undo a manual verification (the character goes back to "no known age").
router.delete('/me/spicy/ages/:id', (req, res) => {
  q.unverify.run(parseId(req.params.id));
  adultCache = null;
  warmAges().catch(() => {});
  res.json({ ok: true });
});

router.put('/me/spicy', (req, res) => {
  // { level: 0 | 1 | 2 }, or the older { on: true/false } (= level 1 / 0).
  const level = typeof req.body?.on === 'boolean' ? (req.body.on ? 1 : 0) : req.body?.level;
  if (![0, 1, 2].includes(level)) throw new HttpError(400, 'Expected level: 0, 1 or 2');
  q.setSpicy.run(level, req.user.id);
  if (level) warmAges().catch(() => {});
  res.json({ spicyArt: level });
});

const invalidateAdultTags = () => {
  adultCache = null;
};

module.exports = { invalidateAdultTags, adultRouter: router, isSpicy, allAdults, characterAge, adultTags, danbooruSpicyOk, hasMinorTag, MINOR_TAGS, startAgeWarm };
