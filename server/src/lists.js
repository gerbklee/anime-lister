// Lists, entries and list members.
//
// Permissions:
//   personal list (is_shared = 0): owner edits; every logged-in user can view
//   shared list   (is_shared = 1): owner + members edit; nobody else sees it
//   rename / delete / manage members: owner only (members may leave)
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { getCharacter } = require('./anilist');
const { cacheImage, removeImageIfUnused } = require('./images');

const ENTRY_SELECT = `
  SELECT e.*, ua.username AS added_by_name, un.username AS note_by_name
  FROM entries e
  LEFT JOIN users ua ON ua.id = e.added_by
  LEFT JOIN users un ON un.id = e.note_by`;

const q = {
  visibleLists: db.prepare(`
    SELECT l.id, l.name, l.is_shared, l.owner_id, u.username AS owner_name,
           (SELECT COUNT(*) FROM entries e WHERE e.list_id = l.id) AS count
    FROM lists l LEFT JOIN users u ON u.id = l.owner_id
    WHERE l.is_shared = 0
       OR l.owner_id = @me
       OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me)
    ORDER BY l.id`),
  getList: db.prepare(`
    SELECT l.*, u.username AS owner_name
    FROM lists l LEFT JOIN users u ON u.id = l.owner_id
    WHERE l.id = ?`),
  isMember: db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?'),
  members: db.prepare(`
    SELECT u.id, u.username FROM list_members m JOIN users u ON u.id = m.user_id
    WHERE m.list_id = ? ORDER BY m.added_at, u.id`),
  insertList: db.prepare('INSERT INTO lists (name, owner_id, is_shared) VALUES (?, ?, ?)'),
  renameList: db.prepare('UPDATE lists SET name = ? WHERE id = ?'),
  deleteList: db.prepare('DELETE FROM lists WHERE id = ?'),
  bump: db.prepare('UPDATE lists SET version = version + 1 WHERE id = ?'),
  makeShared: db.prepare('UPDATE lists SET is_shared = 1 WHERE id = ?'),
  addMember: db.prepare('INSERT OR IGNORE INTO list_members (list_id, user_id) VALUES (?, ?)'),
  removeMember: db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?'),
  userByName: db.prepare('SELECT id, username FROM users WHERE username = ?'),
  listEntries: db.prepare(`${ENTRY_SELECT} WHERE e.list_id = ? ORDER BY e.position`),
  listEntryIds: db.prepare('SELECT id FROM entries WHERE list_id = ? ORDER BY position'),
  listImageFiles: db.prepare('SELECT DISTINCT image_file FROM entries WHERE list_id = ? AND image_file IS NOT NULL'),
  getEntry: db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`),
  findEntry: db.prepare('SELECT id FROM entries WHERE list_id = ? AND anilist_id = ?'),
  maxPosition: db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM entries WHERE list_id = ?'),
  insertEntry: db.prepare(`
    INSERT INTO entries (list_id, position, anilist_id, name, image_file, image_url, series_title, series_options, added_by)
    VALUES (@listId, @position, @anilistId, @name, @imageFile, @imageUrl, @seriesTitle, @seriesOptions, @addedBy)`),
  updateEntry: db.prepare('UPDATE entries SET note = @note, note_by = @noteBy, series_title = @seriesTitle WHERE id = @id'),
  deleteEntry: db.prepare('DELETE FROM entries WHERE id = ?'),
  closeGap: db.prepare('UPDATE entries SET position = position - 1 WHERE list_id = ? AND position > ?'),
  setPosition: db.prepare('UPDATE entries SET position = ? WHERE id = ? AND list_id = ?'),
};

// ---- Helpers ------------------------------------------------------------------

function cleanListName(value) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'List name is required');
  const name = value.trim();
  if (name.length > 100) throw new HttpError(400, 'List name must be 100 characters or fewer');
  return name;
}

const userRef = (id, username) => (id ? { id, username } : null);

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
    noteBy: row.note ? userRef(row.note_by, row.note_by_name) : null,
    addedBy: userRef(row.added_by, row.added_by_name),
  };
}

function summary(row, me) {
  return {
    id: row.id,
    name: row.name,
    isShared: !!row.is_shared,
    owner: userRef(row.owner_id, row.owner_name),
    isOwner: row.owner_id === me.id,
    count: row.count,
  };
}

// Loads a list and works out what the current user may do with it.
// Lists the user may not see are reported as "not found".
function access(listId, user) {
  const list = q.getList.get(listId);
  if (!list) throw new HttpError(404, 'List not found');
  const isOwner = list.owner_id === user.id;
  const isMember = !isOwner && !!q.isMember.get(listId, user.id);
  const canEdit = isOwner || isMember;
  if (!canEdit && list.is_shared) throw new HttpError(404, 'List not found');
  return { list, isOwner, isMember, canEdit };
}

function requireEdit(a) {
  if (!a.canEdit) throw new HttpError(403, 'This list is read-only for you.');
  return a;
}

function requireOwner(a) {
  if (!a.isOwner) throw new HttpError(403, 'Only the list owner can do that.');
  return a;
}

function detail(a) {
  const { list } = a;
  return {
    id: list.id,
    name: list.name,
    isShared: !!list.is_shared,
    owner: userRef(list.owner_id, list.owner_name),
    members: q.members.all(list.id),
    isOwner: a.isOwner,
    canEdit: a.canEdit,
    version: list.version,
  };
}

const insertAtEnd = db.transaction((values) => {
  const position = q.maxPosition.get(values.listId).max + 1;
  const id = q.insertEntry.run({ ...values, position }).lastInsertRowid;
  q.bump.run(values.listId);
  return id;
});

const removeEntry = db.transaction((entry) => {
  q.deleteEntry.run(entry.id);
  q.closeGap.run(entry.list_id, entry.position);
  q.bump.run(entry.list_id);
});

const applyOrder = db.transaction((listId, entryIds) => {
  entryIds.forEach((id, index) => q.setPosition.run(index + 1, id, listId));
  q.bump.run(listId);
});

const shareWith = db.transaction((listId, userId) => {
  q.makeShared.run(listId);
  q.addMember.run(listId, userId);
  q.bump.run(listId);
});

// ---- Lists --------------------------------------------------------------------

const router = express.Router();

router.get('/lists', (req, res) => {
  res.json(q.visibleLists.all({ me: req.user.id }).map((row) => summary(row, req.user)));
});

router.post('/lists', (req, res) => {
  const name = cleanListName(req.body?.name);
  const shared = req.body?.shared === true ? 1 : 0;
  const id = q.insertList.run(name, req.user.id, shared).lastInsertRowid;
  res.status(201).json(detail(access(id, req.user)));
});

router.get('/lists/:id', (req, res) => {
  const a = access(parseId(req.params.id), req.user);
  res.json({ ...detail(a), entries: q.listEntries.all(a.list.id).map(toEntry) });
});

// Cheap endpoint the browser polls to notice changes made by someone else.
router.get('/lists/:id/version', (req, res) => {
  const a = access(parseId(req.params.id), req.user);
  res.json({ version: a.list.version });
});

router.patch('/lists/:id', (req, res) => {
  const a = requireOwner(access(parseId(req.params.id), req.user));
  q.renameList.run(cleanListName(req.body?.name), a.list.id);
  q.bump.run(a.list.id);
  res.json(detail(access(a.list.id, req.user)));
});

router.delete('/lists/:id', (req, res) => {
  const a = requireOwner(access(parseId(req.params.id), req.user));
  const files = q.listImageFiles.all(a.list.id).map((r) => r.image_file);
  q.deleteList.run(a.list.id);
  files.forEach(removeImageIfUnused);
  res.status(204).end();
});

router.put('/lists/:id/order', (req, res) => {
  const a = requireEdit(access(parseId(req.params.id), req.user));
  const ids = req.body?.entryIds;
  const current = q.listEntryIds.all(a.list.id).map((r) => r.id);
  const valid =
    Array.isArray(ids) &&
    ids.length === current.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => current.includes(id));
  // Someone else added or removed an entry in the meantime.
  if (!valid) throw new HttpError(409, 'The list was changed by someone else.');
  applyOrder(a.list.id, ids);
  res.json({ ok: true });
});

// ---- Members --------------------------------------------------------------------

router.post('/lists/:id/members', (req, res) => {
  const a = requireOwner(access(parseId(req.params.id), req.user));
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const user = username && q.userByName.get(username);
  if (!user) throw new HttpError(404, `There is no user called "${username}".`);
  if (user.id === a.list.owner_id) throw new HttpError(400, 'You already own this list.');
  shareWith(a.list.id, user.id);
  res.status(201).json(detail(access(a.list.id, req.user)));
});

// The owner can remove anyone; a member can remove themselves (leave).
router.delete('/lists/:id/members/:userId', (req, res) => {
  const a = access(parseId(req.params.id), req.user);
  const userId = parseId(req.params.userId);
  if (!a.isOwner && userId !== req.user.id) throw new HttpError(403, 'Only the list owner can remove members.');
  q.removeMember.run(a.list.id, userId);
  q.bump.run(a.list.id);
  res.status(204).end();
});

// ---- Entries --------------------------------------------------------------------

router.post('/lists/:id/entries', wrap(async (req, res) => {
  const a = requireEdit(access(parseId(req.params.id), req.user));
  const anilistId = parseId(req.body?.anilistId);
  if (q.findEntry.get(a.list.id, anilistId)) throw new HttpError(409, 'This character is already in the list.');

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
      listId: a.list.id,
      anilistId,
      name: character.name,
      imageFile,
      imageUrl: character.image,
      seriesTitle: character.series[0] ?? null,
      seriesOptions: JSON.stringify(character.series),
      addedBy: req.user.id,
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'This character is already in the list.');
    throw err;
  }
  res.status(201).json(toEntry(q.getEntry.get(id)));
}));

function entryWithAccess(req) {
  const entry = q.getEntry.get(parseId(req.params.id));
  if (!entry) throw new HttpError(404, 'Entry not found');
  requireEdit(access(entry.list_id, req.user));
  return entry;
}

router.patch('/entries/:id', (req, res) => {
  const entry = entryWithAccess(req);

  let { note, note_by: noteBy } = entry;
  if (req.body?.note !== undefined) {
    if (typeof req.body.note !== 'string') throw new HttpError(400, 'Note must be text');
    const next = req.body.note.trim();
    if (next.length > 1000) throw new HttpError(400, 'Note must be 1000 characters or fewer');
    if (next !== note) {
      note = next;
      noteBy = next ? req.user.id : null;
    }
  }

  let seriesTitle = entry.series_title;
  if (req.body?.seriesTitle !== undefined) {
    const options = JSON.parse(entry.series_options);
    if (!options.includes(req.body.seriesTitle)) throw new HttpError(400, 'Unknown series for this character');
    seriesTitle = req.body.seriesTitle;
  }

  q.updateEntry.run({ id: entry.id, note, noteBy, seriesTitle });
  q.bump.run(entry.list_id);
  res.json(toEntry(q.getEntry.get(entry.id)));
});

router.delete('/entries/:id', (req, res) => {
  const entry = entryWithAccess(req);
  removeEntry(entry);
  removeImageIfUnused(entry.image_file);
  res.status(204).end();
});

module.exports = { listsRouter: router };
