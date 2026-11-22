// "My type": character traits and the type they add up to.
//
// Per character (cached in character_traits):
//   looks  – share of the character's solo Safebooru pictures carrying a tag
//            (black_hair 0.9, glasses 0.4 …), mapped to friendly labels
//   facts  – gender, age, height, star sign, blood type, main character (AniList)
//   taste  – main series, its genres, Japanese voice actor, popularity
// Traits are fetched slowly in the background (they need several requests per
// character); the type endpoints report how many are still pending.
//
// A type is the rank-weighted average over a user's lists of one category
// (#1 of 10 weighs 1.0, #10 of 10 weighs 0.1).
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { fetchAnimeCharacters } = require('./anilist');
const { fetchCharacterDetail } = require('./characters');
const { guessTag, sbTagCounts } = require('./pictures');
const { getUser } = require('./users');

const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Safebooru tags -> friendly label, by group.
const LOOKS = {
  hair: {
    black_hair: 'Black hair', brown_hair: 'Brown hair', blonde_hair: 'Blonde hair', white_hair: 'White hair',
    grey_hair: 'Grey hair', red_hair: 'Red hair', orange_hair: 'Orange hair', pink_hair: 'Pink hair',
    purple_hair: 'Purple hair', blue_hair: 'Blue hair', green_hair: 'Green hair', aqua_hair: 'Aqua hair',
    multicolored_hair: 'Two-tone hair',
  },
  hairStyle: {
    short_hair: 'Short hair', medium_hair: 'Medium hair', long_hair: 'Long hair', very_long_hair: 'Very long hair',
    ponytail: 'Ponytail', twintails: 'Twintails', braid: 'Braid', hair_bun: 'Hair bun', bald: 'Bald',
    ahoge: 'Ahoge', hair_over_one_eye: 'Hair over one eye', undercut: 'Undercut', spiked_hair: 'Spiky hair',
  },
  eyes: {
    black_eyes: 'Black eyes', brown_eyes: 'Brown eyes', blue_eyes: 'Blue eyes', green_eyes: 'Green eyes',
    red_eyes: 'Red eyes', purple_eyes: 'Purple eyes', yellow_eyes: 'Golden eyes', grey_eyes: 'Grey eyes',
    orange_eyes: 'Orange eyes', pink_eyes: 'Pink eyes', aqua_eyes: 'Aqua eyes', heterochromia: 'Heterochromia',
  },
  features: {
    glasses: 'Glasses', sunglasses: 'Sunglasses', eyepatch: 'Eyepatch', scar: 'Scar', scar_on_face: 'Facial scar',
    facial_hair: 'Facial hair', beard: 'Beard', stubble: 'Stubble', mustache: 'Moustache', muscular: 'Muscular',
    muscular_male: 'Muscular', muscular_female: 'Muscular', abs: 'Abs', mole_under_eye: 'Mole under eye',
    freckles: 'Freckles', dark_skin: 'Dark skin', fang: 'Fangs', tattoo: 'Tattoo', earrings: 'Earrings',
    piercing: 'Piercings', horns: 'Horns', animal_ears: 'Animal ears', pointy_ears: 'Pointy ears', wings: 'Wings',
    tail: 'Tail', mask: 'Mask', makeup: 'Makeup', lipstick: 'Lipstick',
  },
  outfit: {
    suit: 'Suit', necktie: 'Tie', military_uniform: 'Military uniform', school_uniform: 'School uniform',
    japanese_clothes: 'Japanese clothes', kimono: 'Kimono', armor: 'Armour', cape: 'Cape', coat: 'Coat',
    jacket: 'Jacket', hoodie: 'Hoodie', apron: 'Apron', maid: 'Maid outfit', dress: 'Dress', hat: 'Hat',
    gloves: 'Gloves', sword: 'Sword', katana: 'Katana', gun: 'Gun', cigarette: 'Smoker', smoking: 'Smoker',
  },
  vibe: {
    smile: 'Smiling', smirk: 'Smirk', grin: 'Grin', expressionless: 'Expressionless', serious: 'Serious',
    blush: 'Blushing', frown: 'Frowning', angry: 'Angry', crossed_arms: 'Crossed arms',
  },
};
const LIMITS = { hair: [3, 0.15], eyes: [3, 0.15], hairStyle: [3, 0.2], features: [6, 0.2], outfit: [4, 0.2], vibe: [3, 0.2] };

const q = {
  get: db.prepare('SELECT data, fetched_at FROM character_traits WHERE character_id = ?'),
  save: db.prepare('INSERT OR REPLACE INTO character_traits (character_id, data, fetched_at) VALUES (?, ?, ?)'),
  // A user's ranked characters in categorised lists, as visible to the viewer.
  personal: db.prepare(`
    SELECT e.anilist_id AS cid, e.name, e.image_file, e.image_url, e.position AS pos,
           l.id AS list_id, l.name AS list_name, l.category, l.emoji,
           (SELECT COUNT(*) FROM entries x WHERE x.list_id = l.id) AS n
    FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.owner_id = @user AND l.is_shared = 0 AND l.kind = 'character' AND l.category != 'other'`),
  shared: db.prepare(`
    SELECT e.anilist_id AS cid, e.name, e.image_file, e.image_url, r.position AS pos,
           l.id AS list_id, l.name AS list_name, l.category, l.emoji,
           (SELECT COUNT(*) FROM rankings r2 JOIN entries e2 ON e2.id = r2.entry_id
             WHERE e2.list_id = l.id AND r2.user_id = r.user_id) AS n
    FROM rankings r JOIN entries e ON e.id = r.entry_id JOIN lists l ON l.id = e.list_id
    WHERE r.user_id = @user AND l.kind = 'character' AND l.is_shared = 1 AND l.category != 'other'
      AND (l.owner_id = @viewer OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @viewer))`),
  categorised: db.prepare(`
    SELECT DISTINCT e.anilist_id AS id FROM entries e JOIN lists l ON l.id = e.list_id
    WHERE l.kind = 'character' AND l.category != 'other'`),
  catalogue: db.prepare(`
    SELECT anime_id, rating FROM user_anime WHERE user_id = ? AND status != 'dropped'
    ORDER BY COALESCE(rating, 3) DESC, updated_at DESC LIMIT 12`),
};

// ---- Per-character traits ------------------------------------------------------------

function parseAge(age) {
  const nums = String(age ?? '').match(/\d+/g)?.map(Number).filter((n) => n > 0 && n < 2000);
  if (!nums?.length) return null;
  return nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0];
}

function parseHeight(description) {
  const m = String(description ?? '').match(/Height[^\n\d]{0,12}(\d{2,3}(?:[.,]\d)?)\s*cm/i);
  const h = m ? Number(m[1].replace(',', '.')) : null;
  return h && h > 50 && h < 300 ? h : null;
}

const SIGNS = [
  ['Capricorn', 1, 19], ['Aquarius', 2, 18], ['Pisces', 3, 20], ['Aries', 4, 19], ['Taurus', 5, 20], ['Gemini', 6, 20],
  ['Cancer', 7, 22], ['Leo', 8, 22], ['Virgo', 9, 22], ['Libra', 10, 22], ['Scorpio', 11, 21], ['Sagittarius', 12, 21],
];
function zodiac(b) {
  if (!b?.month || !b?.day) return null;
  const [sign, , lastDay] = SIGNS[b.month - 1];
  return b.day <= lastDay ? sign : SIGNS[b.month % 12][0];
}

async function computeTraits(id) {
  const d = await fetchCharacterDetail(id);
  const firstAnime = d.appearances.find((a) => a.type === 'ANIME') ?? d.appearances[0] ?? null;
  const voice = d.voiceActors.find((v) => v.language === 'Japanese') ?? null;

  let looks = null;
  let lookTag = null;
  try {
    const guess = await guessTag({ name: d.name, media: d.appearances.map((a) => ({ romaji: a.romaji, title: a.title })) });
    if (guess.tag) {
      lookTag = guess.tag;
      const { posts, counts } = await sbTagCounts(guess.tag);
      if (posts >= 4) {
        looks = { posts };
        for (const [group, tags] of Object.entries(LOOKS)) {
          const byLabel = {};
          for (const [tag, label] of Object.entries(tags)) {
            const share = (counts.get(tag) ?? 0) / posts;
            if (share >= 0.15) byLabel[label] = Math.max(byLabel[label] ?? 0, Math.round(share * 100) / 100);
          }
          looks[group] = byLabel;
        }
      }
    }
  } catch (err) {
    console.warn(`Looks for character ${id} unavailable: ${err.message}`);
  }

  const traits = {
    name: d.name,
    image: d.image,
    facts: {
      gender: d.gender,
      age: parseAge(d.age),
      height: parseHeight(d.description),
      zodiac: zodiac(d.birthday),
      bloodType: d.bloodType,
      main: d.appearances.some((a) => a.role === 'MAIN'),
      favourites: d.favourites,
    },
    taste: {
      series: firstAnime ? { id: firstAnime.id, title: firstAnime.title, type: firstAnime.type } : null,
      genres: firstAnime?.genres ?? [],
      voice: voice ? { id: voice.id, name: voice.name, image: voice.image } : null,
    },
    looks,
    lookTag,
  };
  q.save.run(id, JSON.stringify(traits), Date.now());
  return traits;
}

function cachedTraits(id) {
  const row = q.get.get(id);
  return row ? JSON.parse(row.data) : null;
}

// ---- Background queue ---------------------------------------------------------------------

const queue = new Set();
let running = false;

function enqueue(ids) {
  for (const id of ids) {
    const row = q.get.get(id);
    if (!row || Date.now() - row.fetched_at > FRESH_MS) queue.add(id);
  }
  run();
}

async function run() {
  if (running) return;
  running = true;
  while (queue.size) {
    const id = queue.values().next().value;
    try {
      await computeTraits(id);
    } catch (err) {
      console.warn(`Traits for character ${id} failed: ${err.message}`);
      if (err.status === 503) await sleep(60_000);
    }
    queue.delete(id);
    await sleep(1500);
  }
  running = false;
}

const isPending = (id) => queue.has(id);

function startTraitBackfill() {
  setTimeout(() => enqueue(q.categorised.all().map((r) => r.id)), 20_000);
}

// ---- Types --------------------------------------------------------------------------------

function weightedTop(map, total, limit, min = 0) {
  return [...map.entries()]
    .map(([label, w]) => ({ label, strength: Math.round((w / total) * 100) / 100 }))
    .filter((x) => x.strength >= min)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);
}

function addTo(map, key, value) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function ageLabel(age) {
  if (age == null) return null;
  if (age < 13) return 'Kids';
  if (age < 20) return 'Teens';
  if (age >= 100) return 'Centuries old';
  return `${Math.floor(age / 10) * 10}s`;
}

function buildType(chars) {
  const missing = chars.filter((c) => !c.t).map((c) => c.cid);
  const analysed = chars.filter((c) => c.t);
  const total = analysed.reduce((s, c) => s + c.weight, 0) || 1;

  // Looks
  const withLooks = analysed.filter((c) => c.t.looks);
  const looksTotal = withLooks.reduce((s, c) => s + c.weight, 0);
  const looks = {};
  if (looksTotal > 0) {
    for (const group of Object.keys(LOOKS)) {
      const m = new Map();
      for (const c of withLooks) for (const [label, share] of Object.entries(c.t.looks[group] ?? {})) addTo(m, label, c.weight * share);
      const [limit, min] = LIMITS[group];
      looks[group] = weightedTop(m, looksTotal, limit, min);
    }
  }

  // Facts
  const gender = new Map();
  const zod = new Map();
  const blood = new Map();
  let ageSum = 0, ageW = 0, ageMin = Infinity, ageMax = -Infinity;
  let hSum = 0, hW = 0, mainW = 0;
  for (const c of analysed) {
    const f = c.t.facts;
    if (f.gender) addTo(gender, f.gender, c.weight);
    if (f.zodiac) addTo(zod, f.zodiac, c.weight);
    if (f.bloodType) addTo(blood, f.bloodType, c.weight);
    if (f.age != null) {
      ageSum += f.age * c.weight;
      ageW += c.weight;
      ageMin = Math.min(ageMin, f.age);
      ageMax = Math.max(ageMax, f.age);
    }
    if (f.height != null) {
      hSum += f.height * c.weight;
      hW += c.weight;
    }
    if (f.main) mainW += c.weight;
  }
  const genderTotal = [...gender.values()].reduce((s, v) => s + v, 0) || 1;
  const zodTotal = [...zod.values()].reduce((s, v) => s + v, 0) || 1;
  const bloodTotal = [...blood.values()].reduce((s, v) => s + v, 0) || 1;
  const age = ageW ? Math.round((ageSum / ageW) * 10) / 10 : null;

  // Taste
  const series = new Map();
  const genres = new Map();
  const voices = new Map();
  const favs = [];
  for (const c of analysed) {
    const t = c.t.taste;
    if (t.series) addTo(series, JSON.stringify({ id: t.series.id, title: t.series.title }), c.weight);
    for (const g of t.genres) addTo(genres, g, c.weight);
    if (t.voice) {
      const v = voices.get(t.voice.id) ?? { ...t.voice, count: 0 };
      v.count += 1;
      voices.set(t.voice.id, v);
    }
    favs.push({ f: c.t.facts.favourites ?? 0, w: c.weight });
  }
  favs.sort((a, b) => a.f - b.f);
  let acc = 0, median = 0;
  for (const x of favs) {
    acc += x.w;
    if (acc >= total / 2) {
      median = x.f;
      break;
    }
  }
  const voice = [...voices.values()].sort((a, b) => b.count - a.count)[0];

  return {
    count: chars.length,
    analysed: analysed.length,
    withLooks: withLooks.length,
    pending: missing.length,
    looks,
    facts: {
      gender: weightedTop(gender, genderTotal, 2),
      age: age != null ? { avg: age, min: ageMin, max: ageMax, label: ageLabel(age) } : null,
      height: hW ? { avg: Math.round(hSum / hW) } : null,
      zodiac: weightedTop(zod, zodTotal, 1)[0] ?? null,
      bloodType: weightedTop(blood, bloodTotal, 1)[0] ?? null,
      mainShare: analysed.length ? Math.round((mainW / total) * 100) / 100 : null,
    },
    taste: {
      series: weightedTop(series, total, 3).map((s) => ({ ...JSON.parse(s.label), strength: s.strength })),
      genres: weightedTop(genres, total, 4),
      voice: voice && voice.count >= 2 ? voice : null,
      popularity: {
        median,
        label: median >= 20000 ? 'Mainstream favourites' : median >= 5000 ? 'Well-known faces' : 'Niche picks',
      },
    },
    collage: [...chars].sort((a, b) => b.weight - a.weight).slice(0, 9).map((c) => ({ id: c.cid, name: c.name, image: c.image })),
  };
}

// Characters per category with weights from the user's own rankings.
function rankedByCategory(userId, viewerId) {
  const rows = [...q.personal.all({ user: userId }), ...q.shared.all({ user: userId, viewer: viewerId })];
  const cats = new Map();
  for (const r of rows) {
    if (!cats.has(r.category)) cats.set(r.category, { chars: new Map(), lists: new Map() });
    const cat = cats.get(r.category);
    cat.lists.set(r.list_id, { id: r.list_id, name: r.list_name, emoji: r.emoji });
    const weight = 1 - (r.pos - 1) / Math.max(r.n, 1);
    const cur = cat.chars.get(r.cid);
    if (!cur || weight > cur.weight) {
      cat.chars.set(r.cid, { cid: r.cid, name: r.name, image: r.image_file ? `/images/${r.image_file}` : r.image_url, weight });
    }
  }
  return cats;
}

function typesFor(userId, viewerId) {
  const cats = rankedByCategory(userId, viewerId);
  const out = [];
  const missing = [];
  for (const category of ['daddy', 'mommy', 'waifu', 'husbando']) {
    const cat = cats.get(category);
    if (!cat) continue;
    const chars = [...cat.chars.values()].map((c) => ({ ...c, t: cachedTraits(c.cid) }));
    missing.push(...chars.filter((c) => !c.t).map((c) => c.cid));
    out.push({ category, lists: [...cat.lists.values()], ...buildType(chars), vector: looksVector(chars) });
  }
  if (missing.length) enqueue(missing);
  return out;
}

// Flat label -> strength vector of a type's looks (for matching).
function looksVector(chars) {
  const v = new Map();
  const withLooks = chars.filter((c) => c.t?.looks);
  const total = withLooks.reduce((s, c) => s + c.weight, 0);
  if (!total) return {};
  for (const c of withLooks) for (const group of Object.keys(LOOKS)) for (const [label, share] of Object.entries(c.t.looks[group] ?? {})) addTo(v, label, (c.weight * share) / total);
  return Object.fromEntries(v);
}

function flatLooks(looks) {
  const v = {};
  for (const group of Object.keys(LOOKS)) Object.assign(v, looks?.[group] ?? {});
  return v;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Characters from anime you've watched that fit your type for a category.
async function suggest(userId, category) {
  const type = typesFor(userId, userId).find((t) => t.category === category);
  if (!type || !type.analysed) return { results: [], pending: type?.pending ?? 0, reason: 'empty' };
  const exclude = new Set(rankedByCategory(userId, userId).get(category)?.chars.keys() ?? []);

  const animeRows = q.catalogue.all(userId);
  if (!animeRows.length) return { results: [], pending: 0, reason: 'no-catalogue' };

  const candidates = new Map();
  for (const a of animeRows) {
    try {
      const { characters } = await fetchAnimeCharacters(a.anime_id, 1);
      for (const c of characters) {
        if (exclude.has(c.id) || c.role === 'BACKGROUND') continue;
        const pre = Math.log10((c.favourites ?? 0) + 10) + (c.role === 'MAIN' ? 1 : 0) + (a.rating ?? 3) / 5;
        const cur = candidates.get(c.id);
        if (!cur || pre > cur.pre) candidates.set(c.id, { ...c, pre, animeId: a.anime_id });
      }
    } catch {
      // skip this anime
    }
  }

  const top = [...candidates.values()].sort((x, y) => y.pre - x.pre).slice(0, 40);
  const typeLooks = type.vector;
  const dominantGender = type.facts.gender[0]?.strength >= 0.7 ? type.facts.gender[0].label : null;
  const topGenres = new Set(type.taste.genres.map((g) => g.label));

  const scored = [];
  const missing = [];
  for (const c of top) {
    const t = cachedTraits(c.id);
    if (!t) {
      missing.push(c.id);
      continue;
    }
    if (dominantGender && t.facts.gender && t.facts.gender !== dominantGender) continue;
    const parts = [];
    const cand = flatLooks(t.looks);
    if (t.looks && Object.keys(typeLooks).length) parts.push([0.55, cosine(typeLooks, cand)]);
    if (type.facts.age && t.facts.age != null) parts.push([0.15, Math.exp(-Math.abs(type.facts.age.avg - t.facts.age) / 10)]);
    if (type.facts.height && t.facts.height != null) parts.push([0.1, Math.exp(-Math.abs(type.facts.height.avg - t.facts.height) / 15)]);
    if (topGenres.size) parts.push([0.2, t.taste.genres.filter((g) => topGenres.has(g)).length / topGenres.size]);
    const wsum = parts.reduce((s, [w]) => s + w, 0);
    if (!wsum) continue;
    const score = parts.reduce((s, [w, v]) => s + w * v, 0) / wsum;
    const shared = Object.entries(cand)
      .filter(([label, share]) => share >= 0.3 && (typeLooks[label] ?? 0) >= 0.25)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([label]) => label);
    scored.push({
      id: c.id,
      name: c.name,
      image: c.image,
      role: c.role,
      anime: t.taste.series,
      match: Math.round(score * 100),
      reasons: shared,
      age: t.facts.age,
    });
  }
  if (missing.length) enqueue(missing);
  scored.sort((a, b) => b.match - a.match);
  return { results: scored.slice(0, 12), pending: missing.filter(isPending).length };
}

// ---- Routes -------------------------------------------------------------------------------

const router = express.Router();

router.get('/types/:userId', (req, res) => {
  const userId = parseId(req.params.userId);
  const user = getUser(userId);
  if (!user) throw new HttpError(404, 'User not found');
  const categories = typesFor(userId, req.user.id).map(({ vector, ...rest }) => rest);
  res.json({ user, categories, pending: categories.reduce((s, c) => s + c.pending, 0) });
});

router.get('/types/me/suggest', wrap(async (req, res) => {
  const category = String(req.query.category ?? '');
  if (!['daddy', 'mommy', 'waifu', 'husbando'].includes(category)) throw new HttpError(400, 'Unknown category');
  res.json(await suggest(req.user.id, category));
}));

module.exports = { traitsRouter: router, enqueueTraits: enqueue, startTraitBackfill, rankedByCategory };
