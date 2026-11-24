// Export your whole sketchbook as one .tar archive (streamed, any size):
// drawings, references and Clip Studio originals with readable names, plus
// index.csv / index.json (dates, lessons, scores, critiques), projects and
// portfolio reviews. Windows 11, macOS and Linux open .tar files natively.
const fs = require('fs');
const path = require('path');

// A ustar header for one file.
function tarHeader(name, size, mtime) {
  const h = Buffer.alloc(512, 0);
  let prefix = '';
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 154);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  h.write(base.slice(0, 100), 0, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148);
  h.write('0', 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  h.write(prefix.slice(0, 155), 345, 'utf8');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

const safe = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'untitled';
const day = (ts) => new Date(ts).toISOString().slice(0, 10);
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

class TarStream {
  constructor(res) {
    this.res = res;
  }
  write(buf) {
    return new Promise((resolve) => (this.res.write(buf) ? resolve() : this.res.once('drain', resolve)));
  }
  async addBuffer(name, buf, mtime = Date.now()) {
    await this.write(tarHeader(name, buf.length, mtime));
    await this.write(buf);
    const pad = (512 - (buf.length % 512)) % 512;
    if (pad) await this.write(Buffer.alloc(pad, 0));
  }
  async addFile(name, file, mtime) {
    let st;
    try {
      st = await fs.promises.stat(file);
    } catch {
      return false;
    }
    await this.write(tarHeader(name, st.size, mtime ?? st.mtimeMs));
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(file);
      rs.on('data', (chunk) => {
        if (!this.res.write(chunk)) {
          rs.pause();
          this.res.once('drain', () => rs.resume());
        }
      });
      rs.on('end', resolve);
      rs.on('error', reject);
    });
    const pad = (512 - (st.size % 512)) % 512;
    if (pad) await this.write(Buffer.alloc(pad, 0));
    return true;
  }
  async end() {
    await this.write(Buffer.alloc(1024, 0));
    this.res.end();
  }
}

// drawings: DB rows; dirs: { DRAW_DIR, REF_DIR, CLIP_DIR }; lessonTitle(id); extra: { projects, reviews }
async function exportSketchbook(res, { username, drawings, dirs, lessonTitle, projects, reviews }) {
  const root = `atelier-${safe(username)}-${day(Date.now())}`;
  res.set('Content-Type', 'application/x-tar');
  res.set('Content-Disposition', `attachment; filename="${root}.tar"`);
  const tar = new TarStream(res);
  const index = [];
  for (const d of drawings) {
    const base = `${day(d.created_at)}_${d.id}_${safe(d.title ?? d.exercise_id ?? d.kind)}`;
    const entry = { id: d.id, date: new Date(d.created_at).toISOString(), title: d.title, kind: d.kind, lesson: d.lesson_id ? `${d.lesson_id} (${lessonTitle(d.lesson_id) ?? ''})` : null, area: d.area, project: d.project_id ? projects.find((p) => p.id === d.project_id)?.title ?? null : null, shared: !!d.shared, files: {} };
    if (d.file && (await tar.addFile(`${root}/drawings/${base}.jpg`, path.join(dirs.DRAW_DIR, d.file), d.created_at))) entry.files.drawing = `drawings/${base}.jpg`;
    if (d.reference_file && (await tar.addFile(`${root}/references/${base}.jpg`, path.join(dirs.REF_DIR, d.reference_file), d.created_at))) entry.files.reference = `references/${base}.jpg`;
    if (d.clip_file && (await tar.addFile(`${root}/clips/${base}.clip`, path.join(dirs.CLIP_DIR, d.clip_file), d.created_at))) entry.files.clip = `clips/${base}.clip`;
    try {
      entry.selfScores = d.self_scores ? JSON.parse(d.self_scores) : null;
      const c = d.critique ? JSON.parse(d.critique) : null;
      entry.critique = c && !c.refused ? { level: c.level ?? null, summary: c.summary, scores: c.scores, nextStep: c.nextStep } : null;
      const clip = d.clip_info ? JSON.parse(d.clip_info) : null;
      entry.clip = clip ? { workMinutes: clip.workMinutes, layers: clip.layers.length, size: `${clip.width}x${clip.height}` } : null;
    } catch {
      // keep going
    }
    if (entry.files.drawing || entry.files.clip) index.push(entry);
  }
  const csv = [
    ['date', 'title', 'kind', 'lesson', 'area', 'project', 'drawing', 'clip', 'self_avg', 'critique_avg', 'critique_summary'].join(','),
    ...index.map((e) => {
      const avg = (o) => {
        const v = Object.values(o ?? {}).map(Number);
        return v.length ? (v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : '';
      };
      return [e.date.slice(0, 10), e.title, e.kind, e.lesson, e.area, e.project, e.files.drawing, e.files.clip, avg(e.selfScores), avg(e.critique?.scores), e.critique?.summary].map(csvCell).join(',');
    }),
  ].join('\n');
  await tar.addBuffer(`${root}/index.csv`, Buffer.from(`﻿${csv}`, 'utf8'));
  await tar.addBuffer(`${root}/index.json`, Buffer.from(JSON.stringify(index, null, 2)));
  await tar.addBuffer(`${root}/projects.json`, Buffer.from(JSON.stringify(projects, null, 2)));
  await tar.addBuffer(`${root}/portfolio-reviews.json`, Buffer.from(JSON.stringify(reviews, null, 2)));
  await tar.addBuffer(`${root}/README.txt`, Buffer.from(`Your Atelier sketchbook, exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.\n\ndrawings/   your drawings (date_id_title.jpg)\nreferences/ the references they were drawn from\nclips/      original Clip Studio files\nindex.csv   one row per drawing (opens in Excel)\nindex.json  the same with scores and critiques\n`));
  await tar.end();
}

module.exports = { exportSketchbook };
