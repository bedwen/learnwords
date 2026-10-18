import { getDatabase } from '../db';
import { ActivityDay, CEFRLevel, HomeSummary, DetailedStats, WordWithState } from '../../src/types';
import { normalizeTimestamp } from '../../src/storage/smartMerge';

export class HomeService {
  static getHomeSummary(): HomeSummary {
    const db = getDatabase();
    const now = new Date().toISOString();

    // 1. Total Words (excluding soft-deleted)
    const totalWordsRow = db.prepare('SELECT COUNT(*) as count FROM words WHERE deleted_at IS NULL').get() as any;
    const totalWords = totalWordsRow.count;

    // 2. Due for review (next_review <= now OR mastery = 0, excluding soft-deleted)
    const dueRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM learning_states ls
      JOIN words w ON w.id = ls.word_id
      WHERE w.deleted_at IS NULL AND (ls.next_review <= ? OR ls.mastery = 0)
    `).get(now) as any;
    const dueForReview = dueRow.count;

    // 3. CEFR Distribution (Total & Mastered, excluding soft-deleted)
    const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const cefrDistribution = levels.map(level => {
      const stats = db.prepare(`
        SELECT 
          COUNT(w.id) as total,
          SUM(CASE WHEN ls.mastery = 4 THEN 1 ELSE 0 END) as mastered
        FROM words w
        LEFT JOIN learning_states ls ON w.id = ls.word_id
        WHERE w.level = ? AND w.deleted_at IS NULL
      `).get(level) as any;

      return {
        level,
        totalWords: stats.total || 0,
        masteredWords: stats.mastered || 0,
      };
    });

    // 4. Activity calendar for the last 13 weeks (~90-98 days)
    const reviewHistoryRows = db.prepare(`
      SELECT date(reviewed_at) as date, COUNT(*) as count
      FROM review_history
      WHERE reviewed_at >= date('now', '-98 days')
      GROUP BY date(reviewed_at)
      ORDER BY date ASC
    `).all() as { date: string; count: number }[];

    const wordRows = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM words
      WHERE created_at >= date('now', '-98 days') AND deleted_at IS NULL
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all() as { date: string; count: number }[];

    const reviewsMap = new Map<string, number>();
    for (const row of reviewHistoryRows) {
      reviewsMap.set(row.date, row.count);
    }

    const wordsMap = new Map<string, number>();
    for (const row of wordRows) {
      wordsMap.set(row.date, row.count);
    }

    const today = new Date();
    const dayOfWeek = today.getUTCDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
    // 13 full weeks (91 days) + current week through today
    const totalDays = 13 * 7 + dayOfWeek + 1;

    const activityDays: ActivityDay[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const reviews = reviewsMap.get(dateStr) || 0;
      const wordsAdded = wordsMap.get(dateStr) || 0;
      const count = reviews + wordsAdded;
      activityDays.push({
        date: dateStr,
        count,
        reviews,
        wordsAdded,
      });
    }

    const activeDaysLast90 = activityDays.filter(d => d.count > 0).length;
    const totalContributionsLast90 = activityDays.reduce((acc, d) => acc + d.count, 0);

    let currentStreak = 0;
    const todayIndex = activityDays.length - 1;
    if (todayIndex >= 0) {
      let startIndex = -1;
      if (activityDays[todayIndex].count > 0) {
        startIndex = todayIndex;
      } else if (todayIndex > 0 && activityDays[todayIndex - 1].count > 0) {
        startIndex = todayIndex - 1;
      }

      if (startIndex >= 0) {
        for (let i = startIndex; i >= 0; i--) {
          if (activityDays[i].count > 0) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
    }

    return {
      totalWords,
      dueForReview,
      cefrDistribution,
      activityDays,
      activeDaysLast90,
      totalContributionsLast90,
      activeDaysLastYear: activeDaysLast90,
      totalContributionsLastYear: totalContributionsLast90,
      reviewActivity: activityDays,
      activeDaysLast60: activeDaysLast90,
      totalReviewsLast60: totalContributionsLast90,
      currentStreak,
    };
  }

  // Backwards compatibility alias
  static getDashboardSummary(): HomeSummary {
    return this.getHomeSummary();
  }

  static getDetailedStats(): DetailedStats {
    const db = getDatabase();

    // 1. Total words (excluding soft-deleted)
    const totalWordsRow = db.prepare('SELECT COUNT(*) as count FROM words WHERE deleted_at IS NULL').get() as any;
    const totalWords = totalWordsRow.count;

    // 2. CEFR Distribution (excluding soft-deleted)
    const cefrDistributionRows = db.prepare(`
      SELECT level, COUNT(*) as count FROM words WHERE deleted_at IS NULL GROUP BY level
    `).all() as any[];
    const cefrDistribution = cefrDistributionRows.map(r => ({ level: r.level as CEFRLevel, count: r.count }));

    // 3. Mastery Distribution (excluding soft-deleted)
    const masteryDistributionRows = db.prepare(`
      SELECT ls.mastery, COUNT(*) as count
      FROM learning_states ls
      JOIN words w ON w.id = ls.word_id
      WHERE w.deleted_at IS NULL
      GROUP BY ls.mastery
    `).all() as any[];
    const masteryDistribution = masteryDistributionRows.map(r => ({ mastery: r.mastery, count: r.count }));

    // 4. Accuracy and totals (excluding soft-deleted)
    const totalsRow = db.prepare(`
      SELECT 
        SUM(ls.review_count) as totalReviews,
        SUM(ls.correct_count) as totalCorrect,
        SUM(ls.wrong_count) as totalWrong
      FROM learning_states ls
      JOIN words w ON w.id = ls.word_id
      WHERE w.deleted_at IS NULL
    `).get() as any;

    const totalReviews = totalsRow.totalReviews || 0;
    const totalCorrect = totalsRow.totalCorrect || 0;
    const totalWrong = totalsRow.totalWrong || 0;
    const accuracy = totalReviews > 0 ? (totalCorrect / totalReviews) * 100 : 0;

    // 5. Difficult Words (excluding soft-deleted)
    const difficultWordsRows = db.prepare(`
      SELECT 
        w.*,
        ls.id as ls_id,
        ls.word_id as ls_word_id,
        ls.mastery as ls_mastery,
        ls.interval_step as ls_interval_step,
        ls.next_review as ls_next_review,
        ls.last_reviewed as ls_last_reviewed,
        ls.review_count as ls_review_count,
        ls.correct_count as ls_correct_count,
        ls.wrong_count as ls_wrong_count,
        ls.consecutive_correct as ls_consecutive_correct
      FROM words w
      JOIN learning_states ls ON w.id = ls.word_id
      WHERE w.deleted_at IS NULL AND ls.wrong_count > ls.correct_count AND ls.review_count >= 3
      ORDER BY (CAST(ls.wrong_count AS FLOAT) / ls.review_count) DESC
      LIMIT 10
    `).all() as any[];

    const difficultWords = difficultWordsRows.map(row => this.mapRowToWordWithState(row));

    // 6. Recent Reviews (excluding soft-deleted words)
    const recentRows = db.prepare(`
      SELECT 
        w.word,
        w.level,
        rh.rating,
        rh.reviewed_at
      FROM review_history rh
      JOIN words w ON w.id = rh.word_id
      WHERE w.deleted_at IS NULL
      ORDER BY rh.reviewed_at DESC
      LIMIT 10
    `).all() as any[];

    return {
      totalWords,
      cefrDistribution,
      masteryDistribution,
      totalReviews,
      totalCorrect,
      totalWrong,
      accuracy: Math.round(accuracy),
      difficultWords,
      recentReviews: recentRows,
    };
  }

  private static mapRowToWordWithState(row: any): WordWithState {
    return {
      id: row.id,
      sync_id: row.sync_id || row.id,
      word: row.word,
      meaning: row.meaning,
      level: row.level,
      part_of_speech: row.part_of_speech,
      example_sentence: row.example_sentence,
      example_translation: row.example_translation,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: normalizeTimestamp(row.updated_at),
      deleted_at: row.deleted_at ? normalizeTimestamp(row.deleted_at) : null,
      learning_state: {
        id: row.ls_id,
        word_id: row.ls_word_id,
        mastery: row.ls_mastery,
        interval_step: row.ls_interval_step,
        next_review: row.ls_next_review,
        last_reviewed: row.ls_last_reviewed,
        review_count: row.ls_review_count,
        correct_count: row.ls_correct_count,
        wrong_count: row.ls_wrong_count,
        consecutive_correct: row.ls_consecutive_correct
      }
    };
  }
}

export const DashboardService = HomeService;
