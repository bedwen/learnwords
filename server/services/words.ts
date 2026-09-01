import { nanoid } from 'nanoid';
import { getDatabase } from '../db';
import { WordWithState, CreateWordDto, UpdateWordDto } from '../../src/types';

export class WordService {
  /**
   * Fetch a list of words, optionally filtered and sorted.
   * Joins with learning_states to return full WordWithState objects.
   */
  static getWords(options?: {
    search?: string;
    level?: string;
    status?: string; // e.g. "New", "Learning", "Familiar", "Strong", "Mastered"
    sortBy?: 'created_at' | 'word';
    order?: 'asc' | 'desc';
  }): WordWithState[] {
    const db = getDatabase();
    
    let query = `
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
      LEFT JOIN learning_states ls ON w.id = ls.word_id
      WHERE 1=1
    `;
    
    const params: any[] = [];

    if (options?.search) {
      query += ` AND (w.word LIKE ? OR w.meaning LIKE ?)`;
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    if (options?.level) {
      query += ` AND w.level = ?`;
      params.push(options.level);
    }

    if (options?.status) {
      const statusMap: Record<string, number> = {
        'New': 0,
        'Learning': 1,
        'Familiar': 2,
        'Strong': 3,
        'Mastered': 4
      };
      const masteryValue = statusMap[options.status];
      if (masteryValue !== undefined) {
        query += ` AND ls.mastery = ?`;
        params.push(masteryValue);
      }
    }

    const validSortCols = { created_at: 'w.created_at', word: 'w.word' };
    const sortCol = options?.sortBy && validSortCols[options.sortBy] ? validSortCols[options.sortBy] : 'w.created_at';
    const order = options?.order === 'asc' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortCol} ${order}`;

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => this.mapRowToWordWithState(row));
  }

  /**
   * Get a single word by ID
   */
  static getWordById(id: string): WordWithState | null {
    const db = getDatabase();
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
      FROM words w
      LEFT JOIN learning_states ls ON w.id = ls.word_id
      WHERE w.id = ?
    `;
    
    const row = db.prepare(query).get(id) as any;
    if (!row) return null;
    
    return this.mapRowToWordWithState(row);
  }

  /**
   * Create a new word and its initial learning state.
   */
  static createWord(data: CreateWordDto): WordWithState {
    const db = getDatabase();
    const wordId = nanoid();
    const stateId = nanoid();
    const now = new Date().toISOString();

    const insertWord = db.prepare(`
      INSERT INTO words (id, word, meaning, level, part_of_speech, example_sentence, example_translation, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertState = db.prepare(`
      INSERT INTO learning_states (id, word_id, mastery, interval_step, next_review, review_count, correct_count, wrong_count, consecutive_correct)
      VALUES (?, ?, 0, 0, ?, 0, 0, 0, 0)
    `);

    // Execute in a transaction
    const transaction = db.transaction(() => {
      insertWord.run(
        wordId,
        data.word.trim(),
        data.meaning.trim(),
        data.level,
        data.part_of_speech?.trim() || null,
        data.example_sentence?.trim() || null,
        data.example_translation?.trim() || null,
        data.notes?.trim() || null,
        now,
        now
      );
      insertState.run(stateId, wordId, now);
    });

    transaction();

    return this.getWordById(wordId)!;
  }

  /**
   * Update an existing word
   */
  static updateWord(id: string, data: UpdateWordDto): WordWithState | null {
    const db = getDatabase();
    
    // Check if word exists
    if (!this.getWordById(id)) return null;

    const updates: string[] = [];
    const params: any[] = [];

    // Only update provided fields
    if (data.word !== undefined) {
      updates.push('word = ?');
      params.push(data.word.trim());
    }
    if (data.meaning !== undefined) {
      updates.push('meaning = ?');
      params.push(data.meaning.trim());
    }
    if (data.level !== undefined) {
      updates.push('level = ?');
      params.push(data.level);
    }
    if (data.part_of_speech !== undefined) {
      updates.push('part_of_speech = ?');
      params.push(data.part_of_speech ? data.part_of_speech.trim() : null);
    }
    if (data.example_sentence !== undefined) {
      updates.push('example_sentence = ?');
      params.push(data.example_sentence ? data.example_sentence.trim() : null);
    }
    if (data.example_translation !== undefined) {
      updates.push('example_translation = ?');
      params.push(data.example_translation ? data.example_translation.trim() : null);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes ? data.notes.trim() : null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());

      params.push(id); // For WHERE id = ?
      
      const query = `UPDATE words SET ${updates.join(', ')} WHERE id = ?`;
      db.prepare(query).run(...params);
    }

    return this.getWordById(id);
  }

  /**
   * Delete a word (cascade delete will remove learning state and history)
   */
  static deleteWord(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare(`DELETE FROM words WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /**
   * Helper to map a flat DB row to the nested WordWithState interface
   */
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
