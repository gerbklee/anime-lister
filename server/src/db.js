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

  // v3: anime catalogue, anime lists & watchlists, activity feed, comments,
  // reactions, profile photos and custom character images.
  3: `
    ALTER TABLE users ADD COLUMN avatar_file TEXT;

    -- 'character' | 'anime' | 'watchlist'
    ALTER TABLE lists ADD COLUMN kind TEXT NOT NULL DEFAULT 'character';

    -- Lets a character entry switch back to the AniList image after picking another one.
    ALTER TABLE entries ADD COLUMN original_image_url TEXT;
    UPDATE entries SET original_image_url = image_url;

    -- Cached AniList anime metadata (shared by everyone).
    CREATE TABLE anime (
      id             INTEGER PRIMARY KEY,
      id_mal         INTEGER,
      title          TEXT    NOT NULL,
      title_romaji   TEXT,
      cover_url      TEXT,
      cover_file     TEXT,
      banner_url     TEXT,
      color          TEXT,
      format         TEXT,
      episodes       INTEGER,
      season         TEXT,
      season_year    INTEGER,
      status         TEXT,
      genres         TEXT    NOT NULL DEFAULT '[]',
      studios        TEXT,
      description    TEXT,
      trailer_site   TEXT,
      trailer_id     TEXT,
      average_score  INTEGER,
      characters     TEXT    NOT NULL DEFAULT '[]',
      fetched_at     INTEGER NOT NULL
    );

    -- Which characters appear in which anime (from AniList), for linking.
    CREATE TABLE character_media (
      character_id  INTEGER NOT NULL,
      anime_id      INTEGER NOT NULL,
      PRIMARY KEY (character_id, anime_id)
    );
    CREATE INDEX idx_character_media_anime ON character_media (anime_id);

    -- Characters whose anime links have been fetched (background backfill).
    CREATE TABLE character_sync (
      character_id  INTEGER PRIMARY KEY,
      synced_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- A user's anime catalogue: status, progress, rating and review.
    CREATE TABLE user_anime (
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_id           INTEGER NOT NULL REFERENCES anime(id),
      status             TEXT    NOT NULL,
      progress           INTEGER NOT NULL DEFAULT 0,
      rating             REAL,
      review             TEXT    NOT NULL DEFAULT '',
      review_spoiler     INTEGER NOT NULL DEFAULT 0,
      review_updated_at  TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, anime_id)
    );
    CREATE INDEX idx_user_anime_anime ON user_anime (anime_id);

    -- Feed events.
    CREATE TABLE activities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT    NOT NULL,
      anime_id    INTEGER,
      list_id     INTEGER,
      item_id     INTEGER,
      data        TEXT    NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_activities_created ON activities (created_at);
    CREATE INDEX idx_activities_user ON activities (user_id, type, anime_id);

    -- Comments belong to a thread, e.g. 'review:<animeId>:<userId>',
    -- 'activity:<id>' or 'watch:<listId>:<animeId>'.
    CREATE TABLE comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      thread      TEXT    NOT NULL,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_comments_thread ON comments (thread, created_at);

    -- Emoji reactions on a target: a thread key or 'comment:<id>'.
    CREATE TABLE reactions (
      target   TEXT    NOT NULL,
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji    TEXT    NOT NULL,
      PRIMARY KEY (target, user_id, emoji)
    );
  `,

  // v4: cached AniList community recommendations per anime (for Discover).
  4: `
    CREATE TABLE anime_recs (
      anime_id    INTEGER PRIMARY KEY,
      data        TEXT    NOT NULL,
      fetched_at  INTEGER NOT NULL
    );
  `,

  // v5: list categories (Daddy/Mommy/Waifu/Husbando), personal rankings in
  // shared lists, and cached character traits for "My type".
  5: `
    ALTER TABLE lists ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
    ALTER TABLE lists ADD COLUMN emoji TEXT;

    UPDATE lists SET category = 'daddy'
      WHERE kind = 'character' AND (lower(name) LIKE '%daddy%' OR lower(name) LIKE '%dadd%' OR lower(name) LIKE '%papa%');
    UPDATE lists SET category = 'mommy'
      WHERE kind = 'character' AND category = 'other'
        AND (lower(name) LIKE '%mommy%' OR lower(name) LIKE '%momm%' OR lower(name) LIKE '%mama%' OR lower(name) LIKE '%mami%');
    UPDATE lists SET category = 'husbando'
      WHERE kind = 'character' AND category = 'other' AND lower(name) LIKE '%husband%';
    UPDATE lists SET category = 'waifu'
      WHERE kind = 'character' AND category = 'other' AND (lower(name) LIKE '%waifu%' OR lower(name) LIKE '%wife%');

    -- Each member's own order in shared character/anime lists.
    CREATE TABLE rankings (
      entry_id  INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      position  INTEGER NOT NULL,
      PRIMARY KEY (entry_id, user_id)
    );
    CREATE INDEX idx_rankings_user ON rankings (user_id);

    -- The current joint order becomes everyone's starting ranking.
    INSERT OR IGNORE INTO rankings (entry_id, user_id, position)
      SELECT e.id, l.owner_id, e.position FROM entries e JOIN lists l ON l.id = e.list_id
      WHERE l.is_shared = 1 AND l.kind IN ('character', 'anime') AND l.owner_id IS NOT NULL;
    INSERT OR IGNORE INTO rankings (entry_id, user_id, position)
      SELECT e.id, m.user_id, e.position FROM entries e
      JOIN lists l ON l.id = e.list_id JOIN list_members m ON m.list_id = l.id
      WHERE l.is_shared = 1 AND l.kind IN ('character', 'anime');

    CREATE TABLE character_traits (
      character_id  INTEGER PRIMARY KEY,
      data          TEXT    NOT NULL,
      fetched_at    INTEGER NOT NULL
    );
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
