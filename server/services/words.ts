import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { getDatabase } from '../db';
import { WordWithState, CreateWordDto, UpdateWordDto } from '../../src/types';
import { FolderService } from './folders';
import { normalizeTimestamp } from '../../src/storage/smartMerge';

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
        ls.consecutive_correct as ls_consecutive_correct,
        ls.sentence_mastery as ls_sentence_mastery,
        ls.sentence_interval_step as ls_sentence_interval_step,
        ls.sentence_next_review as ls_sentence_next_review,
        ls.sentence_last_reviewed as ls_sentence_last_reviewed
      FROM words w
      LEFT JOIN learning_states ls ON w.id = ls.word_id
    `;
    
    const params: any[] = [];

    // Folder filtering
    if (options?.folderId === 'ungrouped') {
      query += ` WHERE NOT EXISTS (SELECT 1 FROM word_folders wf JOIN folders f ON wf.folder_id = f.id WHERE wf.word_id = w.id AND f.deleted_at IS NULL) AND w.deleted_at IS NULL`;
    } else if (options?.folderId) {
      query += ` JOIN word_folders wf ON w.id = wf.word_id AND wf.folder_id = ?`;
      query += ` JOIN folders f ON wf.folder_id = f.id AND f.deleted_at IS NULL`;
      params.push(options.folderId);
      query += ` WHERE w.deleted_at IS NULL`;
    } else {
      query += ` WHERE w.deleted_at IS NULL`;
    }

    if (options?.search) {
      query += ` AND (w.word LIKE ? OR w.meaning LIKE ? OR w.notes LIKE ?)`;
      params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
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
    const folderMap = FolderService.getWordFolderIdsMap(rows.map(r => r.id));

    return rows.map(row => ({
      ...this.mapRowToWordWithState(row),
      folderIds: folderMap.get(row.id) || [],
    }));
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
        ls.consecutive_correct as ls_consecutive_correct,
        ls.sentence_mastery as ls_sentence_mastery,
        ls.sentence_interval_step as ls_sentence_interval_step,
        ls.sentence_next_review as ls_sentence_next_review,
        ls.sentence_last_reviewed as ls_sentence_last_reviewed
      FROM words w
      LEFT JOIN learning_states ls ON w.id = ls.word_id
      WHERE w.id = ? AND w.deleted_at IS NULL
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
    const syncId = crypto.randomUUID();
    const stateId = nanoid();
    const now = new Date().toISOString();

    const insertWord = db.prepare(`
      INSERT INTO words (id, sync_id, word, meaning, level, part_of_speech, example_sentence, example_translation, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertState = db.prepare(`
      INSERT INTO learning_states (id, word_id, mastery, interval_step, next_review, review_count, correct_count, wrong_count, consecutive_correct, sentence_mastery, sentence_interval_step, sentence_next_review, sentence_last_reviewed)
      VALUES (?, ?, 0, 0, ?, 0, 0, 0, 0, 0, 0, ?, NULL)
    `);

    // Execute in a transaction
    const transaction = db.transaction(() => {
      insertWord.run(
        wordId,
        syncId,
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
      insertState.run(stateId, wordId, now, now);

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
   * Soft delete a word: marks deleted_at and updated_at with UTC ISO timestamp.
   * Folder memberships are preserved so they are restored if the word is un-deleted.
   */
  static deleteWord(id: string): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();
    const result = db.prepare(`UPDATE words SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`).run(now, now, id);
    return result.changes > 0;
  }

  /**
   * Fetch soft-deleted words (words in trash), optionally filtered by search or level.
   * Joins with learning_states to return full WordWithState objects, ordered by deleted_at DESC.
   */
  static getTrashWords(filters?: {
    search?: string;
    level?: string;
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
        ls.consecutive_correct as ls_consecutive_correct,
        ls.sentence_mastery as ls_sentence_mastery,
        ls.sentence_interval_step as ls_sentence_interval_step,
        ls.sentence_next_review as ls_sentence_next_review,
        ls.sentence_last_reviewed as ls_sentence_last_reviewed
      FROM words w
      LEFT JOIN learning_states ls ON w.id = ls.word_id
      WHERE w.deleted_at IS NOT NULL
    `;

    const params: any[] = [];

    if (filters?.search) {
      query += ' AND (w.word LIKE ? OR w.meaning LIKE ? OR w.notes LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters?.level) {
      query += ' AND w.level = ?';
      params.push(filters.level);
    }

    query += ' ORDER BY w.deleted_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    const folderMap = FolderService.getWordFolderIdsMap(rows.map((r) => r.id));

    const result = rows.map((row) => ({
      ...this.mapRowToWordWithState(row),
      folderIds: folderMap.get(row.id) || [],
    }));

    return result.sort((a, b) => {
      const timeA = normalizeTimestamp(a.deleted_at);
      const timeB = normalizeTimestamp(b.deleted_at);
      return timeB - timeA;
    });
  }

  /**
   * Count how many words are currently in the trash bin.
   */
  static getTrashCount(): number {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) as count FROM words WHERE deleted_at IS NOT NULL').get() as { count: number } | undefined;
    return row ? row.count : 0;
  }

  /**
   * Restore a soft-deleted word from trash.
   * Sets deleted_at = NULL, preserving 100% of its learning_states and review history.
   */
  static restoreWord(id: string): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();
    const result = db.prepare(`UPDATE words SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`).run(now, id);
    return result.changes > 0;
  }

  /**
   * Permanently delete a word from the database.
   * Cascading foreign keys will delete associated learning_states, review_history, and word_folders.
   */
  static permanentDeleteWord(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM words WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Bulk restore soft-deleted words from trash.
   * Preserves learning states for all restored words.
   */
  static batchRestoreWords(wordIds: string[]): number {
    const ids = Array.from(new Set(wordIds));
    if (ids.length === 0) return 0;

    const db = getDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare(`UPDATE words SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL`);

    const transaction = db.transaction((idList: string[]) => {
      let count = 0;
      for (const id of idList) {
        count += stmt.run(now, id).changes;
      }
      return count;
    });

    return transaction(ids);
  }

  /**
   * Bulk permanently purge words from the database.
   * Cascades delete associated records.
   */
  static batchPermanentDeleteWords(wordIds: string[]): number {
    const ids = Array.from(new Set(wordIds));
    if (ids.length === 0) return 0;

    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM words WHERE id = ?');

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
   * Permanently delete all soft-deleted words in trash.
   * Returns count of purged words.
   */
  static emptyTrash(): number {
    const db = getDatabase();
    let count = 0;
    const transaction = db.transaction(() => {
      const result = db.prepare('DELETE FROM words WHERE deleted_at IS NOT NULL').run();
      count = result.changes;
    });
    transaction();
    return count;
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
   * Bulk soft-delete words into the trash bin.
   * Folder memberships and learning states are preserved for restoration.
   * Non-existent IDs are ignored.
   * Returns the number of words soft-deleted.
   */
  static batchDeleteWords(wordIds: string[]): number {
    const ids = Array.from(new Set(wordIds));
    if (ids.length === 0) return 0;

    const db = getDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare(`UPDATE words SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`);

    const transaction = db.transaction((idList: string[]) => {
      let count = 0;
      for (const id of idList) {
        count += stmt.run(now, now, id).changes;
      }
      return count;
    });

    return transaction(ids);
  }

  /**
   * Add multiple words to a folder, or remove them from it.
   * Updates word_folders links and bumps words.updated_at for LWW sync.
   * Throws FolderNotFoundError if the folder is missing.
   */
  static batchUpdateFolder(wordIds: string[], folderId: string, action: 'add' | 'remove'): void {
    const db = getDatabase();

    const folder = db.prepare(`SELECT 1 FROM folders WHERE id = ?`).get(folderId);
    if (!folder) {
      throw new FolderNotFoundError();
    }

    const ids = Array.from(new Set(wordIds));
    if (ids.length === 0) return;

    const now = new Date().toISOString();
    const stmt = action === 'add'
      ? db.prepare(`INSERT OR IGNORE INTO word_folders (word_id, folder_id) SELECT id, ? FROM words WHERE id = ?`)
      : db.prepare(`DELETE FROM word_folders WHERE folder_id = ? AND word_id = ?`);
    const updateWordStmt = db.prepare(`UPDATE words SET updated_at = ? WHERE id = ?`);

    const transaction = db.transaction((idList: string[]) => {
      for (const id of idList) {
        stmt.run(folderId, id);
        updateWordStmt.run(now, id);
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
        consecutive_correct: row.ls_consecutive_correct,
        sentence_mastery: row.ls_sentence_mastery ?? 0,
        sentence_interval_step: row.ls_sentence_interval_step ?? 0,
        sentence_next_review: row.ls_sentence_next_review ?? row.ls_next_review,
        sentence_last_reviewed: row.ls_sentence_last_reviewed ?? null
      }
    };
  }
}
