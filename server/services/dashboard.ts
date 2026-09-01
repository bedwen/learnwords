import { getDatabase } from '../db';
import { CEFRLevel, DashboardSummary, DetailedStats, WordWithState } from '../../src/types';

export class DashboardService {
  static getDashboardSummary(): DashboardSummary {
    const db = getDatabase();
    const now = new Date().toISOString();

    // 1. Total Words
    const totalWordsRow = db.prepare('SELECT COUNT(*) as count FROM words').get() as any;
    const totalWords = totalWordsRow.count;

    // 2. Due for review (next_review <= now OR mastery = 0)
    const dueRow = db.prepare('SELECT COUNT(*) as count FROM learning_states WHERE next_review <= ? OR mastery = 0').get(now) as any;
    const dueForReview = dueRow.count;

    // 3. CEFR Distribution (Total & Mastered)
    const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const cefrDistribution = levels.map(level => {
      const stats = db.prepare(`
        SELECT 
          COUNT(w.id) as total,
          SUM(CASE WHEN ls.mastery = 4 THEN 1 ELSE 0 END) as mastered
        FROM words w
        LEFT JOIN learning_states ls ON w.id = ls.word_id
        WHERE w.level = ?
      `).get(level) as any;

      return {
        level,
        totalWords: stats.total || 0,
        masteredWords: stats.mastered || 0,
      };
    });

    return {
      totalWords,
      dueForReview,
      cefrDistribution,
    };
  }

  static getDetailedStats(): DetailedStats {
    const db = getDatabase();

    // 1. Total words
    const totalWordsRow = db.prepare('SELECT COUNT(*) as count FROM words').get() as any;
    const totalWords = totalWordsRow.count;

    // 2. CEFR Distribution
    const cefrDistributionRows = db.prepare(`
      SELECT level, COUNT(*) as count FROM words GROUP BY level
    `).all() as any[];
    const cefrDistribution = cefrDistributionRows.map(r => ({ level: r.level as CEFRLevel, count: r.count }));

    // 3. Mastery Distribution
    const masteryDistributionRows = db.prepare(`
      SELECT mastery, COUNT(*) as count FROM learning_states GROUP BY mastery
    `).all() as any[];
    const masteryDistribution = masteryDistributionRows.map(r => ({ mastery: r.mastery, count: r.count }));

    // 4. Accuracy and totals
    const totalsRow = db.prepare(`
      SELECT 
        SUM(review_count) as totalReviews,
        SUM(correct_count) as totalCorrect,
        SUM(wrong_count) as totalWrong
      FROM learning_states
    `).get() as any;

    const totalReviews = totalsRow.totalReviews || 0;
    const totalCorrect = totalsRow.totalCorrect || 0;
    const totalWrong = totalsRow.totalWrong || 0;
    const accuracy = totalReviews > 0 ? (totalCorrect / totalReviews) * 100 : 0;

    // 5. Difficult Words
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
      WHERE ls.wrong_count > ls.correct_count AND ls.review_count >= 3
      ORDER BY (CAST(ls.wrong_count AS FLOAT) / ls.review_count) DESC
      LIMIT 10
    `).all() as any[];

    const difficultWords = difficultWordsRows.map(row => this.mapRowToWordWithState(row));

    // 6. Recent Reviews
    const recentRows = db.prepare(`
      SELECT 
        w.word,
        w.level,
        rh.rating,
        rh.reviewed_at
      FROM review_history rh
      JOIN words w ON w.id = rh.word_id
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
      word: row.word,
      meaning: row.meaning,
      level: row.level,
      part_of_speech: row.part_of_speech,
      example_sentence: row.example_sentence,
      example_translation: row.example_translation,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
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
