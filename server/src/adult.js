// "Spicy art": suggestive but not explicit fan art (Danbooru "sensitive",
// Zerochan ecchi/fanservice, Wallhaven "sketchy"). Off by default, per person.
//
// Firm rule: spicy pictures are only ever shown for characters the app KNOWS
// are adults (AniList age 18+), never with tags that indicate minors, and never
// questionable/explicit content. Characters without a known age get safe art.
const express = require('express');
const { db } = require('./db');
const { HttpError } = require('./http');

const AGE_FRESH_MS = 30 * 24 * 3600 * 1000;

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
  age: db.prepare('SELECT age, fetched_at FROM character_age WHERE character_id = ?'),
  saveAge: db.prepare('INSERT OR REPLACE INTO character_age (character_id, age, fetched_at) VALUES (?, ?, ?)'),
  adultTags: db.prepare(`
    SELECT t.tag FROM fanart_tags t JOIN character_age a ON a.character_id = t.character_id
    WHERE t.source = 'danbooru' AND t.tag IS NOT NULL AND a.age >= 18`),
  unknownAges: db.prepare(`
    SELECT DISTINCT id FROM (
      SELECT e.anilist_id AS id FROM entries e JOIN lists l ON l.id = e.list_id WHERE l.kind = 'character'
      UNION SELECT character_id AS id FROM ship_members
    ) WHERE id NOT IN (SELECT character_id FROM character_age) LIMIT 40`),
};

const isSpicy = (userId) => !!q.spicy.get(userId)?.spicy_art;

// Same parsing as "My type": "28" -> 28, "17-18" -> 17.5, "Unknown" -> null.
function parseAge(age) {
  const nums = String(age ?? '').match(/\d+/g)?.map(Number).filter((n) => n > 0 && n < 100000);
  if (!nums?.length) return null;
  return nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0];
}

async function characterAge(id) {
  const cached = q.age.get(id);
  if (cached && Date.now() - cached.fetched_at < AGE_FRESH_MS) return cached.age;
  let age = null;
  try {
    const traits = require('./traits').getCharacterTraits(id);
    if (traits?.facts?.age != null) age = traits.facts.age;
    else {
      const d = await require('./characters').fetchCharacterDetail(id);
      age = parseAge(d.age);
    }
  } catch {
    return cached?.age ?? null; // AniList down: use what we had (or treat as unknown)
  }
  q.saveAge.run(id, age, Date.now());
  adultCache = null;
  return age;
}

async function allAdults(ids) {
  if (!ids?.length) return false;
  for (const id of ids) {
    const age = await characterAge(id);
    if (age == null || age < 18) return false;
  }
  return true;
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
    for (const { id } of q.unknownAges.all()) {
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
router.put('/me/spicy', (req, res) => {
  if (typeof req.body?.on !== 'boolean') throw new HttpError(400, 'Expected on: true/false');
  q.setSpicy.run(req.body.on ? 1 : 0, req.user.id);
  if (req.body.on) warmAges().catch(() => {});
  res.json({ spicyArt: req.body.on });
});

const invalidateAdultTags = () => {
  adultCache = null;
};

module.exports = { invalidateAdultTags, adultRouter: router, isSpicy, allAdults, characterAge, adultTags, danbooruSpicyOk, hasMinorTag, MINOR_TAGS, startAgeWarm };
