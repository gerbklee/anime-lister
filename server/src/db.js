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

  // v6: manga (shares the anime tables; AniList ids are unique across both),
  // episode length & relations, openings cache, games, push notifications.
  6: `
    ALTER TABLE anime ADD COLUMN type TEXT NOT NULL DEFAULT 'ANIME';
    ALTER TABLE anime ADD COLUMN chapters INTEGER;
    ALTER TABLE anime ADD COLUMN volumes INTEGER;
    ALTER TABLE anime ADD COLUMN duration INTEGER;
    ALTER TABLE anime ADD COLUMN relations TEXT NOT NULL DEFAULT '[]';
    -- Rows fetched before v6 lack duration/relations; refreshed on next use.
    ALTER TABLE anime ADD COLUMN meta_version INTEGER NOT NULL DEFAULT 1;

    ALTER TABLE user_anime ADD COLUMN progress_volumes INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE users ADD COLUMN notify_prefs TEXT NOT NULL DEFAULT '{}';

    CREATE TABLE anime_themes (
      anime_id    INTEGER PRIMARY KEY,
      data        TEXT    NOT NULL,
      fetched_at  INTEGER NOT NULL
    );

    -- A challenge: fixed questions; every player plays it once.
    CREATE TABLE games (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL,
      created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      questions   TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE game_players (
      game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answers      TEXT,
      score        INTEGER,
      correct      INTEGER,
      finished_at  INTEGER,
      PRIMARY KEY (game_id, user_id)
    );
    CREATE INDEX idx_game_players_user ON game_players (user_id);

    CREATE TABLE push_subscriptions (
      endpoint    TEXT    PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      keys        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );

    -- Episodes we already sent an "airing now" notification for.
    CREATE TABLE airing_notified (
      anime_id  INTEGER NOT NULL,
      episode   INTEGER NOT NULL,
      PRIMARY KEY (anime_id, episode)
    );
  `,

  // v7: ships (2-4 characters), votes, headcanons, popular pairings cache.
  7: `
    CREATE TABLE ships (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      signature     TEXT    NOT NULL UNIQUE,   -- sorted character ids, e.g. "40882-45627"
      name          TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'fanon',  -- canon | fanon | crack
      cover_url     TEXT,
      cover_file    TEXT,
      fanart_count  INTEGER,
      fanart_tags   TEXT,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE ship_members (
      ship_id       INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
      character_id  INTEGER NOT NULL,
      name          TEXT    NOT NULL,
      image         TEXT,
      series        TEXT,
      position      INTEGER NOT NULL,
      PRIMARY KEY (ship_id, character_id)
    );
    CREATE INDEX idx_ship_members_character ON ship_members (character_id);

    -- 0 = No way, 1 = Meh, 2 = Cute, 3 = Ship it, 4 = OTP
    CREATE TABLE ship_votes (
      ship_id     INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vote        INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (ship_id, user_id)
    );

    CREATE TABLE headcanons (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ship_id     INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_headcanons_ship ON headcanons (ship_id);

    CREATE TABLE pairing_cache (
      character_id  INTEGER PRIMARY KEY,
      data          TEXT    NOT NULL,
      fetched_at    INTEGER NOT NULL
    );
  `,
  // v8: fan art gallery (saved and hidden pictures), Danbooru tag cache.
  8: `
    CREATE TABLE fanart_saved (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      subject       TEXT    NOT NULL,           -- 'character:<id>' or 'ship:<id>'
      subject_name  TEXT    NOT NULL,
      source        TEXT    NOT NULL,           -- 'danbooru' | 'safebooru'
      post_id       TEXT    NOT NULL,
      image_url     TEXT    NOT NULL,
      thumb_url     TEXT,
      image_file    TEXT,
      thumb_file    TEXT,
      source_url    TEXT,
      post_url      TEXT,
      artist        TEXT,
      width         INTEGER,
      height        INTEGER,
      score         INTEGER,
      saved_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL,
      UNIQUE (subject, source, post_id)
    );
    CREATE INDEX idx_fanart_saved_subject ON fanart_saved (subject, created_at);
    CREATE INDEX idx_fanart_saved_created ON fanart_saved (created_at);

    CREATE TABLE fanart_hidden (
      source        TEXT    NOT NULL,
      post_id       TEXT    NOT NULL,
      thumb_url     TEXT,
      subject_name  TEXT,
      hidden_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL,
      PRIMARY KEY (source, post_id)
    );

    CREATE TABLE fanart_tags (
      character_id  INTEGER NOT NULL,
      source        TEXT    NOT NULL,
      tag           TEXT,
      post_count    INTEGER,
      fetched_at    INTEGER NOT NULL,
      PRIMARY KEY (character_id, source)
    );
  `,
  // v9: the part of a list picture used as the portrait ({x, y, w, h}, 0–1).
  9: `
    ALTER TABLE entries ADD COLUMN image_crop TEXT;
  `,
  // v10: ship tropes, moments, vote history, anthem.
  10: `
    CREATE TABLE ship_tropes (
      ship_id     INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
      trope       TEXT    NOT NULL,
      added_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (ship_id, trope)
    );
    CREATE INDEX idx_ship_tropes_trope ON ship_tropes (trope);

    CREATE TABLE ship_moments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ship_id     INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
      anime_id    INTEGER,
      anime_title TEXT,
      episode     INTEGER,
      body        TEXT    NOT NULL,
      spoiler     INTEGER NOT NULL DEFAULT 0,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_ship_moments_ship ON ship_moments (ship_id);

    CREATE TABLE ship_vote_history (
      ship_id     INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vote        INTEGER,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_ship_vote_history ON ship_vote_history (ship_id, user_id, created_at);
    -- Start the history with the current votes.
    INSERT INTO ship_vote_history (ship_id, user_id, vote, created_at) SELECT ship_id, user_id, vote, updated_at FROM ship_votes;

    ALTER TABLE ships ADD COLUMN anthem TEXT;
  `,
  // v11: Art area: boards (personal, can be shared), followed artists, art of the day.
  11: `
    CREATE TABLE art_boards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      emoji       TEXT,
      owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE art_board_members (
      board_id    INTEGER NOT NULL REFERENCES art_boards(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (board_id, user_id)
    );
    CREATE TABLE art_board_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id    INTEGER NOT NULL REFERENCES art_boards(id) ON DELETE CASCADE,
      source      TEXT    NOT NULL,
      post_id     TEXT    NOT NULL,
      image_url   TEXT    NOT NULL,
      thumb_url   TEXT,
      image_file  TEXT,
      thumb_file  TEXT,
      source_url  TEXT,
      post_url    TEXT,
      artist      TEXT,
      width       INTEGER,
      height      INTEGER,
      added_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL,
      UNIQUE (board_id, source, post_id)
    );
    CREATE INDEX idx_art_board_items_board ON art_board_items (board_id, created_at);

    CREATE TABLE art_follows (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artist      TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      last_seen   INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (user_id, artist)
    );

    CREATE TABLE art_daily (
      day         TEXT    PRIMARY KEY,
      data        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `,
  // v12: per-person "spicy art" switch, known character ages (adults-only rule),
  // and which saved/board pictures are spicy.
  12: `
    ALTER TABLE users ADD COLUMN spicy_art INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE character_age (
      character_id  INTEGER PRIMARY KEY,
      age           REAL,
      fetched_at    INTEGER NOT NULL
    );
    ALTER TABLE fanart_saved ADD COLUMN spicy INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE art_board_items ADD COLUMN spicy INTEGER NOT NULL DEFAULT 0;
  `,
  // v13: where a character's age came from (AniList field, description, MyAnimeList).
  13: `
    ALTER TABLE character_age ADD COLUMN basis TEXT;
  `,
  // v14: who verified a character as an adult by hand (basis 'manual'), for
  // characters no source gives an age for.
  14: `
    ALTER TABLE character_age ADD COLUMN verified_by INTEGER REFERENCES users(id);
  `,
  // v15: Studio (reference search for artists): per-person switch, saved
  // searches, and server-wide settings (e.g. the Pixiv connection).
  15: `
    ALTER TABLE users ADD COLUMN studio INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE studio_searches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      query       TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_studio_searches_user ON studio_searches (user_id);
    CREATE TABLE app_settings (
      key    TEXT PRIMARY KEY,
      value  TEXT
    );
  `,
  // v16: the series a Danbooru character tag belongs to (for search suggestions).
  16: `
    CREATE TABLE tag_series (
      tag         TEXT    PRIMARY KEY,
      series      TEXT,
      fetched_at  INTEGER NOT NULL
    );
  `,
  // v17: the Studio on/off switch is gone (the search is in the Art tab for everyone).
  17: `
    ALTER TABLE users DROP COLUMN studio;
  `,
  // v19: Atelier, the drawing school: your plan, lesson progress, spaced reviews
  // of skills, your drawings (with self-ratings and critiques), and focus blocks
  // (the pomodoro timer; each finished block is a tree in your valley).
  19: `
    CREATE TABLE atelier_profile (
      user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      daily_minutes    INTEGER NOT NULL DEFAULT 90,
      week_days        INTEGER NOT NULL DEFAULT 5,
      day_minutes      INTEGER NOT NULL DEFAULT 60,
      plan_when        TEXT,
      plan_where       TEXT,
      reminder_at      TEXT,
      tz               TEXT,
      adult_track      INTEGER NOT NULL DEFAULT 0,
      critique_cap     INTEGER NOT NULL DEFAULT 1000,
      focus_minutes    INTEGER NOT NULL DEFAULT 45,
      break_minutes    INTEGER NOT NULL DEFAULT 10,
      started_at       INTEGER NOT NULL,
      last_reminded    TEXT
    );
    CREATE TABLE atelier_lessons (
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id    TEXT    NOT NULL,
      read_at      INTEGER,
      done_at      INTEGER,
      PRIMARY KEY (user_id, lesson_id)
    );
    CREATE TABLE atelier_reviews (
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skill        TEXT    NOT NULL,
      interval     REAL    NOT NULL DEFAULT 1,
      due_at       INTEGER NOT NULL,
      last_at      INTEGER,
      reps         INTEGER NOT NULL DEFAULT 0,
      last_rating  INTEGER,
      PRIMARY KEY (user_id, skill)
    );
    CREATE TABLE atelier_drawings (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id      TEXT,
      exercise_id    TEXT,
      kind           TEXT    NOT NULL,
      skill          TEXT,
      area           TEXT,
      title          TEXT,
      file           TEXT,
      reference_file TEXT,
      reference_url  TEXT,
      reference_post TEXT,
      check_round    INTEGER,
      self_scores    TEXT,
      critique       TEXT,
      critique_cost  REAL,
      shared         INTEGER NOT NULL DEFAULT 0,
      adult          INTEGER NOT NULL DEFAULT 0,
      status         TEXT    NOT NULL DEFAULT 'done',
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX idx_atelier_drawings_user ON atelier_drawings (user_id, created_at);
    CREATE TABLE atelier_blocks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at   INTEGER NOT NULL,
      ended_at     INTEGER,
      planned      INTEGER NOT NULL,
      minutes      REAL    NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'running',
      kind         TEXT,
      lesson_id    TEXT,
      area         TEXT,
      tree         TEXT,
      stage        INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_atelier_blocks_user ON atelier_blocks (user_id, started_at);
  `,
  // v18: small cached values (search results, artist pages) that survive restarts.
  18: `
    CREATE TABLE kv_cache (
      key      TEXT    PRIMARY KEY,
      value    TEXT    NOT NULL,
      expires  INTEGER NOT NULL
    );
    CREATE INDEX idx_kv_cache_expires ON kv_cache (expires);
  `,
  // v20: Atelier: Clip Studio files (original + layers), critique levels,
  // gesture pose counts, finished pieces and quarterly portfolio reviews.
  20: `
    ALTER TABLE atelier_drawings ADD COLUMN clip_file TEXT;
    ALTER TABLE atelier_drawings ADD COLUMN clip_info TEXT;
    ALTER TABLE atelier_blocks ADD COLUMN poses INTEGER;
    CREATE TABLE atelier_portfolio_reviews (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      drawings    TEXT    NOT NULL,
      self        TEXT,
      critique    TEXT,
      cost        REAL    NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_atelier_portfolio_user ON atelier_portfolio_reviews (user_id, created_at);
  `,
  // v21: Atelier: personal projects (free drawing), with versions and time.
  21: `
    CREATE TABLE atelier_projects (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      archived    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_atelier_projects_user ON atelier_projects (user_id);
    ALTER TABLE atelier_drawings ADD COLUMN project_id INTEGER;
    ALTER TABLE atelier_blocks ADD COLUMN project_id INTEGER;
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
