const { db } = require('./db');

const q = {
  all: db.prepare('SELECT id, username, avatar_file FROM users ORDER BY username COLLATE NOCASE'),
  one: db.prepare('SELECT id, username, avatar_file FROM users WHERE id = ?'),
};

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, avatar: row.avatar_file ? `/images/${row.avatar_file}` : null };
}

const allUsers = () => q.all.all().map(publicUser);
const getUser = (id) => publicUser(q.one.get(id));

function usersById() {
  return new Map(allUsers().map((u) => [u.id, u]));
}

module.exports = { publicUser, allUsers, getUser, usersById };
