// Lists, entries and list members.
//
// List kinds: 'character' (ranked characters), 'anime' (ranked anime) and
// 'watchlist' (shared "to watch" list; always shared).
//
// Permissions:
//   personal list (is_shared = 0): owner edits; every logged-in user can view
//   shared list   (is_shared = 1): owner + members edit; nobody else sees it
//   rename / delete / manage members: owner only (members may leave)
const express = require('express');
const { db } = require('./db');
const { HttpError, wrap, parseId } = require('./http');
const { getCharacter } = require('./anilist');
const { cacheImage, isAllowedImageUrl, removeImageIfUnused } = require('./images');
const { ensureAnime, saveCharacterLinks, toAnimeSummary } = require('./anime');
const { usersById } = require('./users');
const activity = require('./activity');

const KINDS = ['character', 'anime', 'watchlist'];

const q = {
  visibleLists: db.prepare(`
    SELECT l.id, l.name, l.kind, l.is_shared, l.owner_id,
           (SELECT COUNT(*) FROM entries e WHERE e.list_id = l.id) AS count
    FROM lists l
    WHERE l.is_shared = 0
       OR l.owner_id = @me
       OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me)
    ORDER BY l.id`),
  getList: db.prepare('SELECT * FROM lists WHERE id = ?'),
  isMember: db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?'),
  memberIds: db.prepare('SELECT user_id FROM list_members WHERE list_id = ? ORDER BY added_at, user_id'),
  insertList: db.prepare('INSERT INTO lists (name, owner_id, is_shared, kind) VALUES (?, ?, ?, ?)'),
  renameList: db.prepare('UPDATE lists SET name = ? WHERE id = ?'),
  deleteList: db.prepare('DELETE FROM lists WHERE id = ?'),
  bump: db.prepare('UPDATE lists SET version = version + 1 WHERE id = ?'),
  makeShared: db.prepare('UPDATE lists SET is_shared = 1 WHERE id = ?'),
  addMember: db.prepare('INSERT OR IGNORE INTO list_members (list_id, user_id) VALUES (?, ?)'),
  removeMember: db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?'),
  userByName: db.prepare('SELECT id, username FROM users WHERE username = ?'),
  listEntries: db.prepare('SELECT * FROM entries WHERE list_id = ? ORDER BY position'),
  listEntryIds: db.prepare('SELECT id FROM entries WHERE list_id = ? ORDER BY position'),
  listImageFiles: db.prepare('SELECT DISTINCT image_file FROM entries WHERE list_id = ? AND image_file IS NOT NULL'),
  getEntry: db.prepare('SELECT * FROM entries WHERE id = ?'),
  findEntry: db.prepare('SELECT id FROM entries WHERE list_id = ? AND anilist_id = ?'),
  maxPosition: db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM entries WHERE list_id = ?'),
  insertEntry: db.prepare(`
    INSERT INTO entries (list_id, position, anilist_id, name, image_file, image_url, original_image_url,
                         series_title, series_options, added_by)
    VALUES (@listId, @position, @anilistId, @name, @imageFile, @imageUrl, @imageUrl,
            @seriesTitle, @seriesOptions, @addedBy)`),
  updateEntry: db.prepare('UPDATE entries SET note = @note, note_by = @noteBy, series_title = @seriesTitle WHERE id = @id'),
  setEntryImage: db.prepare('UPDATE entries SET image_file = ?, image_url = ? WHERE id = ?'),
  deleteEntry: db.prepare('DELETE FROM entries WHERE id = ?'),
  closeGap: db.prepare('UPDATE entries SET position = position - 1 WHERE list_id = ? AND position > ?'),
  setPosition: db.prepare('UPDATE entries SET position = ? WHERE id = ? AND list_id = ?'),
  anime: db.prepare('SELECT * FROM anime WHERE id = ?'),
  markWatched: db.prepare(`
    INSERT INTO user_anime (user_id, anime_id, status, progress) VALUES (?, ?, 'watched', ?)
    ON CONFLICT (user_id, anime_id) DO UPDATE SET
      status = 'watched', progress = MAX(user_anime.progress, excluded.progress), updated_at = datetime('now')`),
};

// ---- Helpers ------------------------------------------------------------------

function cleanListName(value) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'List name is required');
  const name = value.trim();
  if (name.length > 100) throw new HttpError(400, 'List name must be 100 characters or fewer');
  return name;
}

// Series options were plain titles before anime support; now {id, type, title}.
function parseSeries(raw) {
  return JSON.parse(raw).map((s) => (typeof s === 'string' ? { title: s } : s));
}

const FORMATS = { TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };

function animeMeta(a) {
  return [FORMATS[a.format] ?? a.format, a.season_year, a.episodes ? `${a.episodes} ep` : null].filter(Boolean).join(' · ');
}

function toEntry(row, kind, users) {
  const ref = (id) => (id ? users.get(id) ?? { id, username: 'unknown', avatar: null } : null);
  const entry = {
    id: row.id,
    listId: row.list_id,
    position: row.position,
    anilistId: row.anilist_id,
    name: row.name,
    image: row.image_file ? `/images/${row.image_file}` : row.image_url,
    seriesTitle: row.series_title,
    seriesOptions: [],
    note: row.note,
    noteBy: row.note ? ref(row.note_by) : null,
    addedBy: ref(row.added_by),
  };
  if (kind === 'character') {
    const options = parseSeries(row.series_options);
    entry.seriesOptions = options.map((o) => o.title);
    entry.seriesAnimeId = options.find((o) => o.title === row.series_title && o.type === 'ANIME')?.id ?? null;
    entry.customImage = !!row.original_image_url && row.image_url !== row.original_image_url;
  } else {
    entry.anime = toAnimeSummary(q.anime.get(row.anilist_id));
    if (kind === 'watchlist') entry.commentCount = activity.commentCount(`watch:${row.list_id}:${row.anilist_id}`);
  }
  return entry;
}

function summary(row, me, users) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isShared: !!row.is_shared,
    owner: users.get(row.owner_id) ?? null,
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

function detail(a, users) {
  const { list } = a;
  return {
    id: list.id,
    name: list.name,
    kind: list.kind,
    isShared: !!list.is_shared,
    owner: users.get(list.owner_id) ?? null,
    members: q.memberIds.all(list.id).map((r) => users.get(r.user_id)).filter(Boolean),
    isOwner: a.isOwner,
    canEdit: a.canEdit,
    version: list.version,
  };
}

const insertAtEnd = db.transaction((values) => {
  const position = q.maxPosition.get(values.listId).max + 1;
  const id = Number(q.insertEntry.run({ ...values, position }).lastInsertRowid);
  q.bump.run(values.listId);
  return { id, position };
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
  const users = usersById();
  res.json(q.visibleLists.all({ me: req.user.id }).map((row) => summary(row, req.user, users)));
});

router.post('/lists', (req, res) => {
  const name = cleanListName(req.body?.name);
  const kind = req.body?.kind ?? 'character';
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Unknown list type');
  const shared = kind === 'watchlist' || req.body?.shared === true ? 1 : 0;
  const id = Number(q.insertList.run(name, req.user.id, shared, kind).lastInsertRowid);
  activity.record({ userId: req.user.id, type: 'list_create', listId: id, data: { kind } });
  res.status(201).json(detail(access(id, req.user), usersById()));
});

router.get('/lists/:id', (req, res) => {
  const a = access(parseId(req.params.id), req.user);
  const users = usersById();
  res.json({ ...detail(a, users), entries: q.listEntries.all(a.list.id).map((r) => toEntry(r, a.list.kind, users)) });
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
  res.json(detail(access(a.list.id, req.user), usersById()));
});

router.delete('/lists/:id', (req, res) => {
  const a = requireOwner(access(parseId(req.params.id), req.user));
  const files = q.listImageFiles.all(a.list.id).map((r) => r.image_file);
  db.transaction(() => {
    q.deleteList.run(a.list.id);
    activity.removeListActivities(a.list.id);
  })();
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
  res.status(201).json(detail(access(a.list.id, req.user), usersById()));
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

async function characterValues(anilistId) {
  const character = await getCharacter(anilistId);
  saveCharacterLinks(character);
  let imageFile = null;
  try {
    imageFile = await cacheImage(character.image, String(anilistId));
  } catch (err) {
    console.warn(`Could not cache image for character ${anilistId}: ${err.message}`);
  }
  return {
    name: character.name,
    imageFile,
    imageUrl: character.image,
    seriesTitle: character.media[0]?.title ?? null,
    seriesOptions: JSON.stringify(character.media),
  };
}

async function animeValues(animeId) {
  const a = await ensureAnime(animeId, { cover: true });
  return {
    name: a.title,
    imageFile: a.cover_file,
    imageUrl: a.cover_url,
    seriesTitle: animeMeta(a),
    seriesOptions: '[]',
  };
}

router.post('/lists/:id/entries', wrap(async (req, res) => {
  const a = requireEdit(access(parseId(req.params.id), req.user));
  const itemId = parseId(req.body?.anilistId);
  const kind = a.list.kind;
  const already = kind === 'character' ? 'This character is already in the list.' : 'This anime is already in the list.';
  if (q.findEntry.get(a.list.id, itemId)) throw new HttpError(409, already);

  const values = kind === 'character' ? await characterValues(itemId) : await animeValues(itemId);

  let inserted;
  try {
    inserted = insertAtEnd({ ...values, listId: a.list.id, anilistId: itemId, addedBy: req.user.id });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, already);
    throw err;
  }
  activity.record({
    userId: req.user.id,
    type: kind === 'watchlist' ? 'watchlist_add' : 'list_add',
    listId: a.list.id,
    itemId,
    animeId: kind === 'character' ? null : itemId,
    data: { kind, name: values.name, image: values.imageFile ? `/images/${values.imageFile}` : values.imageUrl, rank: inserted.position },
  });
  res.status(201).json(toEntry(q.getEntry.get(inserted.id), kind, usersById()));
}));

function entryWithAccess(req) {
  const entry = q.getEntry.get(parseId(req.params.id));
  if (!entry) throw new HttpError(404, 'Entry not found');
  const a = requireEdit(access(entry.list_id, req.user));
  return { entry, a };
}

router.patch('/entries/:id', wrap(async (req, res) => {
  const { entry, a } = entryWithAccess(req);
  const body = req.body ?? {};

  // Change or reset the picture (character lists only).
  if (body.imageUrl !== undefined || body.resetImage) {
    if (a.list.kind !== 'character') throw new HttpError(400, 'Only character pictures can be changed.');
    const url = body.resetImage ? entry.original_image_url : body.imageUrl;
    if (!url || !isAllowedImageUrl(url)) throw new HttpError(400, 'Please pick one of the suggested images.');
    let file;
    try {
      file = await cacheImage(url, url === entry.original_image_url ? String(entry.anilist_id) : undefined);
    } catch (err) {
      throw new HttpError(502, `Could not download that image: ${err.message}`);
    }
    q.setEntryImage.run(file, url, entry.id);
    q.bump.run(entry.list_id);
    if (entry.image_file && entry.image_file !== file) removeImageIfUnused(entry.image_file);
  }

  let { note, note_by: noteBy } = entry;
  if (body.note !== undefined) {
    if (typeof body.note !== 'string') throw new HttpError(400, 'Note must be text');
    const next = body.note.trim();
    if (next.length > 1000) throw new HttpError(400, 'Note must be 1000 characters or fewer');
    if (next !== note) {
      note = next;
      noteBy = next ? req.user.id : null;
    }
  }

  let seriesTitle = entry.series_title;
  if (body.seriesTitle !== undefined) {
    const options = parseSeries(entry.series_options).map((o) => o.title);
    if (!options.includes(body.seriesTitle)) throw new HttpError(400, 'Unknown series for this character');
    seriesTitle = body.seriesTitle;
  }

  q.updateEntry.run({ id: entry.id, note, noteBy, seriesTitle });
  q.bump.run(entry.list_id);
  res.json(toEntry(q.getEntry.get(entry.id), a.list.kind, usersById()));
}));

router.delete('/entries/:id', (req, res) => {
  const { entry } = entryWithAccess(req);
  db.transaction(() => {
    removeEntry(entry);
    activity.removeListAdd(entry.list_id, entry.anilist_id);
  })();
  removeImageIfUnused(entry.image_file);
  res.status(204).end();
});

// Watchlist: "We watched it". Adds the anime to the chosen members' catalogues
// and removes it from the watchlist. Its comments stay on the anime page.
router.post('/entries/:id/watched', wrap(async (req, res) => {
  const { entry, a } = entryWithAccess(req);
  if (a.list.kind !== 'watchlist') throw new HttpError(400, 'Only watchlist entries can be marked as watched.');
  const allowed = new Set([a.list.owner_id, ...q.memberIds.all(a.list.id).map((r) => r.user_id)]);
  const userIds = Array.isArray(req.body?.userIds) ? [...new Set(req.body.userIds.map(Number))] : [];
  if (!userIds.length || !userIds.every((id) => allowed.has(id))) {
    throw new HttpError(400, 'Pick who watched it (members of this watchlist only).');
  }
  const anime = await ensureAnime(entry.anilist_id, { cover: true });
  db.transaction(() => {
    for (const uid of userIds) q.markWatched.run(uid, entry.anilist_id, anime.episodes ?? 0);
    removeEntry(entry);
    activity.record({
      userId: req.user.id,
      type: 'watchlist_watched',
      animeId: entry.anilist_id,
      listId: a.list.id,
      data: { userIds },
    });
  })();
  res.json({ ok: true });
}));

module.exports = { listsRouter: router };
