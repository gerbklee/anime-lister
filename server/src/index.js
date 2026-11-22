const fs = require('fs');
const path = require('path');
const express = require('express');
const { db, IMAGE_DIR } = require('./db');
const { searchCharacters, getCharacter } = require('./anilist');
const { cacheImage, removeImageIfUnused, retryMissingImages } = require('./images');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
}

function cleanListName(value) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'List name is required');
  const name = value.trim();
  if (name.length > 100) throw new HttpError(400, 'List name must be 100 characters or fewer');
  return name;
}

function toEntry(row) {
  return {
    id: row.id,
    listId: row.list_id,
    position: row.position,
    anilistId: row.anilist_id,
    name: row.name,
    image: row.image_file ? `/images/${row.image_file}` : row.image_url,
    seriesTitle: row.series_title,
    seriesOptions: JSON.parse(row.series_options),
    note: row.note,
  };
}

const q = {
  allLists: db.prepare(`
    SELECT l.id, l.name, l.created_at AS createdAt, COUNT(e.id) AS count
    FROM lists l LEFT JOIN entries e ON e.list_id = l.id
    GROUP BY l.id ORDER BY l.id`),
  getList: db.prepare('SELECT id, name, created_at AS createdAt FROM lists WHERE id = ?'),
  insertList: db.prepare('INSERT INTO lists (name) VALUES (?)'),
  renameList: db.prepare('UPDATE lists SET name = ? WHERE id = ?'),
  deleteList: db.prepare('DELETE FROM lists WHERE id = ?'),
  listEntries: db.prepare('SELECT * FROM entries WHERE list_id = ? ORDER BY position'),
  listImageFiles: db.prepare('SELECT DISTINCT image_file FROM entries WHERE list_id = ? AND image_file IS NOT NULL'),
  getEntry: db.prepare('SELECT * FROM entries WHERE id = ?'),
  findEntry: db.prepare('SELECT id FROM entries WHERE list_id = ? AND anilist_id = ?'),
  maxPosition: db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM entries WHERE list_id = ?'),
  insertEntry: db.prepare(`
    INSERT INTO entries (list_id, position, anilist_id, name, image_file, image_url, series_title, series_options)
    VALUES (@listId, @position, @anilistId, @name, @imageFile, @imageUrl, @seriesTitle, @seriesOptions)`),
  updateEntry: db.prepare('UPDATE entries SET note = @note, series_title = @seriesTitle WHERE id = @id'),
  deleteEntry: db.prepare('DELETE FROM entries WHERE id = ?'),
  closeGap: db.prepare('UPDATE entries SET position = position - 1 WHERE list_id = ? AND position > ?'),
  setPosition: db.prepare('UPDATE entries SET position = ? WHERE id = ? AND list_id = ?'),
};

function requireList(id) {
  const list = q.getList.get(id);
  if (!list) throw new HttpError(404, 'List not found');
  return list;
}

const insertAtEnd = db.transaction((values) => {
  const position = q.maxPosition.get(values.listId).max + 1;
  const info = q.insertEntry.run({ ...values, position });
  return info.lastInsertRowid;
});

const removeEntry = db.transaction((entry) => {
  q.deleteEntry.run(entry.id);
  q.closeGap.run(entry.list_id, entry.position);
});

const applyOrder = db.transaction((listId, entryIds) => {
  entryIds.forEach((id, index) => q.setPosition.run(index + 1, id, listId));
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- Search ---------------------------------------------------------------

app.get('/api/search', wrap(async (req, res) => {
  const term = String(req.query.q ?? '').trim();
  if (term.length < 2) return res.json({ results: [] });
  if (term.length > 100) throw new HttpError(400, 'Search term is too long');
  res.json({ results: await searchCharacters(term) });
}));

// ---- Lists ----------------------------------------------------------------

app.get('/api/lists', (req, res) => {
  res.json(q.allLists.all());
});

app.post('/api/lists', (req, res) => {
  const name = cleanListName(req.body?.name);
  const id = q.insertList.run(name).lastInsertRowid;
  res.status(201).json({ ...q.getList.get(id), count: 0 });
});

app.get('/api/lists/:id', (req, res) => {
  const list = requireList(parseId(req.params.id));
  res.json({ ...list, entries: q.listEntries.all(list.id).map(toEntry) });
});

app.patch('/api/lists/:id', (req, res) => {
  const list = requireList(parseId(req.params.id));
  q.renameList.run(cleanListName(req.body?.name), list.id);
  res.json(q.getList.get(list.id));
});

app.delete('/api/lists/:id', (req, res) => {
  const list = requireList(parseId(req.params.id));
  const files = q.listImageFiles.all(list.id).map((r) => r.image_file);
  q.deleteList.run(list.id);
  files.forEach(removeImageIfUnused);
  res.status(204).end();
});

app.put('/api/lists/:id/order', (req, res) => {
  const list = requireList(parseId(req.params.id));
  const ids = req.body?.entryIds;
  const current = q.listEntries.all(list.id).map((r) => r.id);
  const valid =
    Array.isArray(ids) &&
    ids.length === current.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => current.includes(id));
  if (!valid) throw new HttpError(400, 'entryIds must contain every entry of the list exactly once. Reload and try again.');
  applyOrder(list.id, ids);
  res.json({ ok: true });
});

// ---- Entries --------------------------------------------------------------

app.post('/api/lists/:id/entries', wrap(async (req, res) => {
  const list = requireList(parseId(req.params.id));
  const anilistId = parseId(req.body?.anilistId);
  if (q.findEntry.get(list.id, anilistId)) throw new HttpError(409, 'This character is already in the list.');

  const character = await getCharacter(anilistId);

  let imageFile = null;
  try {
    imageFile = await cacheImage(character.image, anilistId);
  } catch (err) {
    console.warn(`Could not cache image for character ${anilistId}: ${err.message}`);
  }

  let id;
  try {
    id = insertAtEnd({
      listId: list.id,
      anilistId,
      name: character.name,
      imageFile,
      imageUrl: character.image,
      seriesTitle: character.series[0] ?? null,
      seriesOptions: JSON.stringify(character.series),
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'This character is already in the list.');
    throw err;
  }
  res.status(201).json(toEntry(q.getEntry.get(id)));
}));

app.patch('/api/entries/:id', (req, res) => {
  const entry = q.getEntry.get(parseId(req.params.id));
  if (!entry) throw new HttpError(404, 'Entry not found');

  let note = entry.note;
  if (req.body?.note !== undefined) {
    if (typeof req.body.note !== 'string') throw new HttpError(400, 'Note must be text');
    note = req.body.note.trim();
    if (note.length > 1000) throw new HttpError(400, 'Note must be 1000 characters or fewer');
  }

  let seriesTitle = entry.series_title;
  if (req.body?.seriesTitle !== undefined) {
    const options = JSON.parse(entry.series_options);
    if (!options.includes(req.body.seriesTitle)) throw new HttpError(400, 'Unknown series for this character');
    seriesTitle = req.body.seriesTitle;
  }

  q.updateEntry.run({ id: entry.id, note, seriesTitle });
  res.json(toEntry(q.getEntry.get(entry.id)));
});

app.delete('/api/entries/:id', (req, res) => {
  const entry = q.getEntry.get(parseId(req.params.id));
  if (!entry) throw new HttpError(404, 'Entry not found');
  removeEntry(entry);
  removeImageIfUnused(entry.image_file);
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Static files ---------------------------------------------------------

app.use('/images', express.static(IMAGE_DIR, { maxAge: '30d', fallthrough: false }));

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
}

// ---- Errors ---------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 && !err.status ? 'Internal server error' : err.message;
  if (req.path.startsWith('/images/')) return res.status(status).end();
  res.status(status).json({ error: message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Anime Lister running on http://0.0.0.0:${PORT}`);
  retryMissingImages().catch((err) => console.warn('Image retry failed:', err.message));
});
