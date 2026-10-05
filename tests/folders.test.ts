import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { FolderService } from '../server/services/folders';
import { WordService } from '../server/services/words';
import { StudyService } from '../server/services/study';

// Mock DB connection to use in-memory SQLite database
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

describe('FolderService', () => {
  beforeEach(() => {
    globalThis.__TEST_DB__ = new Database(':memory:');
    globalThis.__TEST_DB__.pragma('foreign_keys = ON');
    initializeSchema(globalThis.__TEST_DB__);
  });

  afterEach(() => {
    globalThis.__TEST_DB__.close();
  });

  describe('Folder CRUD Operations', () => {
    it('should create a folder with valid name, color, timestamps, and 0 wordCount', () => {
      const folder = FolderService.createFolder('Travel & Tourism', '#3b82f6');

      expect(folder).toBeDefined();
      expect(folder.id).toBeTypeOf('string');
      expect(folder.id.length).toBeGreaterThan(0);
      expect(folder.name).toBe('Travel & Tourism');
      expect(folder.color).toBe('#3b82f6');
      expect(folder.wordCount).toBe(0);
      expect(folder.created_at).toBeDefined();
      expect(folder.updated_at).toBeDefined();
      expect(new Date(folder.created_at).getTime()).not.toBeNaN();
      expect(new Date(folder.updated_at).getTime()).not.toBeNaN();
    });

    it('should trim whitespace from folder name upon creation', () => {
      const folder = FolderService.createFolder('   Academic English   ', '#10b981');
      expect(folder.name).toBe('Academic English');
    });

    it('should retrieve an existing folder by ID with accurate wordCount', () => {
      const created = FolderService.createFolder('Business', '#f59e0b');

      const fetched = FolderService.getFolderById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe('Business');
      expect(fetched?.color).toBe('#f59e0b');
      expect(fetched?.wordCount).toBe(0);
    });

    it('should return null when retrieving a non-existent folder ID', () => {
      const nonExistent = FolderService.getFolderById('non-existent-id');
      expect(nonExistent).toBeNull();
    });

    it('should update folder name and update updated_at timestamp', () => {
      const folder = FolderService.createFolder('Initial Name', '#ef4444');
      const initialUpdatedAt = folder.updated_at;

      const updated = FolderService.updateFolder(folder.id, { name: 'Updated Name' });
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.color).toBe('#ef4444'); // Unchanged
      expect(new Date(updated!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(initialUpdatedAt).getTime());
    });

    it('should trim whitespace when updating folder name', () => {
      const folder = FolderService.createFolder('Name', '#ef4444');
      const updated = FolderService.updateFolder(folder.id, { name: '   Trimmed Name   ' });
      expect(updated?.name).toBe('Trimmed Name');
    });

    it('should update folder color without altering folder name', () => {
      const folder = FolderService.createFolder('Color Test', '#ef4444');

      const updated = FolderService.updateFolder(folder.id, { color: '#8b5cf6' });
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Color Test');
      expect(updated?.color).toBe('#8b5cf6');
    });

    it('should update both name and color simultaneously', () => {
      const folder = FolderService.createFolder('Both Test', '#ef4444');

      const updated = FolderService.updateFolder(folder.id, {
        name: 'Both Updated',
        color: '#06b6d4'
      });
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Both Updated');
      expect(updated?.color).toBe('#06b6d4');
    });

    it('should return null when updating a non-existent folder', () => {
      const result = FolderService.updateFolder('missing-folder-id', { name: 'Any Name' });
      expect(result).toBeNull();
    });

    it('should return the existing folder unchanged when update payload has no changes', () => {
      const folder = FolderService.createFolder('No Changes', '#64748b');
      const updated = FolderService.updateFolder(folder.id, {});
      expect(updated?.name).toBe('No Changes');
      expect(updated?.color).toBe('#64748b');
    });

    it('should delete an existing folder and return true', () => {
      const folder = FolderService.createFolder('To Delete', '#64748b');

      const deleted = FolderService.deleteFolder(folder.id);
      expect(deleted).toBe(true);
      expect(FolderService.getFolderById(folder.id)).toBeNull();
    });

    it('should return false when deleting a non-existent folder', () => {
      const deleted = FolderService.deleteFolder('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('Word-Folder Associations & Count Calculations', () => {
    it('should link a word to one or multiple folders via setWordFolders', () => {
      const folder1 = FolderService.createFolder('Grammar', '#3b82f6');
      const folder2 = FolderService.createFolder('Vocabulary', '#10b981');
      const word = WordService.createWord({ word: 'meticulous', meaning: 'very careful and precise', level: 'C1' });

      // Link to folder1
      FolderService.setWordFolders(word.id, [folder1.id]);
      expect(FolderService.getWordFolderIds(word.id)).toEqual([folder1.id]);

      // Link to both folder1 and folder2
      FolderService.setWordFolders(word.id, [folder1.id, folder2.id]);
      const folderIds = FolderService.getWordFolderIds(word.id);
      expect(folderIds).toHaveLength(2);
      expect(folderIds).toContain(folder1.id);
      expect(folderIds).toContain(folder2.id);
    });

    it('should replace previous associations when setWordFolders is called again', () => {
      const folder1 = FolderService.createFolder('Folder 1', '#3b82f6');
      const folder2 = FolderService.createFolder('Folder 2', '#10b981');
      const folder3 = FolderService.createFolder('Folder 3', '#f59e0b');
      const word = WordService.createWord({ word: 'serendipity', meaning: 'fortunate chance', level: 'C2' });

      FolderService.setWordFolders(word.id, [folder1.id, folder2.id]);
      expect(FolderService.getWordFolderIds(word.id)).toEqual(expect.arrayContaining([folder1.id, folder2.id]));

      // Replace with folder3 only
      FolderService.setWordFolders(word.id, [folder3.id]);
      expect(FolderService.getWordFolderIds(word.id)).toEqual([folder3.id]);

      // Clear all associations
      FolderService.setWordFolders(word.id, []);
      expect(FolderService.getWordFolderIds(word.id)).toEqual([]);
    });

    it('should return an empty array from getWordFolderIds when word has no folders', () => {
      const word = WordService.createWord({ word: 'solitary', meaning: 'alone', level: 'B2' });
      expect(FolderService.getWordFolderIds(word.id)).toEqual([]);
    });

    it('should remove a single word-folder link and decrement wordCount', () => {
      const folder1 = FolderService.createFolder('Folder A', '#3b82f6');
      const folder2 = FolderService.createFolder('Folder B', '#10b981');
      const word = WordService.createWord({ word: 'tenacious', meaning: 'persistent', level: 'C1' });

      FolderService.setWordFolders(word.id, [folder1.id, folder2.id]);
      expect(FolderService.getFolderById(folder1.id)?.wordCount).toBe(1);
      expect(FolderService.getFolderById(folder2.id)?.wordCount).toBe(1);

      // Remove from folder1
      const removed = FolderService.removeWordFromFolder(word.id, folder1.id);
      expect(removed).toBe(true);

      expect(FolderService.getWordFolderIds(word.id)).toEqual([folder2.id]);
      expect(FolderService.getFolderById(folder1.id)?.wordCount).toBe(0);
      expect(FolderService.getFolderById(folder2.id)?.wordCount).toBe(1);
    });

    it('should return false when removing an association that does not exist', () => {
      const folder = FolderService.createFolder('Empty Folder', '#3b82f6');
      const word = WordService.createWord({ word: 'isolated', meaning: 'separated', level: 'B1' });

      const result = FolderService.removeWordFromFolder(word.id, folder.id);
      expect(result).toBe(false);
    });

    it('should list all folders with accurate word counts and ungroupedCount', () => {
      const folder1 = FolderService.createFolder('Folder 1', '#3b82f6');
      const folder2 = FolderService.createFolder('Folder 2', '#10b981');

      // Word 1: in folder 1
      const word1 = WordService.createWord({ word: 'word1', meaning: 'm1', level: 'A1' });
      FolderService.setWordFolders(word1.id, [folder1.id]);

      // Word 2: in folder 1 and folder 2
      const word2 = WordService.createWord({ word: 'word2', meaning: 'm2', level: 'A2' });
      FolderService.setWordFolders(word2.id, [folder1.id, folder2.id]);

      // Word 3: in folder 2
      const word3 = WordService.createWord({ word: 'word3', meaning: 'm3', level: 'B1' });
      FolderService.setWordFolders(word3.id, [folder2.id]);

      // Word 4 and 5: ungrouped (no folder links)
      WordService.createWord({ word: 'word4', meaning: 'm4', level: 'B2' });
      WordService.createWord({ word: 'word5', meaning: 'm5', level: 'C1' });

      const result = FolderService.listFolders();
      expect(result.folders).toHaveLength(2);

      const f1 = result.folders.find(f => f.id === folder1.id);
      const f2 = result.folders.find(f => f.id === folder2.id);

      expect(f1?.wordCount).toBe(2); // word1, word2
      expect(f2?.wordCount).toBe(2); // word2, word3
      expect(result.ungroupedCount).toBe(2); // word4, word5
    });

    it('should update ungroupedCount when words gain or lose folder associations', () => {
      const folder = FolderService.createFolder('Target Folder', '#3b82f6');
      const word = WordService.createWord({ word: 'dynamic', meaning: 'changing', level: 'B2' });

      expect(FolderService.listFolders().ungroupedCount).toBe(1);

      // Associate word with folder -> ungroupedCount drops to 0
      FolderService.setWordFolders(word.id, [folder.id]);
      expect(FolderService.listFolders().ungroupedCount).toBe(0);

      // Remove word association -> ungroupedCount returns to 1
      FolderService.setWordFolders(word.id, []);
      expect(FolderService.listFolders().ungroupedCount).toBe(1);
    });
  });

  describe('Cascade & Isolation Invariants', () => {
    it('should cascade-delete word_folders when a folder is deleted, leaving words intact as ungrouped', () => {
      const folder = FolderService.createFolder('Temporary Folder', '#ef4444');
      const word = WordService.createWord({ word: 'resilient', meaning: 'able to recover quickly', level: 'B2' });

      FolderService.setWordFolders(word.id, [folder.id]);

      // Verify link exists in junction table
      const linkCountBefore = (globalThis.__TEST_DB__.prepare(
        'SELECT COUNT(*) as count FROM word_folders WHERE folder_id = ?'
      ).get(folder.id) as { count: number }).count;
      expect(linkCountBefore).toBe(1);

      // Delete folder
      FolderService.deleteFolder(folder.id);

      // Verify link in word_folders is deleted via cascade
      const linkCountAfter = (globalThis.__TEST_DB__.prepare(
        'SELECT COUNT(*) as count FROM word_folders WHERE folder_id = ?'
      ).get(folder.id) as { count: number }).count;
      expect(linkCountAfter).toBe(0);

      // Word itself must still exist in words table
      const wordRecord = WordService.getWordById(word.id);
      expect(wordRecord).not.toBeNull();
      expect(wordRecord?.word).toBe('resilient');
      expect(wordRecord?.folderIds).toEqual([]);

      // Word should now be counted in ungroupedCount
      const list = FolderService.listFolders();
      expect(list.ungroupedCount).toBe(1);
    });

    it('should preserve other folder associations when one folder is deleted', () => {
      const folderA = FolderService.createFolder('Folder A', '#3b82f6');
      const folderB = FolderService.createFolder('Folder B', '#10b981');
      const word = WordService.createWord({ word: 'dual', meaning: 'having two parts', level: 'B1' });

      FolderService.setWordFolders(word.id, [folderA.id, folderB.id]);

      // Delete only folderA
      FolderService.deleteFolder(folderA.id);

      // Word should still belong to folderB
      const remainingFolderIds = FolderService.getWordFolderIds(word.id);
      expect(remainingFolderIds).toEqual([folderB.id]);
      expect(FolderService.getFolderById(folderB.id)?.wordCount).toBe(1);

      // Word is not ungrouped because it still belongs to folderB
      expect(FolderService.listFolders().ungroupedCount).toBe(0);
    });

    it('should cascade-delete word_folders when a word is deleted via WordService', () => {
      const folder = FolderService.createFolder('Academic', '#8b5cf6');
      const word = WordService.createWord({
        word: 'ephemeral',
        meaning: 'lasting a very short time',
        level: 'C2',
        folderIds: [folder.id]
      });

      expect(FolderService.getFolderById(folder.id)?.wordCount).toBe(1);

      // Delete the word
      const deleted = WordService.deleteWord(word.id);
      expect(deleted).toBe(true);

      // Junction records should be removed
      const junctionCount = (globalThis.__TEST_DB__.prepare(
        'SELECT COUNT(*) as count FROM word_folders WHERE word_id = ?'
      ).get(word.id) as { count: number }).count;
      expect(junctionCount).toBe(0);

      // Folder still exists but wordCount is now 0
      const updatedFolder = FolderService.getFolderById(folder.id);
      expect(updatedFolder).not.toBeNull();
      expect(updatedFolder?.wordCount).toBe(0);
    });
  });

  describe('Folder-Scoped Study Queue Filtering', () => {
    it('should return only words belonging to the specified folder in StudyService.getStudyQueue', () => {
      const folderA = FolderService.createFolder('Medical', '#ef4444');
      const folderB = FolderService.createFolder('Legal', '#3b82f6');

      const wordA = WordService.createWord({ word: 'diagnosis', meaning: 'identification of illness', level: 'B2', folderIds: [folderA.id] });
      const wordB = WordService.createWord({ word: 'affidavit', meaning: 'sworn statement', level: 'C1', folderIds: [folderB.id] });
      const wordBoth = WordService.createWord({ word: 'negligence', meaning: 'failure to take care', level: 'C1', folderIds: [folderA.id, folderB.id] });
      WordService.createWord({ word: 'general', meaning: 'widespread', level: 'A2' }); // ungrouped

      // Queue for Folder A
      const queueA = StudyService.getStudyQueue(50, folderA.id);
      const idsA = queueA.map(w => w.id);
      expect(idsA).toHaveLength(2);
      expect(idsA).toContain(wordA.id);
      expect(idsA).toContain(wordBoth.id);
      expect(idsA).not.toContain(wordB.id);

      // Queue for Folder B
      const queueB = StudyService.getStudyQueue(50, folderB.id);
      const idsB = queueB.map(w => w.id);
      expect(idsB).toHaveLength(2);
      expect(idsB).toContain(wordB.id);
      expect(idsB).toContain(wordBoth.id);
      expect(idsB).not.toContain(wordA.id);
    });

    it('should return all due words across all folders when folderId is undefined', () => {
      const folder = FolderService.createFolder('Science', '#10b981');

      const word1 = WordService.createWord({ word: 'hypothesis', meaning: 'testable prediction', level: 'B2', folderIds: [folder.id] });
      const word2 = WordService.createWord({ word: 'ordinary', meaning: 'normal', level: 'A2' }); // ungrouped

      const allQueue = StudyService.getStudyQueue(50);
      expect(allQueue).toHaveLength(2);
      const allIds = allQueue.map(w => w.id);
      expect(allIds).toContain(word1.id);
      expect(allIds).toContain(word2.id);
    });

    it('should return only ungrouped words when folderId is "ungrouped"', () => {
      const folder = FolderService.createFolder('Technology', '#6366f1');

      const groupedWord = WordService.createWord({ word: 'algorithm', meaning: 'set of rules', level: 'B2', folderIds: [folder.id] });
      const ungroupedWord = WordService.createWord({ word: 'commonplace', meaning: 'ordinary', level: 'B1' });

      const ungroupedQueue = StudyService.getStudyQueue(50, 'ungrouped');
      expect(ungroupedQueue).toHaveLength(1);
      expect(ungroupedQueue[0].id).toBe(ungroupedWord.id);
    });

    it('should respect the limit parameter when querying a folder queue', () => {
      const folder = FolderService.createFolder('Extensive', '#06b6d4');

      WordService.createWord({ word: 'item1', meaning: 'def1', level: 'B1', folderIds: [folder.id] });
      WordService.createWord({ word: 'item2', meaning: 'def2', level: 'B1', folderIds: [folder.id] });
      WordService.createWord({ word: 'item3', meaning: 'def3', level: 'B1', folderIds: [folder.id] });

      const limitedQueue = StudyService.getStudyQueue(2, folder.id);
      expect(limitedQueue).toHaveLength(2);
    });

    it('should exclude words in the folder that are not yet due for review', () => {
      const folder = FolderService.createFolder('Review Timing', '#f97316');

      const dueWord = WordService.createWord({ word: 'dueWord', meaning: 'due', level: 'B1', folderIds: [folder.id] });
      const futureWord = WordService.createWord({ word: 'futureWord', meaning: 'future', level: 'B1', folderIds: [folder.id] });

      // Simulate futureWord having mastery > 0 and next_review in the future
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days ahead
      globalThis.__TEST_DB__.prepare(`
        UPDATE learning_states
        SET mastery = 2, next_review = ?
        WHERE word_id = ?
      `).run(futureDate, futureWord.id);

      const queue = StudyService.getStudyQueue(50, folder.id);
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe(dueWord.id);
    });
  });
});
