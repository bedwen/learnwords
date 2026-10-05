import { nanoid } from 'nanoid';
import { getDatabase } from '../db';
import { WordWithState, CreateWordDto, UpdateWordDto } from '../../src/types';
import { FolderService } from './folders';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export class FolderNotFoundError extends Error {
  constructor() {
    super('Folder not found');
    this.name = 'FolderNotFoundError';
  }
}

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
    folderId?: string; // Filter by folder ID, or 'ungrouped' for words with no folders
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
    `;
    
    const params: any[] = [];

    // Folder filtering
    if (options?.folderId === 'ungrouped') {
      query += ` WHERE NOT EXISTS (SELECT 1 FROM word_folders wf WHERE wf.word_id = w.id)`;
    } else if (options?.folderId) {
      query += ` JOIN word_folders wf ON w.id = wf.word_id AND wf.folder_id = ?`;
      params.push(options.folderId);
      query += ` WHERE 1=1`;
    } else {
      query += ` WHERE 1=1`;
    }

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
   * Get a single word by ID, including folder IDs
   */
  static getWordById(id: string): (WordWithState & { folderIds: string[] }) | null {
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
    
    const word = this.mapRowToWordWithState(row);
    const folderIds = FolderService.getWordFolderIds(id);
    return { ...word, folderIds };
  }

  /**
   * Create a new word and its initial learning state.
   * Optionally associates the word with folders.
   */
  static createWord(data: CreateWordDto): WordWithState & { folderIds: string[] } {
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

      // Set folder associations if provided
      if (data.folderIds && data.folderIds.length > 0) {
        FolderService.setWordFolders(wordId, data.folderIds);
      }
    });

    transaction();

    return this.getWordById(wordId)!;
  }

  /**
   * Update an existing word
   */
  static updateWord(id: string, data: UpdateWordDto): (WordWithState & { folderIds: string[] }) | null {
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

    // Update folder associations if provided
    if (data.folderIds !== undefined) {
      FolderService.setWordFolders(id, data.folderIds);
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
   * Manually change the CEFR level of multiple words (user-initiated only).
   * Learning state and review history are never touched.
   * Returns the number of words updated.
   */
  static batchUpdateCefr(wordIds: string[], level: string): number {
    if (!CEFR_LEVELS.includes(level)) {
      throw new Error('Invalid CEFR level');
    }
    const ids = Array.from(new Set(wordIds));
    if (ids.length === 0) return 0;

    const db = getDatabase();
    const stmt = db.prepare(`UPDATE words SET level = ?, updated_at = ? WHERE id = ?`);
    const now = new Date().toISOString();

    const transaction = db.transaction((idList: string[]) => {
      let count = 0;
      for (const id of idList) {
        count += stmt.run(level, now, id).changes;
      }
      return count;
    });

    return transaction(ids);
  }

  /**
   * Delete multiple words. Cascades remove learning states, review history
   * and folder links. Non-existent IDs are ignored.
   * Returns the number of words deleted.
   */
  static batchDeleteWords(wordIds: string[]): number {
    const ids = Array.from(new Set(wordIds));
    if (ids.length === 0) return 0;

    const db = getDatabase();
    const stmt = db.prepare(`DELETE FROM words WHERE id = ?`);

    const transaction = db.transaction((idList: string[]) => {
      let count = 0;
      for (const id of idList) {
        count += stmt.run(id).changes;
      }
      return count;
    });

    return transaction(ids);
  }

  /**
   * Add multiple words to a folder, or remove them from it.
   * Only word_folders links are changed. Throws FolderNotFoundError if the folder is missing.
   */
  static batchUpdateFolder(wordIds: string[], folderId: string, action: 'add' | 'remove'): void {
    const db = getDatabase();

    const folder = db.prepare(`SELECT 1 FROM folders WHERE id = ?`).get(folderId);
    if (!folder) {
      throw new FolderNotFoundError();
    }

    const ids = Array.from(new Set(wordIds));
    if (ids.length === 0) return;

    const stmt = action === 'add'
      ? db.prepare(`INSERT OR IGNORE INTO word_folders (word_id, folder_id) SELECT id, ? FROM words WHERE id = ?`)
      : db.prepare(`DELETE FROM word_folders WHERE folder_id = ? AND word_id = ?`);

    const transaction = db.transaction((idList: string[]) => {
      for (const id of idList) {
        stmt.run(folderId, id);
      }
    });

    transaction(ids);
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
