import { nanoid } from 'nanoid';
import { getDatabase } from '../db';

export interface FolderRow {
  id: string;
  name: string;
  color: string;
  wordCount: number;
  created_at: string;
  updated_at: string;
}

export interface FolderListResult {
  folders: FolderRow[];
  ungroupedCount: number;
}

export class FolderService {
  /**
   * List all folders with word counts, plus the ungrouped word count.
   */
  static listFolders(): FolderListResult {
    const db = getDatabase();

    const folders = db.prepare(`
      SELECT 
        f.id,
        f.name,
        f.color,
        f.created_at,
        f.updated_at,
        COUNT(wf.word_id) as wordCount
      FROM folders f
      LEFT JOIN word_folders wf ON f.id = wf.folder_id
      GROUP BY f.id
      ORDER BY f.created_at ASC
    `).all() as FolderRow[];

    const ungroupedRow = db.prepare(`
      SELECT COUNT(*) as count FROM words w
      WHERE NOT EXISTS (
        SELECT 1 FROM word_folders wf WHERE wf.word_id = w.id
      )
    `).get() as { count: number };

    return {
      folders,
      ungroupedCount: ungroupedRow.count,
    };
  }

  /**
   * Get a single folder by ID.
   */
  static getFolderById(id: string): FolderRow | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT 
        f.id,
        f.name,
        f.color,
        f.created_at,
        f.updated_at,
        COUNT(wf.word_id) as wordCount
      FROM folders f
      LEFT JOIN word_folders wf ON f.id = wf.folder_id
      WHERE f.id = ?
      GROUP BY f.id
    `).get(id) as FolderRow | undefined;
    return row || null;
  }

  /**
   * Create a new folder.
   */
  static createFolder(name: string, color: string): FolderRow {
    const db = getDatabase();
    const id = nanoid();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO folders (id, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name.trim(), color, now, now);

    return this.getFolderById(id)!;
  }

  /**
   * Update a folder's name and/or color.
   */
  static updateFolder(id: string, data: { name?: string; color?: string }): FolderRow | null {
    const db = getDatabase();

    const existing = this.getFolderById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name.trim());
    }
    if (data.color !== undefined) {
      updates.push('color = ?');
      params.push(data.color);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);

      db.prepare(`UPDATE folders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    return this.getFolderById(id);
  }

  /**
   * Delete a folder. Words are NOT deleted — they become ungrouped.
   */
  static deleteFolder(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Set folder associations for a word (replaces all existing associations).
   */
  static setWordFolders(wordId: string, folderIds: string[]): void {
    const db = getDatabase();

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM word_folders WHERE word_id = ?').run(wordId);

      if (folderIds.length > 0) {
        const insert = db.prepare('INSERT INTO word_folders (word_id, folder_id) VALUES (?, ?)');
        for (const folderId of folderIds) {
          insert.run(wordId, folderId);
        }
      }
    });

    transaction();
  }

  /**
   * Get folder IDs for a given word.
   */
  static getWordFolderIds(wordId: string): string[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT folder_id FROM word_folders WHERE word_id = ?').all(wordId) as { folder_id: string }[];
    return rows.map(r => r.folder_id);
  }

  /**
   * Remove a word from a specific folder.
   */
  static removeWordFromFolder(wordId: string, folderId: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM word_folders WHERE word_id = ? AND folder_id = ?').run(wordId, folderId);
    return result.changes > 0;
  }
}
