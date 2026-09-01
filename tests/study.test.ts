import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { WordService } from '../server/services/words';
import { StudyService } from '../server/services/study';

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

describe('StudyService', () => {
  beforeEach(() => {
    globalThis.__TEST_DB__ = new Database(':memory:');
    globalThis.__TEST_DB__.pragma('foreign_keys = ON');
    initializeSchema(globalThis.__TEST_DB__);
  });

  afterEach(() => {
    globalThis.__TEST_DB__.close();
  });

  it('should fetch study queue prioritizing new words', () => {
    // 1. Create a word
    const newWord = WordService.createWord({ word: 'new', meaning: 'new', level: 'B1' });
    
    // 2. Queue should have 1 word
    const queue = StudyService.getStudyQueue(10);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(newWord.id);
  });

  it('should process a review and update DB', () => {
    const word = WordService.createWord({ word: 'test', meaning: 'test', level: 'B1' });
    
    const updated = StudyService.processReview(word.id, 'good');
    
    expect(updated.learning_state.mastery).toBe(1); // progressed to Learning
    expect(updated.learning_state.interval_step).toBe(1); // step 0 -> step 1
    expect(updated.learning_state.review_count).toBe(1);
    expect(updated.learning_state.correct_count).toBe(1);
    expect(updated.learning_state.consecutive_correct).toBe(1);

    // Verify history was inserted
    const historyCount = globalThis.__TEST_DB__.prepare('SELECT COUNT(*) as count FROM review_history').get() as any;
    expect(historyCount.count).toBe(1);
  });
});
