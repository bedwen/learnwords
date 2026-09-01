import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { WordService } from '../server/services/words';
import { StudyService } from '../server/services/study';
import { DashboardService } from '../server/services/dashboard';

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

describe('DashboardService', () => {
  beforeEach(() => {
    globalThis.__TEST_DB__ = new Database(':memory:');
    globalThis.__TEST_DB__.pragma('foreign_keys = ON');
    initializeSchema(globalThis.__TEST_DB__);
  });

  afterEach(() => {
    globalThis.__TEST_DB__.close();
  });

  it('should return empty stats initially', () => {
    const summary = DashboardService.getDashboardSummary();
    expect(summary.totalWords).toBe(0);
    expect(summary.dueForReview).toBe(0);
    
    const detailed = DashboardService.getDetailedStats();
    expect(detailed.totalReviews).toBe(0);
  });

  it('should calculate summary stats correctly', () => {
    WordService.createWord({ word: 'w1', meaning: 'm1', level: 'B1' });
    WordService.createWord({ word: 'w2', meaning: 'm2', level: 'C1' });
    WordService.createWord({ word: 'w3', meaning: 'm3', level: 'B1' });
    WordService.createWord({ word: 'w4', meaning: 'm4', level: 'A1' });

    const summary = DashboardService.getDashboardSummary();
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

    const detailed = DashboardService.getDetailedStats();
    expect(detailed.totalReviews).toBe(3);
    expect(detailed.totalWrong).toBe(2);
    expect(detailed.totalCorrect).toBe(1);
    expect(detailed.accuracy).toBe(33); // 1/3 * 100

    expect(detailed.recentReviews).toHaveLength(3);
    expect(detailed.recentReviews[0].word).toBe('w1');
  });
});
