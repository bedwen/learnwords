import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { getDatabase } from '../db';

export interface FolderRow {
  id: string;
  sync_id?: string;
  name: string;
  color: string;
  wordCount: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | number | null;
}

export interface FolderListResult {
  folders: FolderRow[];
  ungroupedCount: number;
}

export class FolderService {
  /**
   * List all folders with word counts, plus the ungrouped word count.
   * Soft-deleted folders and words are filtered out.
   */
  static listFolders(): FolderListResult {
    const db = getDatabase();

    const folders = db.prepare(`
      SELECT 
        f.id,
        f.sync_id,
        f.name,
        f.color,
        f.created_at,
        f.updated_at,
        f.deleted_at,
        COUNT(w.id) as wordCount
      FROM folders f
      LEFT JOIN word_folders wf ON f.id = wf.folder_id
      LEFT JOIN words w ON wf.word_id = w.id AND w.deleted_at IS NULL
      WHERE f.deleted_at IS NULL
      GROUP BY f.id
      ORDER BY f.created_at ASC
    `).all() as FolderRow[];

    const ungroupedRow = db.prepare(`
      SELECT COUNT(*) as count FROM words w
      WHERE w.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM word_folders wf
        JOIN folders f ON wf.folder_id = f.id
        WHERE wf.word_id = w.id AND f.deleted_at IS NULL
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
        f.sync_id,
        f.name,
        f.color,
        f.created_at,
        f.updated_at,
        f.deleted_at,
        COUNT(w.id) as wordCount
      FROM folders f
      LEFT JOIN word_folders wf ON f.id = wf.folder_id
      LEFT JOIN words w ON wf.word_id = w.id AND w.deleted_at IS NULL
      WHERE f.id = ? AND f.deleted_at IS NULL
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
    const sync_id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO folders (id, sync_id, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, sync_id, name.trim(), color, now, now);

    return this.getFolderById(id)!;
  }

  /**
   * Update a folder's name and/or color.
   */
  static updateFolder(id: string, data: { name?: string; color?: string }): FolderRow | null {
    const db = getDatabase();

    const existing = this.getFolderById(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    if (data.name !== undefined && data.color !== undefined) {
      db.prepare('UPDATE folders SET name = ?, color = ?, updated_at = ? WHERE id = ?')
        .run(data.name.trim(), data.color, now, id);
    } else if (data.name !== undefined) {
      db.prepare('UPDATE folders SET name = ?, updated_at = ? WHERE id = ?')
        .run(data.name.trim(), now, id);
    } else if (data.color !== undefined) {
      db.prepare('UPDATE folders SET color = ?, updated_at = ? WHERE id = ?')
        .run(data.color, now, id);
    }

    return this.getFolderById(id);
  }

  /**
   * Delete a folder (soft-delete). Words are NOT deleted — they become ungrouped.
   */
  static deleteFolder(id: string): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();
    let changes = 0;
    const tx = db.transaction(() => {
      const result = db.prepare(`UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`).run(now, now, id);
      changes = result.changes;
      if (changes > 0) {
        db.prepare('DELETE FROM word_folders WHERE folder_id = ?').run(id);
      }
    });
    tx();
    return changes > 0;
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
   * Get folder IDs for a given word, excluding soft-deleted folders.
   */
  static getWordFolderIds(wordId: string): string[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT wf.folder_id
      FROM word_folders wf
      JOIN folders f ON wf.folder_id = f.id
      WHERE wf.word_id = ? AND f.deleted_at IS NULL
    `).all(wordId) as { folder_id: string }[];
    return rows.map(r => r.folder_id);
  }

  /**
   * Batch-fetch folder IDs for a list of words (or all words if omitted) in a single query.
   * Excludes soft-deleted folders.
   */
  static getWordFolderIdsMap(wordIds?: string[]): Map<string, string[]> {
    const folderMap = new Map<string, string[]>();
    if (wordIds && wordIds.length === 0) {
      return folderMap;
    }

    const db = getDatabase();
    const allowedIds = wordIds ? new Set(wordIds) : null;
    const rows = db.prepare(`
      SELECT wf.word_id, wf.folder_id
      FROM word_folders wf
      JOIN folders f ON wf.folder_id = f.id
      WHERE f.deleted_at IS NULL
    `).all() as { word_id: string; folder_id: string }[];

    for (const row of rows) {
      if (allowedIds && !allowedIds.has(row.word_id)) continue;
      const existing = folderMap.get(row.word_id);
      if (existing) {
        existing.push(row.folder_id);
      } else {
        folderMap.set(row.word_id, [row.folder_id]);
      }
    }

    return folderMap;
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
