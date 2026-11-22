const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const IMAGE_DIR = path.join(DATA_DIR, 'images');
const DB_FILE = path.join(DATA_DIR, 'anime-lister.db');

fs.mkdirSync(IMAGE_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');

// ---- Schema v1 (single user) ----------------------------------------------
// Kept as the base so existing databases and fresh installs follow the same
// migration path.
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

// ---- Migrations -------------------------------------------------------------

const MIGRATIONS = {
  // v2: user accounts, sessions, list owners and shared lists.
  // Existing lists become shared lists; the first account to sign up owns them.
  2: `
    CREATE TABLE users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash  TEXT    NOT NULL,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE sessions (
      token_hash  TEXT    PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_sessions_user ON sessions (user_id);

    CREATE TABLE list_members (
      list_id   INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (list_id, user_id)
    );
    CREATE INDEX idx_list_members_user ON list_members (user_id);

    ALTER TABLE lists ADD COLUMN owner_id INTEGER REFERENCES users(id);
    ALTER TABLE lists ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE lists ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX idx_lists_owner ON lists (owner_id);

    ALTER TABLE entries ADD COLUMN added_by INTEGER REFERENCES users(id);
    ALTER TABLE entries ADD COLUMN note_by INTEGER REFERENCES users(id);

    UPDATE lists SET is_shared = 1;
  `,
};

const LATEST = Math.max(...Object.keys(MIGRATIONS).map(Number));

function migrate() {
  const current = db.pragma('user_version', { simple: true });
  if (current >= LATEST) return;

  // Safety copy before changing an existing database.
  const hasData = db.prepare('SELECT COUNT(*) AS n FROM lists').get().n > 0;
  if (hasData) {
    const backup = path.join(DATA_DIR, `anime-lister.backup-v${current || 1}.db`);
    if (!fs.existsSync(backup)) {
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
      console.log(`Database backed up to ${backup}`);
    }
  }

  for (let v = current + 1; v <= LATEST; v++) {
    if (!MIGRATIONS[v]) continue;
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v}`);
    })();
    console.log(`Database migrated to schema v${v}`);
  }
}

migrate();

module.exports = { db, DATA_DIR, IMAGE_DIR };
