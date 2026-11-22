const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const IMAGE_DIR = path.join(DATA_DIR, 'images');

fs.mkdirSync(IMAGE_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'anime-lister.db'));
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id         INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL,
    anilist_id      INTEGER NOT NULL,
    name            TEXT    NOT NULL,
    image_file      TEXT,
    image_url       TEXT,
    series_title    TEXT,
    series_options  TEXT    NOT NULL DEFAULT '[]',
    note            TEXT    NOT NULL DEFAULT '',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (list_id, anilist_id)
  );

  CREATE INDEX IF NOT EXISTS idx_entries_list_position ON entries (list_id, position);
`);

module.exports = { db, DATA_DIR, IMAGE_DIR };
