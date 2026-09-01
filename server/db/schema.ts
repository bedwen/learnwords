import Database from 'better-sqlite3';

/**
 * Initialize the database schema.
 * Creates tables, indexes, and constraints as specified in docs/database.md.
 * Safe to call multiple times (uses IF NOT EXISTS).
 */
export function initializeSchema(db: Database.Database): void {
  db.exec(`
    -- Words table: stores vocabulary content
    CREATE TABLE IF NOT EXISTS words (
      id                  TEXT PRIMARY KEY,
      word                TEXT NOT NULL,
      meaning             TEXT NOT NULL,
      level               TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
      part_of_speech      TEXT,
      example_sentence    TEXT,
      example_translation TEXT,
      notes               TEXT,
      created_at          DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at          DATETIME NOT NULL DEFAULT (datetime('now'))
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
      word_id               TEXT NOT NULL,
      rating                TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
      mastery_before        INTEGER NOT NULL,
      mastery_after         INTEGER NOT NULL,
      interval_step_before  INTEGER NOT NULL,
      interval_step_after   INTEGER NOT NULL,
      reviewed_at           DATETIME NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    -- Indexes as specified in docs/database.md
    CREATE INDEX IF NOT EXISTS idx_words_word              ON words(word);
    CREATE INDEX IF NOT EXISTS idx_words_level             ON words(level);
    CREATE INDEX IF NOT EXISTS idx_learning_states_word_id      ON learning_states(word_id);
    CREATE INDEX IF NOT EXISTS idx_learning_states_next_review  ON learning_states(next_review);
    CREATE INDEX IF NOT EXISTS idx_learning_states_mastery      ON learning_states(mastery);
    CREATE INDEX IF NOT EXISTS idx_review_history_word_id       ON review_history(word_id);
    CREATE INDEX IF NOT EXISTS idx_review_history_reviewed_at   ON review_history(reviewed_at);
  `);
}
