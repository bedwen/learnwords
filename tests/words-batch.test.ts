import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { WordService, FolderNotFoundError } from '../server/services/words';

// Mock the DB connection to use in-memory DB for tests
vi.mock('../server/db', () => ({
  getDatabase: () => globalThis.__TEST_DB__
}));
vi.mock('../server/db/connection', () => ({
  getDatabase: () => globalThis.__TEST_DB__,
  createTestDatabase: vi.fn(),
  closeDatabase: vi.fn()
}));

declare global {
  var __TEST_DB__: Database.Database;
}

const db = () => globalThis.__TEST_DB__;

function count(sql: string, ...params: unknown[]): number {
  return (db().prepare(sql).get(...params) as { count: number }).count;
}

function createFolder(id: string, name = id): void {
  db().prepare(`INSERT INTO folders (id, name) VALUES (?, ?)`).run(id, name);
}

function link(wordId: string, folderId: string): void {
  db().prepare(`INSERT INTO word_folders (word_id, folder_id) VALUES (?, ?)`).run(wordId, folderId);
}

function addReview(wordId: string, id: string): void {
  db().prepare(`
    INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after)
    VALUES (?, ?, 'good', 1, 2, 1, 2)
  `).run(id, wordId);
}

function getLearningState(wordId: string) {
  return db().prepare(`SELECT * FROM learning_states WHERE word_id = ?`).get(wordId);
}

describe('WordService batch operations', () => {
  beforeEach(() => {
    globalThis.__TEST_DB__ = new Database(':memory:');
    globalThis.__TEST_DB__.pragma('foreign_keys = ON');
    initializeSchema(globalThis.__TEST_DB__);
  });

  afterEach(() => {
    globalThis.__TEST_DB__.close();
  });

  describe('batchUpdateCefr', () => {
    it('updates the level of all specified words only', () => {
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      const b = WordService.createWord({ word: 'b', meaning: 'b', level: 'A2' });
      const c = WordService.createWord({ word: 'c', meaning: 'c', level: 'B1' });

      const updated = WordService.batchUpdateCefr([a.id, b.id], 'C1');

      expect(updated).toBe(2);
      expect(WordService.getWordById(a.id)?.level).toBe('C1');
      expect(WordService.getWordById(b.id)?.level).toBe('C1');
      expect(WordService.getWordById(c.id)?.level).toBe('B1');
    });

    it('keeps learning state and review history intact', () => {
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      db().prepare(`
        UPDATE learning_states
        SET mastery = 3, interval_step = 4, review_count = 7, correct_count = 5, wrong_count = 2, consecutive_correct = 3,
            next_review = '2030-01-01T00:00:00.000Z', last_reviewed = '2026-01-01T00:00:00.000Z'
        WHERE word_id = ?
      `).run(a.id);
      addReview(a.id, 'r1');
      addReview(a.id, 'r2');

      const stateBefore = getLearningState(a.id);
      const historyBefore = db().prepare(`SELECT * FROM review_history WHERE word_id = ? ORDER BY id`).all(a.id);

      WordService.batchUpdateCefr([a.id], 'B2');

      expect(getLearningState(a.id)).toEqual(stateBefore);
      expect(db().prepare(`SELECT * FROM review_history WHERE word_id = ? ORDER BY id`).all(a.id)).toEqual(historyBefore);
    });

    it('deduplicates IDs and ignores non-existent words', () => {
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });

      const updated = WordService.batchUpdateCefr([a.id, a.id, 'missing-id'], 'B1');

      expect(updated).toBe(1);
      expect(WordService.getWordById(a.id)?.level).toBe('B1');
    });

    it('throws on invalid CEFR level and changes nothing', () => {
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });

      expect(() => WordService.batchUpdateCefr([a.id], 'D1')).toThrow('Invalid CEFR level');
      expect(WordService.getWordById(a.id)?.level).toBe('A1');
    });

    it('returns 0 for an empty array', () => {
      WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      expect(WordService.batchUpdateCefr([], 'B1')).toBe(0);
      expect(count(`SELECT COUNT(*) as count FROM words WHERE level = 'B1'`)).toBe(0);
    });
  });

  describe('batchDeleteWords', () => {
    it('deletes the specified words and cascades related rows', () => {
      createFolder('f1');
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      const b = WordService.createWord({ word: 'b', meaning: 'b', level: 'A1' });
      const c = WordService.createWord({ word: 'c', meaning: 'c', level: 'A1' });
      link(a.id, 'f1');
      link(b.id, 'f1');
      link(c.id, 'f1');
      addReview(a.id, 'r1');
      addReview(b.id, 'r2');
      addReview(c.id, 'r3');

      const deleted = WordService.batchDeleteWords([a.id, b.id]);

      expect(deleted).toBe(2);
      expect(WordService.getWordById(a.id)).toBeNull();
      expect(WordService.getWordById(b.id)).toBeNull();
      expect(WordService.getWordById(c.id)).not.toBeNull();
      expect(count(`SELECT COUNT(*) as count FROM learning_states`)).toBe(1);
      expect(count(`SELECT COUNT(*) as count FROM review_history`)).toBe(1);
      expect(count(`SELECT COUNT(*) as count FROM word_folders`)).toBe(1);
      expect(count(`SELECT COUNT(*) as count FROM folders`)).toBe(1);
    });

    it('ignores non-existent and duplicate IDs gracefully', () => {
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });

      const deleted = WordService.batchDeleteWords([a.id, a.id, 'missing-1', 'missing-2']);

      expect(deleted).toBe(1);
      expect(count(`SELECT COUNT(*) as count FROM words`)).toBe(0);
    });

    it('returns 0 for an empty array', () => {
      WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      expect(WordService.batchDeleteWords([])).toBe(0);
      expect(count(`SELECT COUNT(*) as count FROM words`)).toBe(1);
    });
  });

  describe('batchUpdateFolder (add)', () => {
    it('links words to the folder without duplicating existing links', () => {
      createFolder('f1');
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      const b = WordService.createWord({ word: 'b', meaning: 'b', level: 'A1' });
      link(a.id, 'f1');

      WordService.batchUpdateFolder([a.id, b.id, b.id], 'f1', 'add');

      expect(count(`SELECT COUNT(*) as count FROM word_folders WHERE folder_id = 'f1'`)).toBe(2);
      expect(count(`SELECT COUNT(*) as count FROM word_folders WHERE word_id = ?`, a.id)).toBe(1);
    });

    it('keeps existing links to other folders', () => {
      createFolder('f1');
      createFolder('f2');
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      link(a.id, 'f1');

      WordService.batchUpdateFolder([a.id], 'f2', 'add');

      expect(WordService.getWordById(a.id)?.folderIds.sort()).toEqual(['f1', 'f2']);
    });

    it('skips non-existent word IDs without failing', () => {
      createFolder('f1');
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });

      expect(() => WordService.batchUpdateFolder([a.id, 'missing-id'], 'f1', 'add')).not.toThrow();
      expect(count(`SELECT COUNT(*) as count FROM word_folders`)).toBe(1);
    });

    it('throws FolderNotFoundError if folder does not exist', () => {
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });

      expect(() => WordService.batchUpdateFolder([a.id], 'missing-folder', 'add')).toThrow(FolderNotFoundError);
      expect(() => WordService.batchUpdateFolder([a.id], 'missing-folder', 'add')).toThrow('Folder not found');
      expect(count(`SELECT COUNT(*) as count FROM word_folders`)).toBe(0);
    });

    it('does not alter learning state', () => {
      createFolder('f1');
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      const stateBefore = getLearningState(a.id);

      WordService.batchUpdateFolder([a.id], 'f1', 'add');

      expect(getLearningState(a.id)).toEqual(stateBefore);
    });
  });

  describe('batchUpdateFolder (remove)', () => {
    it('unlinks words from target folder only', () => {
      createFolder('f1');
      createFolder('f2');
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      const b = WordService.createWord({ word: 'b', meaning: 'b', level: 'A1' });
      const c = WordService.createWord({ word: 'c', meaning: 'c', level: 'A1' });
      link(a.id, 'f1');
      link(a.id, 'f2');
      link(b.id, 'f1');
      link(c.id, 'f1');

      WordService.batchUpdateFolder([a.id, b.id], 'f1', 'remove');

      expect(WordService.getWordById(a.id)?.folderIds).toEqual(['f2']);
      expect(WordService.getWordById(b.id)?.folderIds).toEqual([]);
      expect(WordService.getWordById(c.id)?.folderIds).toEqual(['f1']);
    });

    it('does not delete words, learning states or review history', () => {
      createFolder('f1');
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      link(a.id, 'f1');
      addReview(a.id, 'r1');
      const stateBefore = getLearningState(a.id);

      WordService.batchUpdateFolder([a.id], 'f1', 'remove');

      expect(WordService.getWordById(a.id)).not.toBeNull();
      expect(getLearningState(a.id)).toEqual(stateBefore);
      expect(count(`SELECT COUNT(*) as count FROM review_history`)).toBe(1);
      expect(count(`SELECT COUNT(*) as count FROM folders`)).toBe(1);
    });

    it('makes words ungrouped when removed from their only folder', () => {
      createFolder('f1');
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      link(a.id, 'f1');

      WordService.batchUpdateFolder([a.id], 'f1', 'remove');

      const ungrouped = WordService.getWords({ folderId: 'ungrouped' });
      expect(ungrouped.map((w) => w.id)).toEqual([a.id]);
    });

    it('throws FolderNotFoundError if folder does not exist', () => {
      const a = WordService.createWord({ word: 'a', meaning: 'a', level: 'A1' });
      expect(() => WordService.batchUpdateFolder([a.id], 'missing-folder', 'remove')).toThrow(FolderNotFoundError);
    });
  });
});
