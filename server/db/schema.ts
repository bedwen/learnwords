import Database from 'better-sqlite3';
import crypto from 'crypto';

/**
 * Initialize the database schema.
 * Creates tables, indexes, and constraints as specified in docs/database.md.
 * Safe to call multiple times (uses IF NOT EXISTS and dynamic pragma checks).
 */
export function initializeSchema(db: Database.Database): void {
  db.exec(`
    -- Words table: stores vocabulary content
    CREATE TABLE IF NOT EXISTS words (
      id                  TEXT PRIMARY KEY,
      sync_id             TEXT,
      word                TEXT NOT NULL,
      meaning             TEXT NOT NULL,
      level               TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
      part_of_speech      TEXT,
      example_sentence    TEXT,
      example_translation TEXT,
      notes               TEXT,
      created_at          DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at          DATETIME NOT NULL DEFAULT (datetime('now')),
      deleted_at          DATETIME
    );

    -- Learning states table: current learning state per word (1:1)
    CREATE TABLE IF NOT EXISTS learning_states (
      id                  TEXT PRIMARY KEY,
      word_id             TEXT NOT NULL UNIQUE,
      mastery             INTEGER NOT NULL DEFAULT 0,
      interval_step       INTEGER NOT NULL DEFAULT 0,
      next_review         DATETIME NOT NULL DEFAULT (datetime('now')),
      last_reviewed       DATETIME,
      review_count        INTEGER NOT NULL DEFAULT 0,
      correct_count       INTEGER NOT NULL DEFAULT 0,
      wrong_count         INTEGER NOT NULL DEFAULT 0,
      consecutive_correct INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    -- Review history table: every completed study review (1:N)
    CREATE TABLE IF NOT EXISTS review_history (
      id                    TEXT PRIMARY KEY,
      sync_id               TEXT,
      word_id               TEXT NOT NULL,
      rating                TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
      mastery_before        INTEGER NOT NULL,
      mastery_after         INTEGER NOT NULL,
      interval_step_before  INTEGER NOT NULL,
      interval_step_after   INTEGER NOT NULL,
      reviewed_at           DATETIME NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    -- Folders table: stores named, colored word groups
    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      sync_id    TEXT,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#94a3b8',
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
      deleted_at DATETIME
    );

    -- Word-folder junction table: many-to-many relationship
    CREATE TABLE IF NOT EXISTS word_folders (
      word_id   TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      PRIMARY KEY (word_id, folder_id),
      FOREIGN KEY (word_id)   REFERENCES words(id)   ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES folders(id)  ON DELETE CASCADE
    );

    -- Indexes as specified in docs/database.md
    CREATE INDEX IF NOT EXISTS idx_words_word              ON words(word);
    CREATE INDEX IF NOT EXISTS idx_words_level             ON words(level);
    CREATE INDEX IF NOT EXISTS idx_words_sync_id           ON words(sync_id);
    CREATE INDEX IF NOT EXISTS idx_words_deleted_at        ON words(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_learning_states_word_id      ON learning_states(word_id);
    CREATE INDEX IF NOT EXISTS idx_learning_states_next_review  ON learning_states(next_review);
    CREATE INDEX IF NOT EXISTS idx_learning_states_mastery      ON learning_states(mastery);
    CREATE INDEX IF NOT EXISTS idx_review_history_word_id       ON review_history(word_id);
    CREATE INDEX IF NOT EXISTS idx_review_history_reviewed_at   ON review_history(reviewed_at);
    CREATE INDEX IF NOT EXISTS idx_review_history_sync_id       ON review_history(sync_id);

    -- Folder indexes
    CREATE INDEX IF NOT EXISTS idx_folders_sync_id        ON folders(sync_id);
    CREATE INDEX IF NOT EXISTS idx_folders_deleted_at     ON folders(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_word_folders_word_id   ON word_folders(word_id);
    CREATE INDEX IF NOT EXISTS idx_word_folders_folder_id ON word_folders(folder_id);
  `);

  migrateColumns(db);
}

function migrateColumns(db: Database.Database): void {
  // 1. words table
  const wordCols = (db.prepare('PRAGMA table_info(words)').all() as { name: string }[]).map((c) => c.name);
  if (!wordCols.includes('sync_id')) {
    db.exec('ALTER TABLE words ADD COLUMN sync_id TEXT;');
  }
  if (!wordCols.includes('deleted_at')) {
    db.exec('ALTER TABLE words ADD COLUMN deleted_at DATETIME;');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_words_sync_id ON words(sync_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_words_deleted_at ON words(deleted_at);');

  const wordsWithoutSync = db.prepare('SELECT id FROM words WHERE sync_id IS NULL').all() as { id: string }[];
  if (wordsWithoutSync.length > 0) {
    const updateWordSync = db.prepare('UPDATE words SET sync_id = ? WHERE id = ?');
    for (const w of wordsWithoutSync) {
      updateWordSync.run(crypto.randomUUID(), w.id);
    }
  }

  // 2. folders table
  const folderCols = (db.prepare('PRAGMA table_info(folders)').all() as { name: string }[]).map((c) => c.name);
  if (!folderCols.includes('sync_id')) {
    db.exec('ALTER TABLE folders ADD COLUMN sync_id TEXT;');
  }
  if (!folderCols.includes('deleted_at')) {
    db.exec('ALTER TABLE folders ADD COLUMN deleted_at DATETIME;');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_folders_sync_id ON folders(sync_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON folders(deleted_at);');

  const foldersWithoutSync = db.prepare('SELECT id FROM folders WHERE sync_id IS NULL').all() as { id: string }[];
  if (foldersWithoutSync.length > 0) {
    const updateFolderSync = db.prepare('UPDATE folders SET sync_id = ? WHERE id = ?');
    for (const f of foldersWithoutSync) {
      updateFolderSync.run(crypto.randomUUID(), f.id);
    }
  }

  // 3. review_history table
  const reviewCols = (db.prepare('PRAGMA table_info(review_history)').all() as { name: string }[]).map((c) => c.name);
  if (!reviewCols.includes('sync_id')) {
    db.exec('ALTER TABLE review_history ADD COLUMN sync_id TEXT;');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_review_history_sync_id ON review_history(sync_id);');

  const reviewsWithoutSync = db.prepare('SELECT id FROM review_history WHERE sync_id IS NULL').all() as { id: string }[];
  if (reviewsWithoutSync.length > 0) {
    const updateReviewSync = db.prepare('UPDATE review_history SET sync_id = ? WHERE id = ?');
    for (const r of reviewsWithoutSync) {
      updateReviewSync.run(crypto.randomUUID(), r.id);
    }
  }
}

