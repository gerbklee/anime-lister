// Example media for lessons, from public sources:
//  - Wikimedia Commons (free licences, no key): animated GIFs, videos and
//    pictures for hand-picked searches per lesson (old-master studies,
//    Bridgman's Constructive Anatomy, Loomis, perspective animations...).
//  - YouTube (optional, needs YOUTUBE_API_KEY): the videos the lesson
//    recommends ("Proko – gesture drawing"), found once and embedded.
// Results are cached on disk for weeks; Commons is asked politely (one
// request at a time, spaced out), because it rate-limits bursts.
const diskCache = require('../disk-cache');

const UA = { 'User-Agent': 'AtelierDrawingSchool/1.0 (self-hosted, non-commercial art school)', 'Api-User-Agent': 'AtelierDrawingSchool/1.0' };
const DAY = 24 * 3600 * 1000;

// Hand-picked Commons searches per lesson (best first).
const COMMONS = {
  's0-how': ['Tutorial- an illustration from A to Z with Krita', 'artist sketchbook drawing studies'],
  's0-csp': ['Krita tutorial', 'graphics tablet drawing'],
  's0-tablet': ['graphics tablet drawing', 'drawing tablet pen'],
  's0-routine': ['artist sketchbook', 'sketchbook drawing'],
  's1-lines': ['hatching drawing study', 'pen and ink line drawing study'],
  's1-ellipses': ['circle in perspective', 'ellipse perspective drawing'],
  's1-forms': ['geometric solids drawing', 'cube cylinder sphere drawing'],
  's1-persp1': ['Animation of the representation of the horizon', 'one point perspective'],
  's1-persp23': ['two point perspective', 'Lineynaya perspektiva', 'three point perspective'],
  's1-objects': ['Rectangular Prisms in a Two-Point Perspective Grid', 'perspective drawing objects'],
  's1-observe': ['sight-size drawing', 'proportion drawing measuring'],
  's2-gesture': ['Gesture Drawing Pose', 'figure sketches pen study', 'croquis figure'],
  's2-proportions': ['human body proportions drawing', 'Vitruvian proportions'],
  's2-mannequin': ['artist mannequin', 'wooden lay figure'],
  's2-balance': ['Gesture Drawing Pose- What is Line of Action', 'contrapposto'],
  's2-foreshortening': ['foreshortening drawing', 'Foreshortening in a Two-Point Perspective Grid'],
  's2-project': ['figure studies sheet drawing', 'studies of figures pen'],
  's3-torso': ['Constructive anatomy (1920)', 'Bridgman constructive anatomy torso'],
  's3-arms': ['Constructive anatomy (1920) arm', 'arm study drawing'],
  's3-legs': ['Constructive anatomy (1920) leg', 'leg study drawing'],
  's3-hands': ['Drawing the Head and Hands', 'study of hands drawing', 'hand study Durer'],
  's3-feet': ['Constructive anatomy (1920) foot', 'study of feet drawing'],
  's3-neck': ['Drawing the Head and Hands', 'Constructive anatomy (1920) neck'],
  's3-project': ['anatomical studies Leonardo', 'Constructive anatomy (1920)'],
  's4-head': ['Drawing the Head and Hands', 'Rotating human head with labeled anatomic planes'],
  's4-eyes': ['Manga technique - Drawing', 'manga eye drawing'],
  's4-features': ['Drawing the Head and Hands', 'profile drawing study'],
  's4-expressions': ['Le Brun expressions des passions', 'facial expressions drawing'],
  's4-hair': ['manga hair drawing', 'hair study drawing'],
  's4-project': ['Le Brun expressions des passions', 'character expression sheet'],
  's5-folds': ['Study of Drapery', 'drapery study'],
  's5-weight': ['drapery study Leonardo', 'Drapery Study MET'],
  's5-wrap': ['costume study drawing', 'fashion illustration drawing'],
  's5-costume': ['armour design drawing', 'costume design drawing'],
  's5-project': ['fashion plate', 'costume study figure'],
  's6-values': ['ART VALUE SCALE', 'grisaille study', 'chiaroscuro drawing'],
  's6-form-shading': ['chiaroscuro sphere', 'Flat Gouraud Shading', 'shading sphere drawing'],
  's6-light-sources': ['chiaroscuro painting', 'candlelight painting'],
  's6-cel': ['Flat-shading-sample', 'cel shading'],
  's6-soft': ['sfumato', 'chalk portrait study'],
  's6-project': ['Monet haystacks series', 'light study painting'],
  's7-hsv': ['ColorRotate', 'HSV color solid', 'color wheel'],
  's7-temperature': ['warm and cool colors', 'color temperature'],
  's7-palettes': ['As cores análogas do círculo cromático', 'complementary colors', 'color harmony'],
  's7-anime-colour': ['anime style illustration', 'cel animation colour'],
  's7-project': ['Rouen Cathedral Monet series', 'color study sketch'],
  's8-thumbnails': ['thumbnail sketches', 'compositional studies drawing'],
  's8-focal': ['rule of thirds', 'golden ratio composition painting'],
  's8-camera': ['low angle shot', 'Dutch angle'],
  's8-backgrounds': ['anime background art', 'two point perspective street drawing'],
  's8-project': ['Tutorial- an illustration from A to Z with Krita', 'digital illustration process'],
  's9-lineart': ['Tutorial- a Comic strip from A to Z with Krita', 'comic inking'],
  's9-polish': ['Tutorial- an illustration from A to Z with Krita', 'digital painting process'],
  's9-masters': ['copyist Louvre painting', 'master copy drawing'],
  's9-style': ['Vergleich zwischen Manga und Foto', 'manga style comparison'],
  's9-project': ['Tutorial- an illustration from A to Z with Krita', 'digital illustration'],
  's10-workflow': ['Krita tutorial', 'digital painting workflow'],
  's10-design': ['model sheet animation character', 'character design sheet'],
  's10-briefs': ['concept art sketches', 'illustration sketches'],
  's10-speed': ['speed painting', 'digital speedpaint'],
  's10-portfolio': ['artist portfolio', 'illustration portfolio'],
  'bg-interiors': ['interior perspective drawing', 'room interior sketch'],
  'bg-streets': ['street perspective drawing', 'Tokyo street alley', 'cityscape drawing'],
  'bg-nature': ['tree study drawing', 'landscape study oil sketch', 'rocks study drawing'],
  'bg-sky': ['cloud study painting', 'Constable cloud study', 'sunset sky clouds'],
  'bg-integrate': ['figure in landscape painting', 'Krita tutorial illustration'],
  'mx-metal-glass': ['armour study drawing', 'glass still life painting', 'gemstone'],
  'mx-hair-eyes': ['eye drawing study', 'hair study drawing'],
  'mx-effects': ['fire animation gif', 'lightning', 'fireworks'],
  'mx-weather': ['rain animation', 'snowfall', 'rain painting'],
  'ms-staging': ['two figures drawing study', 'conversation painting'],
  'ms-contact': ['embrace drawing study', 'two figures sketch'],
  'ms-group': ['group composition painting', 'crowd study drawing'],
  'ms-story': ['narrative painting', 'genre painting'],
  'ms-project': ['Tutorial- an illustration from A to Z with Krita', 'festival lanterns night'],
  'cd-silhouette': ['silhouette character design', 'shape language'],
  'cd-costume': ['costume design drawing', 'fashion plate colour'],
  'cd-turnaround': ['model sheet animation character', 'turnaround character'],
  'cd-sheet': ['model sheet animation character', 'character design sheet'],
  'cd-vtuber': ['virtual youtuber', 'Live2D'],
  'mg-panels': ['Manga technique - Drawing', 'comic page layout'],
  'mg-storytelling': ['storyboard', 'comic strip'],
  'mg-tone': ['screentone', 'manga screentone'],
  'mg-lettering': ['speech balloon comic', 'lettering comics'],
  'mg-short': ['Tutorial- a Comic strip from A to Z with Krita', 'manga page'],
  'biz-pricing': ['artist studio workspace', 'illustrator at work'],
  'biz-audience': ['art exhibition', 'artist booth convention'],
  'biz-clients': ['concept art sketches', 'illustration sketches'],
  'biz-files': ['CMYK color model', 'halftone print'],
  'kv-poses': ['dynamic pose drawing', 'action figure drawing'],
  'kv-layers': ['depth of field', 'bokeh'],
  'kv-polish': ['digital painting process', 'Tutorial- an illustration from A to Z with Krita'],
  'kv-piece': ['digital illustration', 'Tutorial- an illustration from A to Z with Krita'],
  'a1-life': ['académie drawing', 'life drawing study'],
  'a1-soft-forms': ['académie drawing', 'Prud’hon figure study'],
  'a2-adult': ['human body proportions drawing', 'figure proportion'],
  'a3-curves': ['contrapposto', 'pin-up art'],
  'a3-camera': ['pin-up art', 'figure drawing'],
  'a4-expression': ['portrait study drawing', 'facial expressions drawing'],
  'a5-skin': ['flesh tones painting', 'Bouguereau'],
  'a6-swim': ['swimsuit fashion illustration', 'bathing costume fashion plate'],
  'a6-sheer': ['wet drapery sculpture', 'drapery study'],
  'a7-nude': ['academic nude study', 'reclining nude painting'],
  'a8-portfolio': ['pin-up art', 'illustration portfolio'],
};

// Outside the adult track, skip anything whose title hints at nudity.
const UNSAFE = /\b(nude|nudes|naked|nackt|nu |erotic|erotik|sex|breast|topless|lingerie|bikini|pin-?up)\b/i;
const OK_MIME = /^(image\/(jpeg|png|gif|webp|svg\+xml)|video\/(webm|ogg)|application\/ogg)$/;

// One Commons request at a time, at least 1.5 s apart.
let queue = Promise.resolve();
let last = 0;
function politely(fn) {
  const run = queue.then(async () => {
    const wait = Math.max(0, last + 1500 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

const strip = (html) => String(html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function commonsSearch(q, { adult }) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&maxlag=5&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|mime|mediatype|extmetadata|size&iiurlwidth=800&iiextmetadatafilter=Artist|LicenseShortName|ImageDescription`;
  const r = await politely(() => fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }));
  if (!r.ok) throw new Error(`Commons ${r.status}`);
  const j = await r.json();
  return Object.values(j.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii || !OK_MIME.test(ii.mime)) return null;
      if (ii.mime.includes('ogg') && ii.mediatype !== 'VIDEO') return null;
      const title = p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
      if (!adult && UNSAFE.test(title)) return null;
      if ((ii.width ?? 0) < 200 && !ii.mime.includes('svg')) return null;
      const md = ii.extmetadata ?? {};
      const kind = ii.mime === 'image/gif' ? 'gif' : ii.mediatype === 'VIDEO' || ii.mime.startsWith('video') ? 'video' : 'image';
      return {
        kind,
        title,
        thumb: ii.thumburl ?? ii.url,
        src: kind === 'image' ? ii.thumburl ?? ii.url : ii.url,
        page: ii.descriptionurl,
        author: strip(md.Artist?.value).slice(0, 80) || null,
        license: strip(md.LicenseShortName?.value) || null,
      };
    })
    .filter(Boolean);
}

async function commonsFor(lesson) {
  const adult = !!lesson.unit;
  const key = `atelier-media|commons|v1|${lesson.id}`;
  const hit = diskCache.kvGet(key);
  if (hit) return hit;
  const seen = new Set();
  const items = [];
  let failed = false;
  for (const q of COMMONS[lesson.id] ?? [lesson.title]) {
    try {
      for (const it of await commonsSearch(q, { adult })) {
        if (seen.has(it.page)) continue;
        seen.add(it.page);
        items.push(it);
      }
    } catch {
      failed = true;
    }
    if (items.length >= 12) break;
  }
  // Moving pictures first: GIFs and videos show the process.
  const order = { gif: 0, video: 1, image: 2 };
  const out = items.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 12);
  // Cache good results for two weeks; partial ones only briefly.
  diskCache.kvSet(key, out, failed && out.length < 4 ? DAY / 4 : 14 * DAY);
  return out;
}

// YouTube: the lesson's recommended videos, one search each (with a key).
const youtubeAvailable = () => !!process.env.YOUTUBE_API_KEY;
async function youtubeFor(lesson) {
  if (!youtubeAvailable()) return [];
  const key = `atelier-media|yt|v1|${lesson.id}`;
  const hit = diskCache.kvGet(key);
  if (hit) return hit;
  const out = [];
  for (const w of (lesson.watch ?? []).filter((x) => /youtube\.com/.test(x.url)).slice(0, 3)) {
    const q = `${w.by} ${w.title}`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=strict&maxResults=3&q=${encodeURIComponent(q)}&key=${process.env.YOUTUBE_API_KEY}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const j = await r.json();
      const items = j.items ?? [];
      // Prefer the creator the lesson names.
      const pick = items.find((i) => i.snippet.channelTitle.toLowerCase().includes(w.by.toLowerCase().split(' ')[0])) ?? items[0];
      if (pick && !out.some((o) => o.id === pick.id.videoId)) out.push({ id: pick.id.videoId, title: strip(pick.snippet.title), channel: pick.snippet.channelTitle, about: w.title });
    } catch {
      // skip
    }
  }
  diskCache.kvSet(key, out, out.length ? 30 * DAY : DAY);
  return out;
}

async function lessonMedia(lesson) {
  const [commons, videos] = await Promise.all([commonsFor(lesson).catch(() => []), youtubeFor(lesson).catch(() => [])]);
  return { items: commons, videos, youtube: youtubeAvailable() };
}

module.exports = { lessonMedia, COMMONS };
