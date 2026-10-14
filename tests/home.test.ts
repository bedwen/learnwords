import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { WordService } from '../server/services/words';
import { StudyService } from '../server/services/study';
import { HomeService } from '../server/services/home';

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

describe('HomeService', () => {
  beforeEach(() => {
    globalThis.__TEST_DB__ = new Database(':memory:');
    globalThis.__TEST_DB__.pragma('foreign_keys = ON');
    initializeSchema(globalThis.__TEST_DB__);
  });

  afterEach(() => {
    globalThis.__TEST_DB__.close();
  });

  it('should return empty stats initially', () => {
    const summary = HomeService.getHomeSummary();
    expect(summary.totalWords).toBe(0);
    expect(summary.dueForReview).toBe(0);
    
    const detailed = HomeService.getDetailedStats();
    expect(detailed.totalReviews).toBe(0);
  });

  it('should support backwards compatibility getDashboardSummary alias', () => {
    const summary = HomeService.getDashboardSummary();
    expect(summary.totalWords).toBe(0);
    expect(summary.dueForReview).toBe(0);
  });

  it('should calculate summary stats correctly', () => {
    WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });
    WordService.createWord({ word: 'w2', meaning: 'm2', level: 'C1' });
    WordService.createWord({ word: 'w3', meaning: 'm3', level: 'B1' });
    WordService.createWord({ word: 'w4', meaning: 'm4', level: 'A1' });

    const summary = HomeService.getHomeSummary();
    expect(summary.totalWords).toBe(4);
    
    // By default they are new, so they are due for review
    expect(summary.dueForReview).toBe(4);

    const b1Stats = summary.cefrDistribution.find(d => d.level === 'B1');
    expect(b1Stats?.totalWords).toBe(2);
    expect(b1Stats?.masteredWords).toBe(0);

    const c1Stats = summary.cefrDistribution.find(d => d.level === 'C1');
    expect(c1Stats?.totalWords).toBe(1);

    const a1Stats = summary.cefrDistribution.find(d => d.level === 'A1');
    expect(a1Stats?.totalWords).toBe(1);
  });

  it('should track reviews in detailed stats', () => {
    const w1 = WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });
    
    // Simulate a review
    StudyService.processReview(w1.id, 'again');
    StudyService.processReview(w1.id, 'again');
    StudyService.processReview(w1.id, 'good');

    const detailed = HomeService.getDetailedStats();
    expect(detailed.totalReviews).toBe(3);
    expect(detailed.totalWrong).toBe(2);
    expect(detailed.totalCorrect).toBe(1);
    expect(detailed.accuracy).toBe(33); // 1/3 * 100

    expect(detailed.recentReviews).toHaveLength(3);
    expect(detailed.recentReviews[0].word).toBe('w1');
  });

  it('should return continuous 13-week activityDays with zero metrics when empty', () => {
    const summary = HomeService.getHomeSummary();
    expect(summary.activityDays).toBeDefined();
    expect(summary.activityDays!.length).toBeGreaterThanOrEqual(91);
    expect(summary.activityDays!.length).toBeLessThanOrEqual(105);
    expect(summary.activeDaysLast90).toBe(0);
    expect(summary.totalContributionsLast90).toBe(0);
    expect(summary.activeDaysLastYear).toBe(0);
    expect(summary.totalContributionsLastYear).toBe(0);
    expect(summary.currentStreak).toBe(0);

    // Backwards-compatible properties
    expect(summary.reviewActivity).toBeDefined();
    expect(summary.reviewActivity!.length).toBe(summary.activityDays!.length);
    expect(summary.activeDaysLast60).toBe(0);
    expect(summary.totalReviewsLast60).toBe(0);

    const nonZero = summary.activityDays!.filter(d => d.count > 0);
    expect(nonZero).toHaveLength(0);
  });

  it('should track word creation without reviews as activity', () => {
    WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });
    WordService.createWord({ word: 'w2', meaning: 'm2', level: 'A1' });

    const summary = HomeService.getHomeSummary();
    expect(summary.activeDaysLastYear).toBe(1);
    expect(summary.totalContributionsLastYear).toBe(2);

    const todayEntry = summary.activityDays![summary.activityDays!.length - 1];
    expect(todayEntry.wordsAdded).toBe(2);
    expect(todayEntry.reviews).toBe(0);
    expect(todayEntry.count).toBe(2);
  });

  it('should track review submission without word creation on that date', () => {
    const db = globalThis.__TEST_DB__;
    const w1 = WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });

    // Backdate word creation to 10 days ago so today has 0 words added
    const tenDaysAgo = new Date();
    tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10);
    db.prepare('UPDATE words SET created_at = ? WHERE id = ?').run(tenDaysAgo.toISOString(), w1.id);

    // Review today
    StudyService.processReview(w1.id, 'good');

    const summary = HomeService.getHomeSummary();
    expect(summary.activeDaysLastYear).toBe(2); // 10 days ago (word created) + today (reviewed)
    expect(summary.totalContributionsLastYear).toBe(2);

    const todayEntry = summary.activityDays![summary.activityDays!.length - 1];
    expect(todayEntry.wordsAdded).toBe(0);
    expect(todayEntry.reviews).toBe(1);
    expect(todayEntry.count).toBe(1);
  });

  it('should combine review events and word creation on the same date', () => {
    const w1 = WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });

    // 2 reviews today
    StudyService.processReview(w1.id, 'again');
    StudyService.processReview(w1.id, 'good');

    const summary = HomeService.getHomeSummary();
    expect(summary.activeDaysLastYear).toBe(1);
    expect(summary.totalContributionsLastYear).toBe(3); // 1 word + 2 reviews

    const todayEntry = summary.activityDays![summary.activityDays!.length - 1];
    expect(todayEntry.wordsAdded).toBe(1);
    expect(todayEntry.reviews).toBe(2);
    expect(todayEntry.count).toBe(3);
  });

  it('should calculate activityDays, activeDaysLastYear, and currentStreak with multi-day activity', () => {
    const db = globalThis.__TEST_DB__;
    const w1 = WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });

    // Review today
    StudyService.processReview(w1.id, 'good');

    // Review yesterday
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayIso = yesterday.toISOString();
    db.prepare(`
      INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('rev-yest-1', w1.id, 'good', 1, 2, 1, 2, yesterdayIso);

    // Another review yesterday (count should be 2 for yesterday)
    db.prepare(`
      INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('rev-yest-2', w1.id, 'again', 2, 1, 2, 1, yesterdayIso);

    // Review 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    const twoDaysAgoIso = twoDaysAgo.toISOString();
    db.prepare(`
      INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('rev-two-days', w1.id, 'good', 1, 2, 1, 2, twoDaysAgoIso);

    const summary = HomeService.getHomeSummary();
    expect(summary.activeDaysLast90).toBe(3);
    expect(summary.totalContributionsLast90).toBe(5);
    expect(summary.activeDaysLastYear).toBe(3);
    // 1 word added today + 1 review today + 2 reviews yesterday + 1 review 2 days ago = 5
    expect(summary.totalContributionsLastYear).toBe(5);
    expect(summary.currentStreak).toBe(3);

    const activity = summary.activityDays!;
    expect(activity.length).toBeGreaterThanOrEqual(91);
    expect(activity.length).toBeLessThanOrEqual(105);
    expect(activity[activity.length - 1].count).toBe(2); // 1 review + 1 word today
    expect(activity[activity.length - 1].wordsAdded).toBe(1);
    expect(activity[activity.length - 1].reviews).toBe(1);
    expect(activity[activity.length - 2].count).toBe(2); // 2 reviews yesterday
    expect(activity[activity.length - 3].count).toBe(1); // 1 review 2 days ago
  });

  it('should preserve streak if today is inactive but yesterday was active', () => {
    const db = globalThis.__TEST_DB__;
    const w1 = WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });

    // Backdate word creation to yesterday so today is completely inactive
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    db.prepare('UPDATE words SET created_at = ? WHERE id = ?').run(yesterday.toISOString(), w1.id);

    // Review yesterday
    db.prepare(`
      INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('rev-yest', w1.id, 'good', 0, 1, 0, 1, yesterday.toISOString());

    const summary = HomeService.getHomeSummary();
    expect(summary.activeDaysLastYear).toBe(1);
    expect(summary.totalContributionsLastYear).toBe(2); // 1 word + 1 review yesterday
    expect(summary.currentStreak).toBe(1);
  });

  it('should reset streak to 0 if both today and yesterday were inactive', () => {
    const db = globalThis.__TEST_DB__;
    const w1 = WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });

    // Backdate word creation to 2 days ago so both today and yesterday are inactive
    const twoDaysAgo = new Date();
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    db.prepare('UPDATE words SET created_at = ? WHERE id = ?').run(twoDaysAgo.toISOString(), w1.id);

    // Review 2 days ago only
    db.prepare(`
      INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('rev-two-days', w1.id, 'good', 0, 1, 0, 1, twoDaysAgo.toISOString());

    const summary = HomeService.getHomeSummary();
    expect(summary.activeDaysLastYear).toBe(1);
    expect(summary.totalContributionsLastYear).toBe(2); // 1 word + 1 review 2 days ago
    expect(summary.currentStreak).toBe(0);
  });
});
