import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { exportAllData, importAllData, ExportData, exportWordsCsv, importWordsCsv } from '../server/services/data';
import Papa from 'papaparse';

describe('Data Export/Import Service', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should export and import data accurately (round-trip)', () => {
    // 1. Create some initial data
    db.prepare(`INSERT INTO words (id, word, meaning, level) VALUES ('w1', 'hello', 'hola', 'A1')`).run();
    db.prepare(`INSERT INTO learning_states (id, word_id, mastery) VALUES ('ls1', 'w1', 1)`).run();
    db.prepare(`INSERT INTO folders (id, name) VALUES ('f1', 'Spanish')`).run();
    db.prepare(`INSERT INTO word_folders (word_id, folder_id) VALUES ('w1', 'f1')`).run();

    // 2. Export data
    const exportedData = exportAllData(db);
    expect(exportedData.wordCount).toBe(1);
    expect(exportedData.data.words.length).toBe(1);
    expect(exportedData.data.learning_states.length).toBe(1);
    expect(exportedData.data.folders.length).toBe(1);
    expect(exportedData.data.word_folders.length).toBe(1);
    expect(exportedData.data.review_history.length).toBe(0);

    // 3. Clear database completely to simulate a clean or altered state
    db.prepare('DELETE FROM word_folders').run();
    db.prepare('DELETE FROM folders').run();
    db.prepare('DELETE FROM learning_states').run();
    db.prepare('DELETE FROM words').run();

    // 4. Import data
    importAllData(db, exportedData);

    // 5. Verify data is restored
    const restoredWords = db.prepare('SELECT * FROM words').all() as any[];
    expect(restoredWords.length).toBe(1);
    expect(restoredWords[0].word).toBe('hello');

    const restoredFolders = db.prepare('SELECT * FROM folders').all() as any[];
    expect(restoredFolders.length).toBe(1);
    expect(restoredFolders[0].name).toBe('Spanish');

    const restoredWordFolders = db.prepare('SELECT * FROM word_folders').all() as any[];
    expect(restoredWordFolders.length).toBe(1);
  });

  it('should fail validation with invalid schema version', () => {
    const invalidData: ExportData = {
      schemaVersion: 2, // invalid
      exportedAt: new Date().toISOString(),
      wordCount: 0,
      data: {
        words: [],
        learning_states: [],
        review_history: [],
        folders: [],
        word_folders: []
      }
    };
    expect(() => importAllData(db, invalidData)).toThrowError('Unsupported schema version');
  });

  it('should fail validation with missing tables', () => {
    const invalidData = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      wordCount: 0,
      data: {
        words: [],
        learning_states: [],
        // review_history missing
        folders: [],
        word_folders: []
      }
    } as any;
    expect(() => importAllData(db, invalidData)).toThrowError('Missing or invalid tables in data payload');
  });

  it('should correctly export an empty database', () => {
    const exportedData = exportAllData(db);
    expect(exportedData.schemaVersion).toBe(1);
    expect(exportedData.wordCount).toBe(0);
    expect(exportedData.data.words).toEqual([]);
    expect(exportedData.data.folders).toEqual([]);
    expect(exportedData.data.learning_states).toEqual([]);
  });

  it('should preserve sync_id and deleted_at on words, folders, and review_history during full backup and restore', () => {
    // 1. Create initial data with explicit sync_id and deleted_at
    const wordSyncId = '11111111-1111-4111-8111-111111111111';
    const deletedWordSyncId = '22222222-2222-4222-8222-222222222222';
    const folderSyncId = '33333333-3333-4333-8333-333333333333';
    const deletedFolderSyncId = '44444444-4444-4444-8444-444444444444';
    const reviewSyncId = '55555555-5555-4555-8555-555555555555';
    const deletedTimestamp = '2026-10-18T10:00:00.000Z';

    db.prepare(`
      INSERT INTO words (id, sync_id, word, meaning, level, created_at, updated_at, deleted_at)
      VALUES ('w1', ?, 'active word', 'meaning 1', 'A1', '2026-10-18T08:00:00.000Z', '2026-10-18T08:00:00.000Z', NULL)
    `).run(wordSyncId);

    db.prepare(`
      INSERT INTO words (id, sync_id, word, meaning, level, created_at, updated_at, deleted_at)
      VALUES ('w2', ?, 'trashed word', 'meaning 2', 'B1', '2026-10-18T08:00:00.000Z', '2026-10-18T10:00:00.000Z', ?)
    `).run(deletedWordSyncId, deletedTimestamp);

    db.prepare(`
      INSERT INTO folders (id, sync_id, name, color, created_at, updated_at, deleted_at)
      VALUES ('f1', ?, 'Active Folder', '#3b82f6', '2026-10-18T08:00:00.000Z', '2026-10-18T08:00:00.000Z', NULL)
    `).run(folderSyncId);

    db.prepare(`
      INSERT INTO folders (id, sync_id, name, color, created_at, updated_at, deleted_at)
      VALUES ('f2', ?, 'Trashed Folder', '#ef4444', '2026-10-18T08:00:00.000Z', '2026-10-18T10:00:00.000Z', ?)
    `).run(deletedFolderSyncId, deletedTimestamp);

    db.prepare(`
      INSERT INTO review_history (id, sync_id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at)
      VALUES ('rh1', ?, 'w1', 'good', 0, 1, 0, 1, '2026-10-18T09:00:00.000Z')
    `).run(reviewSyncId);

    db.prepare(`INSERT INTO learning_states (id, word_id, mastery) VALUES ('ls1', 'w1', 1)`).run();
    db.prepare(`INSERT INTO word_folders (word_id, folder_id) VALUES ('w1', 'f1')`).run();

    // 2. Export data
    const backup = exportAllData(db);
    expect(backup.wordCount).toBe(2);

    // 3. Import data into a completely fresh database
    const freshDb = new Database(':memory:');
    freshDb.pragma('foreign_keys = ON');
    initializeSchema(freshDb);

    importAllData(freshDb, backup);

    // 4. Verify words preservation
    const restoredWords = freshDb.prepare('SELECT id, sync_id, word, deleted_at FROM words ORDER BY id ASC').all() as any[];
    expect(restoredWords).toHaveLength(2);
    expect(restoredWords[0]).toEqual({
      id: 'w1',
      sync_id: wordSyncId,
      word: 'active word',
      deleted_at: null,
    });
    expect(restoredWords[1]).toEqual({
      id: 'w2',
      sync_id: deletedWordSyncId,
      word: 'trashed word',
      deleted_at: deletedTimestamp,
    });

    // 5. Verify folders preservation
    const restoredFolders = freshDb.prepare('SELECT id, sync_id, name, deleted_at FROM folders ORDER BY id ASC').all() as any[];
    expect(restoredFolders).toHaveLength(2);
    expect(restoredFolders[0]).toEqual({
      id: 'f1',
      sync_id: folderSyncId,
      name: 'Active Folder',
      deleted_at: null,
    });
    expect(restoredFolders[1]).toEqual({
      id: 'f2',
      sync_id: deletedFolderSyncId,
      name: 'Trashed Folder',
      deleted_at: deletedTimestamp,
    });

    // 6. Verify review_history preservation
    const restoredReviews = freshDb.prepare('SELECT id, sync_id, word_id, rating FROM review_history').all() as any[];
    expect(restoredReviews).toHaveLength(1);
    expect(restoredReviews[0]).toEqual({
      id: 'rh1',
      sync_id: reviewSyncId,
      word_id: 'w1',
      rating: 'good',
    });

    freshDb.close();
  });
});

describe('CSV Word Export Service', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);

    // Insert 3 words
    db.prepare(`INSERT INTO words (id, word, meaning, level) VALUES ('w1', 'apple', 'a fruit', 'A1')`).run();
    db.prepare(`INSERT INTO words (id, word, meaning, level) VALUES ('w2', 'banana', 'another fruit', 'A1')`).run();
    db.prepare(`INSERT INTO words (id, word, meaning, level) VALUES ('w3', 'cherry', 'a small fruit', 'A2')`).run();

    // Create a folder and assign 2 words to it
    db.prepare(`INSERT INTO folders (id, name) VALUES ('f1', 'Fruits')`).run();
    db.prepare(`INSERT INTO word_folders (word_id, folder_id) VALUES ('w1', 'f1')`).run();
    db.prepare(`INSERT INTO word_folders (word_id, folder_id) VALUES ('w2', 'f1')`).run();
    // w3 is ungrouped
  });

  afterEach(() => {
    db.close();
  });

  it('should export all words without filter', () => {
    const csvStr = exportWordsCsv(db);
    const parsed = Papa.parse(csvStr, { header: true });
    expect(parsed.data.length).toBe(3);
    
    // Sort order check (word ASC)
    expect((parsed.data[0] as any).word).toBe('apple');
    expect((parsed.data[1] as any).word).toBe('banana');
    expect((parsed.data[2] as any).word).toBe('cherry');
    
    // Check columns are exactly as expected
    const headers = parsed.meta.fields;
    expect(headers).toEqual(['word', 'meaning', 'level', 'part_of_speech', 'example_sentence', 'example_translation', 'notes']);
  });

  it('should export words by folder', () => {
    const csvStr = exportWordsCsv(db, 'f1');
    const parsed = Papa.parse(csvStr, { header: true });
    expect(parsed.data.length).toBe(2);
    expect((parsed.data[0] as any).word).toBe('apple');
    expect((parsed.data[1] as any).word).toBe('banana');
  });

  it('should export ungrouped words', () => {
    const csvStr = exportWordsCsv(db, 'ungrouped');
    const parsed = Papa.parse(csvStr, { header: true });
    expect(parsed.data.length).toBe(1);
    expect((parsed.data[0] as any).word).toBe('cherry');
  });

  it('should export empty result as empty string', () => {
    const csvStr = exportWordsCsv(db, 'non-existent-folder');
    expect(csvStr).toBe('');
  });

  it('should support round-trip compatibility with CSV import', () => {
    const csvStr = exportWordsCsv(db);
    
    // Create a new clean DB
    const newDb = new Database(':memory:');
    newDb.pragma('foreign_keys = ON');
    initializeSchema(newDb);
    
    const result = importWordsCsv(newDb, csvStr);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors.length).toBe(0);
    
    const importedWords = newDb.prepare('SELECT word FROM words ORDER BY word ASC').all() as any[];
    expect(importedWords.length).toBe(3);
    expect(importedWords[0].word).toBe('apple');
    expect(importedWords[1].word).toBe('banana');
    expect(importedWords[2].word).toBe('cherry');
    
    newDb.close();
  });

  it('should not export soft-deleted words across all filter branches', () => {
    // Soft-delete one of the folder words (apple)
    db.prepare(`UPDATE words SET deleted_at = '2026-10-18T10:00:00.000Z' WHERE id = 'w1'`).run();
    // Add another soft-deleted ungrouped word
    db.prepare(`INSERT INTO words (id, word, meaning, level, deleted_at) VALUES ('w4', 'durian', 'a smelly fruit', 'B2', '2026-10-18T10:00:00.000Z')`).run();

    // 1. Export all words: should only export active words (banana, cherry)
    const allCsv = exportWordsCsv(db);
    const allParsed = Papa.parse(allCsv, { header: true });
    expect(allParsed.data.length).toBe(2);
    expect((allParsed.data[0] as any).word).toBe('banana');
    expect((allParsed.data[1] as any).word).toBe('cherry');

    // 2. Export by folder 'f1': apple is soft-deleted, so only banana should be exported
    const folderCsv = exportWordsCsv(db, 'f1');
    const folderParsed = Papa.parse(folderCsv, { header: true });
    expect(folderParsed.data.length).toBe(1);
    expect((folderParsed.data[0] as any).word).toBe('banana');

    // 3. Export ungrouped: durian is soft-deleted, so only cherry should be exported
    const ungroupedCsv = exportWordsCsv(db, 'ungrouped');
    const ungroupedParsed = Papa.parse(ungroupedCsv, { header: true });
    expect(ungroupedParsed.data.length).toBe(1);
    expect((ungroupedParsed.data[0] as any).word).toBe('cherry');
  });
});

describe('CSV Word Import Service', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should allow importing a word when an identically named word exists in the trash bin and assign valid sync_id', () => {
    const trashSyncId = '11111111-2222-3333-4444-555555555555';
    // Word in trash bin (deleted_at is NOT NULL)
    db.prepare(`
      INSERT INTO words (id, sync_id, word, meaning, level, created_at, updated_at, deleted_at)
      VALUES ('w-trash', ?, 'apple', 'old apple meaning', 'A1', '2026-10-18T08:00:00.000Z', '2026-10-18T09:00:00.000Z', '2026-10-18T09:00:00.000Z')
    `).run(trashSyncId);

    // Active word (deleted_at IS NULL)
    db.prepare(`
      INSERT INTO words (id, sync_id, word, meaning, level, created_at, updated_at, deleted_at)
      VALUES ('w-active', 'active-sync-id', 'banana', 'yellow fruit', 'A1', '2026-10-18T08:00:00.000Z', '2026-10-18T08:00:00.000Z', NULL)
    `).run();

    const csvContent = [
      'word,meaning,level',
      'apple,a round fruit,A2',
      'banana,existing active banana,A1',
      'cherry,a small red fruit,B1',
    ].join('\n');

    const result = importWordsCsv(db, csvContent);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([]);

    // Verify database contents
    const words = db.prepare('SELECT id, sync_id, word, meaning, level, deleted_at FROM words WHERE word = ? COLLATE NOCASE').all('apple') as any[];
    expect(words).toHaveLength(2);

    const trashedWord = words.find((w) => w.deleted_at !== null);
    expect(trashedWord).toBeDefined();
    expect(trashedWord.id).toBe('w-trash');
    expect(trashedWord.sync_id).toBe(trashSyncId);
    expect(trashedWord.meaning).toBe('old apple meaning');

    const importedWord = words.find((w) => w.deleted_at === null);
    expect(importedWord).toBeDefined();
    expect(importedWord.meaning).toBe('a round fruit');
    expect(importedWord.level).toBe('A2');
    expect(importedWord.sync_id).toBeTruthy();
    expect(importedWord.sync_id).not.toBe(trashSyncId);
    expect(importedWord.sync_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const importedCherry = db.prepare('SELECT sync_id FROM words WHERE word = ? AND deleted_at IS NULL').get('cherry') as any;
    expect(importedCherry.sync_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
