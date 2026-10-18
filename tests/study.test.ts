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

  it('should remove new word from immediate queue after review with again or hard', () => {
    const wordAgain = WordService.createWord({ word: 'againWord', meaning: 'meaning1', level: 'B1' });
    const wordHard = WordService.createWord({ word: 'hardWord', meaning: 'meaning2', level: 'B1' });

    // Both words are initially present in the study queue as new words (mastery = 0)
    let queue = StudyService.getStudyQueue(10);
    const initialIds = queue.map((w) => w.id);
    expect(initialIds).toContain(wordAgain.id);
    expect(initialIds).toContain(wordHard.id);

    // Review wordAgain with 'again'
    const reviewedAgain = StudyService.processReview(wordAgain.id, 'again');
    expect(reviewedAgain.learning_state.mastery).toBe(1);
    expect(reviewedAgain.learning_state.interval_step).toBe(0);

    // Review wordHard with 'hard'
    const reviewedHard = StudyService.processReview(wordHard.id, 'hard');
    expect(reviewedHard.learning_state.mastery).toBe(1);
    expect(reviewedHard.learning_state.interval_step).toBe(0);

    // Immediate study queue must no longer contain either word
    queue = StudyService.getStudyQueue(10);
    const updatedIds = queue.map((w) => w.id);
    expect(updatedIds).not.toContain(wordAgain.id);
    expect(updatedIds).not.toContain(wordHard.id);
  });
});
