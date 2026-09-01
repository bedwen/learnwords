import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { createTestDatabase } from '../server/db/connection';
import { nanoid } from 'nanoid';

/** Helper: current ISO datetime string for test inserts */
function now(): string {
  return new Date().toISOString();
}

/** Helper: insert a learning state with default new-word values */
function insertLearningState(db: Database.Database, wordId: string): string {
  const id = nanoid();
  db.prepare(
    `INSERT INTO learning_states
      (id, word_id, mastery, interval_step, next_review, review_count, correct_count, wrong_count, consecutive_correct)
      VALUES (?, ?, 0, 0, ?, 0, 0, 0, 0)`,
  ).run(id, wordId, now());
  return id;
}

describe('Database Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Table creation', () => {
    it('should create words table', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='words'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it('should create learning_states table', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='learning_states'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it('should create review_history table', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='review_history'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it('should be idempotent (safe to call multiple times)', () => {
      expect(() => initializeSchema(db)).not.toThrow();
    });
  });

  describe('Words table', () => {
    it('should have all required columns', () => {
      const columns = db.prepare('PRAGMA table_info(words)').all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('word');
      expect(columnNames).toContain('meaning');
      expect(columnNames).toContain('level');
      expect(columnNames).toContain('part_of_speech');
      expect(columnNames).toContain('example_sentence');
      expect(columnNames).toContain('example_translation');
      expect(columnNames).toContain('notes');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should enforce NOT NULL on required fields', () => {
      expect(() => {
        db.prepare('INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)')
          .run(nanoid(), 'test', 'test meaning', 'B1');
      }).not.toThrow();

      expect(() => {
        db.prepare('INSERT INTO words (id, word, meaning) VALUES (?, ?, ?)')
          .run(nanoid(), 'test', 'test meaning');
      }).toThrow();
    });

    it('should enforce valid CEFR levels', () => {
      const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

      for (const level of validLevels) {
        expect(() => {
          db.prepare('INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)')
            .run(nanoid(), `word_${level}`, 'meaning', level);
        }).not.toThrow();
      }

      expect(() => {
        db.prepare('INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)')
          .run(nanoid(), 'invalid', 'meaning', 'A3');
      }).toThrow();

      expect(() => {
        db.prepare('INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)')
          .run(nanoid(), 'invalid', 'meaning', 'INVALID');
      }).toThrow();
    });

    it('should allow NULL for optional fields', () => {
      expect(() => {
        db.prepare(
          'INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)',
        ).run(nanoid(), 'test', 'meaning', 'B1');
      }).not.toThrow();
    });
  });

  describe('Learning states table', () => {
    let wordId: string;

    beforeEach(() => {
      wordId = nanoid();
      db.prepare('INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)')
        .run(wordId, 'test', 'test meaning', 'B1');
    });

    it('should have all required columns', () => {
      const columns = db.prepare('PRAGMA table_info(learning_states)').all() as Array<{
        name: string;
      }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('word_id');
      expect(columnNames).toContain('mastery');
      expect(columnNames).toContain('interval_step');
      expect(columnNames).toContain('next_review');
      expect(columnNames).toContain('last_reviewed');
      expect(columnNames).toContain('review_count');
      expect(columnNames).toContain('correct_count');
      expect(columnNames).toContain('wrong_count');
      expect(columnNames).toContain('consecutive_correct');
    });

    it('should enforce UNIQUE on word_id (1:1 relationship)', () => {
      insertLearningState(db, wordId);

      expect(() => {
        insertLearningState(db, wordId);
      }).toThrow();
    });

    it('should enforce foreign key on word_id', () => {
      expect(() => {
        insertLearningState(db, 'nonexistent_word_id');
      }).toThrow();
    });

    it('should accept valid default values for new word', () => {
      const id = insertLearningState(db, wordId);

      const state = db.prepare('SELECT * FROM learning_states WHERE id = ?').get(id) as Record<string, unknown>;
      expect(state.mastery).toBe(0);
      expect(state.interval_step).toBe(0);
      expect(state.review_count).toBe(0);
      expect(state.correct_count).toBe(0);
      expect(state.wrong_count).toBe(0);
      expect(state.consecutive_correct).toBe(0);
    });
  });

  describe('Review history table', () => {
    let wordId: string;

    beforeEach(() => {
      wordId = nanoid();
      db.prepare('INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)')
        .run(wordId, 'test', 'test meaning', 'B1');
    });

    it('should have all required columns', () => {
      const columns = db.prepare('PRAGMA table_info(review_history)').all() as Array<{
        name: string;
      }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('word_id');
      expect(columnNames).toContain('rating');
      expect(columnNames).toContain('mastery_before');
      expect(columnNames).toContain('mastery_after');
      expect(columnNames).toContain('interval_step_before');
      expect(columnNames).toContain('interval_step_after');
      expect(columnNames).toContain('reviewed_at');
    });

    it('should enforce valid rating values', () => {
      const validRatings = ['again', 'hard', 'good', 'easy'];
      for (const rating of validRatings) {
        expect(() => {
          db.prepare(
            'INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after) VALUES (?, ?, ?, 0, 1, 0, 1)',
          ).run(nanoid(), wordId, rating);
        }).not.toThrow();
      }

      expect(() => {
        db.prepare(
          'INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after) VALUES (?, ?, ?, 0, 1, 0, 1)',
        ).run(nanoid(), wordId, 'INVALID');
      }).toThrow();
    });

    it('should enforce foreign key on word_id', () => {
      expect(() => {
        db.prepare(
          'INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after) VALUES (?, ?, ?, 0, 1, 0, 1)',
        ).run(nanoid(), 'nonexistent_word_id', 'good');
      }).toThrow();
    });

    it('should allow multiple reviews per word (1:N)', () => {
      db.prepare(
        'INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after) VALUES (?, ?, ?, 0, 1, 0, 1)',
      ).run(nanoid(), wordId, 'good');

      db.prepare(
        'INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after) VALUES (?, ?, ?, 1, 2, 1, 2)',
      ).run(nanoid(), wordId, 'easy');

      const reviews = db.prepare('SELECT * FROM review_history WHERE word_id = ?').all(wordId);
      expect(reviews).toHaveLength(2);
    });
  });

  describe('CASCADE deletion', () => {
    it('should delete learning_state when word is deleted', () => {
      const wordId = nanoid();
      db.prepare('INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)')
        .run(wordId, 'test', 'meaning', 'B1');
      insertLearningState(db, wordId);

      const before = db.prepare('SELECT * FROM learning_states WHERE word_id = ?').all(wordId);
      expect(before).toHaveLength(1);

      db.prepare('DELETE FROM words WHERE id = ?').run(wordId);

      const after = db.prepare('SELECT * FROM learning_states WHERE word_id = ?').all(wordId);
      expect(after).toHaveLength(0);
    });

    it('should delete review_history when word is deleted', () => {
      const wordId = nanoid();
      db.prepare('INSERT INTO words (id, word, meaning, level) VALUES (?, ?, ?, ?)')
        .run(wordId, 'test', 'meaning', 'B1');
      db.prepare(
        'INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after) VALUES (?, ?, ?, 0, 1, 0, 1)',
      ).run(nanoid(), wordId, 'good');
      db.prepare(
        'INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after) VALUES (?, ?, ?, 1, 2, 1, 2)',
      ).run(nanoid(), wordId, 'easy');

      const before = db.prepare('SELECT * FROM review_history WHERE word_id = ?').all(wordId);
      expect(before).toHaveLength(2);

      db.prepare('DELETE FROM words WHERE id = ?').run(wordId);

      const after = db.prepare('SELECT * FROM review_history WHERE word_id = ?').all(wordId);
      expect(after).toHaveLength(0);
    });
  });

  describe('Indexes', () => {
    it('should create all required indexes', () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_words_word');
      expect(indexNames).toContain('idx_words_level');
      expect(indexNames).toContain('idx_learning_states_word_id');
      expect(indexNames).toContain('idx_learning_states_next_review');
      expect(indexNames).toContain('idx_learning_states_mastery');
      expect(indexNames).toContain('idx_review_history_word_id');
      expect(indexNames).toContain('idx_review_history_reviewed_at');
    });
  });

  describe('Foreign keys enabled', () => {
    it('should have foreign keys enabled', () => {
      const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
      expect(result.foreign_keys).toBe(1);
    });
  });
});
