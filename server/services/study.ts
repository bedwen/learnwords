import { nanoid } from 'nanoid';
import { getDatabase } from '../db';
import { WordWithState, ReviewRating } from '../../src/types';
import { LearningEngine } from './learningEngine';
import { WordService } from './words'; // Reusing for fetching WordWithState

export class StudyService {
  /**
   * Get words due for review.
   * Priority:
   * 1. Due reviews (next_review <= now)
   * 2. New words (mastery = 0)
   */
  static getStudyQueue(limit = 50): WordWithState[] {
    const db = getDatabase();
    const now = new Date().toISOString();

    // SQLite doesn't natively support full ISO date parsing easily for comparison without date(), 
    // but ISO strings sort lexicographically perfectly!
    const query = `
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
      FROM learning_states ls
      JOIN words w ON w.id = ls.word_id
      WHERE ls.next_review <= ? OR ls.mastery = 0
      ORDER BY 
        CASE WHEN ls.mastery = 0 THEN 1 ELSE 0 END, -- Prioritize due reviews over new words
        ls.next_review ASC
      LIMIT ?
    `;

    const rows = db.prepare(query).all(now, limit) as any[];

    // Re-use mapping from WordService
    // WordService's mapRowToWordWithState is private, so let's duplicate or make public.
    // For now, let's map it here.
    return rows.map(row => ({
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
    }));
  }

  /**
   * Process a review rating for a word.
   */
  static processReview(wordId: string, rating: ReviewRating): WordWithState {
    const db = getDatabase();
    const now = new Date().toISOString();

    const word = WordService.getWordById(wordId);
    if (!word) {
      throw new Error(`Word not found: ${wordId}`);
    }

    const state = word.learning_state;

    // Fetch history
    const historyRows = db.prepare(`
      SELECT rating, reviewed_at FROM review_history
      WHERE word_id = ?
      ORDER BY reviewed_at ASC
    `).all(wordId) as { rating: ReviewRating, reviewed_at: string }[];

    // Process pure logic
    const newEngineState = LearningEngine.processReview(state, historyRows, rating, now);

    // Prepare counters
    const isCorrect = rating === 'good' || rating === 'easy';
    const newReviewCount = state.review_count + 1;
    const newCorrectCount = state.correct_count + (isCorrect ? 1 : 0);
    const newWrongCount = state.wrong_count + (isCorrect ? 0 : 1);
    const newConsecutive = isCorrect ? state.consecutive_correct + 1 : 0;

    const updateState = db.prepare(`
      UPDATE learning_states
      SET 
        mastery = ?,
        interval_step = ?,
        next_review = ?,
        last_reviewed = ?,
        review_count = ?,
        correct_count = ?,
        wrong_count = ?,
        consecutive_correct = ?
      WHERE id = ?
    `);

    const insertHistory = db.prepare(`
      INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      updateState.run(
        newEngineState.mastery,
        newEngineState.interval_step,
        newEngineState.next_review,
        now,
        newReviewCount,
        newCorrectCount,
        newWrongCount,
        newConsecutive,
        state.id
      );

      insertHistory.run(
        nanoid(),
        wordId,
        rating,
        state.mastery,
        newEngineState.mastery,
        state.interval_step,
        newEngineState.interval_step,
        now
      );
    });

    transaction();

    return WordService.getWordById(wordId)!;
  }
}
