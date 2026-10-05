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
});
