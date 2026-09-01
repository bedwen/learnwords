import { describe, it, expect } from 'vitest';
import { LearningEngine, ReviewHistoryRecord } from '../server/services/learningEngine';
import { LearningState, ReviewRating } from '../src/types';

describe('LearningEngine', () => {
  const getMockState = (mastery = 0, interval_step = 0): LearningState => ({
    id: 'test',
    word_id: 'word',
    mastery,
    interval_step,
    next_review: '2025-01-01T00:00:00Z',
    review_count: 0,
    correct_count: 0,
    wrong_count: 0,
    consecutive_correct: 0
  });

  const now = '2025-01-01T12:00:00.000Z';

  describe('Basic Progression', () => {
    it('advances interval by 1 step on Good', () => {
      const result = LearningEngine.processReview(getMockState(0, 0), [], 'good', now);
      expect(result.interval_step).toBe(1); // 1 day -> 3 days
      expect(result.mastery).toBe(1); // New -> Learning
    });

    it('advances interval by 2 steps on Easy', () => {
      const result = LearningEngine.processReview(getMockState(0, 0), [], 'easy', now);
      expect(result.interval_step).toBe(2); // 1 day -> 7 days
      expect(result.mastery).toBe(1); // New -> Learning
    });

    it('stays at current interval on Hard', () => {
      const result = LearningEngine.processReview(getMockState(1, 2), [], 'hard', now);
      expect(result.interval_step).toBe(2);
      expect(result.mastery).toBe(1); // Does not progress mastery
    });

    it('regresses interval by 1 step on Again', () => {
      const result = LearningEngine.processReview(getMockState(1, 2), [], 'again', now);
      expect(result.interval_step).toBe(1);
    });

    it('does not drop interval below 0', () => {
      const result = LearningEngine.processReview(getMockState(0, 0), [], 'again', now);
      expect(result.interval_step).toBe(0);
    });

    it('does not exceed max interval step 7', () => {
      const result = LearningEngine.processReview(getMockState(3, 7), [], 'good', now);
      expect(result.interval_step).toBe(7);
      
      const resultEasy = LearningEngine.processReview(getMockState(3, 6), [], 'easy', now);
      expect(resultEasy.interval_step).toBe(7);
    });
  });

  describe('Mastery Regression', () => {
    it('drops Familiar to Learning on Again', () => {
      const result = LearningEngine.processReview(getMockState(2, 3), [], 'again', now);
      expect(result.mastery).toBe(1);
    });

    it('drops Strong to Familiar on Again', () => {
      const result = LearningEngine.processReview(getMockState(3, 4), [], 'again', now);
      expect(result.mastery).toBe(2);
    });

    it('drops Mastered to Strong on Again', () => {
      const result = LearningEngine.processReview(getMockState(4, 5), [], 'again', now);
      expect(result.mastery).toBe(3);
    });

    it('never drops to New (0)', () => {
      const result = LearningEngine.processReview(getMockState(1, 1), [], 'again', now);
      expect(result.mastery).toBe(1);
    });
  });

  describe('Mastery Criteria (Mastered)', () => {
    it('promotes to Mastered when all criteria are met', () => {
      const history: ReviewHistoryRecord[] = [
        { rating: 'good', reviewed_at: '2025-01-01T10:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-02T10:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-03T10:00:00Z' }, // 3 days covered here
        { rating: 'good', reviewed_at: '2025-01-04T10:00:00Z' }
      ];
      // 5th review today
      const now = '2025-01-05T10:00:00.000Z';

      // We are at step 3, so a 'good' rating takes us to step 4 (30 days).
      // This satisfies the interval >= 30 days criterion.
      const result = LearningEngine.processReview(getMockState(3, 3), history, 'good', now);
      
      expect(result.interval_step).toBe(4);
      expect(result.mastery).toBe(4); // Boom, Mastered!
    });

    it('denies Mastered if interval is less than 30 days', () => {
      const history: ReviewHistoryRecord[] = [
        { rating: 'good', reviewed_at: '2025-01-01T10:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-02T10:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-03T10:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-04T10:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-05T10:00:00Z' }
      ];
      // State is step 2, good takes to step 3 (14 days)
      const result = LearningEngine.processReview(getMockState(3, 2), history, 'good', now);
      expect(result.interval_step).toBe(3);
      expect(result.mastery).toBe(3); // Stays Strong
    });

    it('denies Mastered if not across 3 calendar days', () => {
      const history: ReviewHistoryRecord[] = [
        { rating: 'good', reviewed_at: '2025-01-01T08:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-01T10:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-01T12:00:00Z' },
        { rating: 'good', reviewed_at: '2025-01-01T14:00:00Z' }
      ];
      // Today makes it 2 calendar days
      const today = '2025-01-02T10:00:00.000Z';
      
      const result = LearningEngine.processReview(getMockState(3, 3), history, 'good', today);
      expect(result.mastery).toBe(3); // Stays Strong
    });
  });
});
