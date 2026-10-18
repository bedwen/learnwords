import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { createTestDatabase, getDatabase, closeDatabase } from '../server/db/connection';
import { WordService } from '../server/services/words';
import { FolderService } from '../server/services/folders';
import { StudyService } from '../server/services/study';
import fs from 'fs';
import path from 'path';

// Mock the DB connection to use in-memory DB for tests
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

describe('WordService', () => {
  beforeEach(() => {
    globalThis.__TEST_DB__ = new Database(':memory:');
    globalThis.__TEST_DB__.pragma('foreign_keys = ON');
    initializeSchema(globalThis.__TEST_DB__);
  });

  afterEach(() => {
    globalThis.__TEST_DB__.close();
  });

  it('should create a word and its learning state', () => {
    const word = WordService.createWord({
      word: 'test',
      meaning: 'meaning',
      level: 'B1'
    });

    expect(word).toBeDefined();
    expect(word.id).toBeTypeOf('string');
    expect(word.word).toBe('test');
    expect(word.level).toBe('B1');
    expect(word.learning_state).toBeDefined();
    expect(word.learning_state.mastery).toBe(0);
  });

  it('should fetch words with learning states', () => {
    WordService.createWord({ word: 'apple', meaning: 'apple', level: 'B1' });
    WordService.createWord({ word: 'banana', meaning: 'banana', level: 'B1' });

    const words = WordService.getWords();
    expect(words).toHaveLength(2);
    expect(words[0].learning_state).toBeDefined();
  });

  it('should update a word', () => {
    const word = WordService.createWord({ word: 'apple', meaning: 'apple', level: 'B1' });
    
    const updated = WordService.updateWord(word.id, { meaning: 'apple (updated)' });
    
    expect(updated).toBeDefined();
    expect(updated?.meaning).toBe('apple (updated)');
    expect(updated?.word).toBe('apple'); // unchanged
  });

  it('should soft-delete a word', () => {
    const word = WordService.createWord({ word: 'apple', meaning: 'apple', level: 'B1' });
    
    // Check it exists
    expect(WordService.getWordById(word.id)).toBeDefined();

    // Delete
    const result = WordService.deleteWord(word.id);
    expect(result).toBe(true);

    // Check it's gone from active queries
    expect(WordService.getWordById(word.id)).toBeNull();
    const stored = globalThis.__TEST_DB__.prepare('SELECT deleted_at FROM words WHERE id = ?').get(word.id) as any;
    expect(stored.deleted_at).not.toBeNull();
  });

  it('should filter words by search and level', () => {
    WordService.createWord({ word: 'apple', meaning: 'apple', level: 'B1' });
    WordService.createWord({ word: 'application', meaning: 'application', level: 'B2' });
    WordService.createWord({ word: 'banana', meaning: 'banana', level: 'B1' });
    WordService.createWord({ word: 'cat', meaning: 'cat', level: 'A1' });
    WordService.createWord({ word: 'dog', meaning: 'dog', level: 'A2' });

    // Search by word
    const search1 = WordService.getWords({ search: 'app' });
    expect(search1).toHaveLength(2);

    // Filter by level
    const levelB2 = WordService.getWords({ level: 'B2' });
    expect(levelB2).toHaveLength(1);
    expect(levelB2[0].word).toBe('application');

    const levelA1 = WordService.getWords({ level: 'A1' });
    expect(levelA1).toHaveLength(1);
    expect(levelA1[0].word).toBe('cat');

    // Both
    const both = WordService.getWords({ search: 'app', level: 'B1' });
    expect(both).toHaveLength(1);
    expect(both[0].word).toBe('apple');
  });

  it('should find words when search query matches only notes in getWords and getTrashWords', () => {
    const wordWithNotes = WordService.createWord({
      word: 'serendipity',
      meaning: 'pleasant surprise',
      level: 'B2',
      notes: 'Remember this mnemonic: finding gems by chance',
    });
    WordService.createWord({
      word: 'ephemeral',
      meaning: 'short-lived',
      level: 'C1',
      notes: 'Fleeting moments',
    });

    // 1. Search in active words matching only notes
    const results = WordService.getWords({ search: 'mnemonic' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(wordWithNotes.id);

    // 2. Soft-delete word and verify getTrashWords finds it by notes query
    WordService.deleteWord(wordWithNotes.id);
    const trashResults = WordService.getTrashWords({ search: 'mnemonic' });
    expect(trashResults).toHaveLength(1);
    expect(trashResults[0].id).toBe(wordWithNotes.id);

    // 3. Verify non-matching query returns empty
    const noResults = WordService.getTrashWords({ search: 'nonexistent-query' });
    expect(noResults).toHaveLength(0);
  });

  it('should populate accurate folderIds in getWords across all filter modes', () => {
    const folderA = FolderService.createFolder('Folder A', '#3b82f6');
    const folderB = FolderService.createFolder('Folder B', '#10b981');

    const wMulti = WordService.createWord({
      word: 'eloquent',
      meaning: 'fluent or persuasive',
      level: 'C1',
      folderIds: [folderA.id, folderB.id],
    });
    const wSingle = WordService.createWord({
      word: 'pragmatic',
      meaning: 'practical',
      level: 'B2',
      folderIds: [folderA.id],
    });
    const wUngrouped = WordService.createWord({
      word: 'candid',
      meaning: 'truthful and straightforward',
      level: 'B2',
    });

    // 1. All words query
    const allWords = WordService.getWords();
    const multiFromAll = allWords.find((w) => w.id === wMulti.id);
    const singleFromAll = allWords.find((w) => w.id === wSingle.id);
    const ungroupedFromAll = allWords.find((w) => w.id === wUngrouped.id);

    expect(multiFromAll?.folderIds).toEqual(expect.arrayContaining([folderA.id, folderB.id]));
    expect(multiFromAll?.folderIds).toHaveLength(2);
    expect(singleFromAll?.folderIds).toEqual([folderA.id]);
    expect(ungroupedFromAll?.folderIds).toEqual([]);

    // 2. Filtered by folderA — wMulti must still include BOTH folderA and folderB in folderIds
    const inFolderA = WordService.getWords({ folderId: folderA.id });
    expect(inFolderA).toHaveLength(2);
    const multiFromFolderA = inFolderA.find((w) => w.id === wMulti.id);
    expect(multiFromFolderA?.folderIds).toEqual(expect.arrayContaining([folderA.id, folderB.id]));
    expect(multiFromFolderA?.folderIds).toHaveLength(2);

    // 3. Filtered by ungrouped
    const ungroupedWords = WordService.getWords({ folderId: 'ungrouped' });
    expect(ungroupedWords).toHaveLength(1);
    expect(ungroupedWords[0].id).toBe(wUngrouped.id);
    expect(ungroupedWords[0].folderIds).toEqual([]);
  });

  it('should preserve folder memberships when editing a word loaded from getWords (Desktop edit flow)', () => {
    const folder1 = FolderService.createFolder('Academic', '#3b82f6');
    const folder2 = FolderService.createFolder('Business', '#10b981');
    const folder3 = FolderService.createFolder('Daily', '#f59e0b');

    const created = WordService.createWord({
      word: 'substantiate',
      meaning: 'provide evidence to support',
      level: 'C1',
      folderIds: [folder1.id, folder2.id],
    });

    // Simulate Words.tsx fetching words in folder1 via getWords and passing the item to WordForm
    const wordsInFolder1 = WordService.getWords({ folderId: folder1.id });
    const editingWord = wordsInFolder1.find((w) => w.id === created.id)!;
    expect(editingWord).toBeDefined();
    expect(editingWord.folderIds).toEqual(expect.arrayContaining([folder1.id, folder2.id]));

    // Simulate WordForm initializing selectedFolderIds from initialData.folderIds and saving an updated meaning
    const initialSelectedFolderIds = editingWord.folderIds || [];
    const updated = WordService.updateWord(editingWord.id, {
      word: editingWord.word,
      meaning: 'provide evidence to support or prove the truth of',
      level: editingWord.level,
      folderIds: initialSelectedFolderIds,
    });

    expect(updated?.meaning).toBe('provide evidence to support or prove the truth of');
    expect(updated?.folderIds).toEqual(expect.arrayContaining([folder1.id, folder2.id]));
    expect(updated?.folderIds).toHaveLength(2);

    // Now simulate user toggling folder2 off and folder3 on in WordForm
    const modifiedFolderIds = initialSelectedFolderIds
      .filter((id) => id !== folder2.id)
      .concat(folder3.id);
    const updatedFolders = WordService.updateWord(editingWord.id, {
      folderIds: modifiedFolderIds,
    });

    expect(updatedFolders?.folderIds).toEqual(expect.arrayContaining([folder1.id, folder3.id]));
    expect(updatedFolders?.folderIds).not.toContain(folder2.id);
  });

  it('should exclude soft-deleted folders when resolving folderIds and ungrouped filtering', () => {
    const activeFolder = FolderService.createFolder('Active Folder', '#3b82f6');
    const deletedFolder = FolderService.createFolder('Deleted Folder', '#ef4444');

    const wordBoth = WordService.createWord({
      word: 'resilient',
      meaning: 'able to recover',
      level: 'B2',
      folderIds: [activeFolder.id, deletedFolder.id],
    });
    const wordOnlyDeleted = WordService.createWord({
      word: 'orphan',
      meaning: 'only in soft-deleted folder',
      level: 'B1',
      folderIds: [deletedFolder.id],
    });

    // Simulate a soft-deleted folder where word_folders junction rows remain (e.g. from sync)
    globalThis.__TEST_DB__
      .prepare(`UPDATE folders SET deleted_at = datetime('now') WHERE id = ?`)
      .run(deletedFolder.id);

    expect(FolderService.getWordFolderIds(wordBoth.id)).toEqual([activeFolder.id]);
    expect(FolderService.getWordFolderIds(wordOnlyDeleted.id)).toEqual([]);

    const allWords = WordService.getWords();
    expect(allWords.find((w) => w.id === wordBoth.id)?.folderIds).toEqual([activeFolder.id]);
    expect(allWords.find((w) => w.id === wordOnlyDeleted.id)?.folderIds).toEqual([]);

    // wordOnlyDeleted should now appear in ungrouped words and ungrouped study queue
    const ungroupedWords = WordService.getWords({ folderId: 'ungrouped' });
    expect(ungroupedWords.map((w) => w.id)).toEqual([wordOnlyDeleted.id]);

    const ungroupedQueue = StudyService.getStudyQueue(50, 'ungrouped');
    expect(ungroupedQueue.map((w) => w.id)).toEqual([wordOnlyDeleted.id]);

    // Querying the soft-deleted folder directly should return no words
    expect(WordService.getWords({ folderId: deletedFolder.id })).toEqual([]);
    expect(StudyService.getStudyQueue(50, deletedFolder.id)).toEqual([]);
  });
});
