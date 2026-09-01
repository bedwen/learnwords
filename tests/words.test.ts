import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { createTestDatabase, getDatabase, closeDatabase } from '../server/db/connection';
import { WordService } from '../server/services/words';
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

  it('should delete a word and cascade its learning state', () => {
    const word = WordService.createWord({ word: 'apple', meaning: 'apple', level: 'B1' });
    
    // Check it exists
    expect(WordService.getWordById(word.id)).toBeDefined();
    const lsCountBefore = globalThis.__TEST_DB__.prepare('SELECT COUNT(*) as count FROM learning_states').get() as any;
    expect(lsCountBefore.count).toBe(1);

    // Delete
    const result = WordService.deleteWord(word.id);
    expect(result).toBe(true);

    // Check it's gone
    expect(WordService.getWordById(word.id)).toBeNull();
    const lsCountAfter = globalThis.__TEST_DB__.prepare('SELECT COUNT(*) as count FROM learning_states').get() as any;
    expect(lsCountAfter.count).toBe(0);
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
});
