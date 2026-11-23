// Small helpers that keep the lesson files short and consistent.
//
// A lesson:
//   { id, stage, unit?, title, area, skills[], minutes, why, theory[], points[],
//     mistakes[], csp: { title, steps[], search }, watch[], exercises[] }
// An exercise:
//   { id, kind: 'drill'|'study'|'memory'|'project', title, prompt, minutes,
//     count?, refs?: { tags[], note? }, psd? }
// refs.tags are Danbooru-style tags for the Art search; "$character" is replaced
// with one of your own characters (from your Anime Hub lists).

// Video and reading links. YouTube links are searches for that creator and
// topic (always current); course sites link straight to their pages.
const yt = (by, topic, note) => ({
  by,
  title: topic,
  note: note ?? null,
  url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${by} ${topic}`)}`,
});
const site = (by, title, url, note) => ({ by, title, note: note ?? null, url });

const drill = (id, title, prompt, minutes, extra = {}) => ({ id, kind: 'drill', title, prompt, minutes, ...extra });
const study = (id, title, prompt, minutes, refs, extra = {}) => ({ id, kind: 'study', title, prompt, minutes, refs, psd: true, ...extra });
const memory = (id, title, prompt, minutes, extra = {}) => ({ id, kind: 'memory', title, prompt, minutes, ...extra });
const project = (id, title, prompt, minutes, refs, extra = {}) => ({ id, kind: 'project', title, prompt, minutes, refs, psd: !!refs, ...extra });

// Clip Studio Paint tip box; `search` finds the matching tutorials on Clip
// Studio's own tips site.
const csp = (title, steps, search) => ({
  title,
  steps,
  url: `https://www.google.com/search?q=${encodeURIComponent(`site:tips.clip-studio.com ${search ?? title}`)}`,
});

module.exports = { yt, site, drill, study, memory, project, csp };
