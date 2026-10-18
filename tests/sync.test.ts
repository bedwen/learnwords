import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { initializeSchema } from '../server/db/schema';
import { SyncService } from '../server/services/sync';
import { WordService } from '../server/services/words';
import { FolderService } from '../server/services/folders';
import { StudyService } from '../server/services/study';
import { createApp } from '../server/app';
import {
  LocalRepository,
  generateId,
} from '../src/storage/localRepository';
import {
  IndexedDbAdapter,
  createInMemoryIDBFactory,
} from '../src/storage/indexedDb';
import { SyncBundle } from '../src/types';

vi.mock('../server/db', () => ({
  getDatabase: () => globalThis.__TEST_DB__,
}));
vi.mock('../server/db/connection', () => ({
  getDatabase: () => globalThis.__TEST_DB__,
  createTestDatabase: vi.fn(),
  closeDatabase: vi.fn(),
}));

declare global {
  var __TEST_DB__: Database.Database;
}

describe('LAN Peer Sync & Smart Merge', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    globalThis.__TEST_DB__ = db;
  });

  afterEach(() => {
    db.close();
  });

  describe('SyncService (SQLite In-Memory)', () => {
    it('exports a complete SyncBundle matching schema version 1', () => {
      const folder = FolderService.createFolder('Travel', '#3b82f6');
      const word = WordService.createWord({
        word: 'itinerary',
        meaning: 'planned route or journey',
        level: 'B2',
        folderIds: [folder.id],
      });
      StudyService.processReview(word.id, 'good');

      const bundle = SyncService.exportSyncBundle();

      expect(bundle.version).toBe(1);
      expect(bundle.deviceId).toBeDefined();
      expect(bundle.exportedAt).toBeDefined();
      expect(bundle.words).toHaveLength(1);
      expect(bundle.words[0].word).toBe('itinerary');
      expect(bundle.words[0].sync_id).toBeDefined();
      expect(bundle.folders).toHaveLength(1);
      expect(bundle.folders[0].name).toBe('Travel');
      expect(bundle.word_folders).toHaveLength(1);
      expect(bundle.review_history).toHaveLength(1);
      expect(bundle.review_history[0].rating).toBe('good');
    });

    it('includes soft-deleted words and folders in export for sync propagation', () => {
      const folder = FolderService.createFolder('Old Folder', '#64748b');
      const word = WordService.createWord({
        word: 'obsolete',
        meaning: 'no longer produced or used',
        level: 'C1',
      });

      WordService.deleteWord(word.id);
      FolderService.deleteFolder(folder.id);

      // Verify hidden from active queries
      expect(WordService.getWordById(word.id)).toBeNull();
      expect(FolderService.getFolderById(folder.id)).toBeNull();

      // Export must include them with deleted_at timestamp
      const bundle = SyncService.exportSyncBundle();
      expect(bundle.words).toHaveLength(1);
      expect(bundle.words[0].deleted_at).not.toBeNull();
      expect(bundle.folders).toHaveLength(1);
      expect(bundle.folders[0].deleted_at).not.toBeNull();
    });

    it('merges an incoming SyncBundle using Last-Write-Wins and harmonizes learning states', () => {
      const w1 = WordService.createWord({
        word: 'serendipity',
        meaning: 'fortunate chance',
        level: 'C2',
      });

      const incomingBundle: SyncBundle = {
        version: 1,
        deviceId: 'remote-mobile',
        exportedAt: new Date().toISOString(),
        words: [
          // Update w1 with newer timestamp
          {
            id: w1.id,
            sync_id: w1.sync_id,
            word: 'serendipity',
            meaning: 'valuable discovery by accident',
            level: 'C2',
            created_at: w1.created_at,
            updated_at: Date.now() + 10000,
            deleted_at: null,
          },
          // New word from mobile
          {
            id: 'remote-w2',
            sync_id: 'remote-sync-w2',
            word: 'ubiquitous',
            meaning: 'present everywhere',
            level: 'C1',
            created_at: new Date().toISOString(),
            updated_at: Date.now(),
            deleted_at: null,
          },
        ],
        folders: [
          {
            id: 'remote-f1',
            sync_id: 'remote-sync-f1',
            name: 'Advanced',
            color: '#8b5cf6',
            wordCount: 0,
            created_at: new Date().toISOString(),
            updated_at: Date.now(),
            deleted_at: null,
          },
        ],
        word_folders: [
          { word_id: 'remote-w2', folder_id: 'remote-f1' },
        ],
        review_history: [
          {
            id: 'rev-remote-1',
            sync_id: 'sync-rev-1',
            word_id: 'remote-w2',
            rating: 'good',
            mastery_before: 0,
            mastery_after: 1,
            interval_step_before: 0,
            interval_step_after: 1,
            reviewed_at: new Date().toISOString(),
          },
        ],
      };

      const { result, serverBundle } = SyncService.mergeSyncBundle(incomingBundle);

      expect(result.success).toBe(true);
      expect(result.wordsAdded).toBe(1);
      expect(result.wordsUpdated).toBe(1);
      expect(result.foldersAdded).toBe(1);
      expect(result.reviewsMerged).toBe(1);

      // Verify updated meaning in SQLite
      const updatedW1 = WordService.getWordById(w1.id);
      expect(updatedW1?.meaning).toBe('valuable discovery by accident');

      // Verify new word in SQLite
      const words = WordService.getWords();
      expect(words).toHaveLength(2);
      const remoteWord = words.find((w) => w.word === 'ubiquitous');
      expect(remoteWord).toBeDefined();
      expect(remoteWord?.learning_state.review_count).toBe(1);

      // Server bundle has both words
      expect(serverBundle.words).toHaveLength(2);
    });

    it('propagates soft-deletes from incoming bundle', () => {
      const word = WordService.createWord({
        word: 'discardable',
        meaning: 'can be discarded',
        level: 'A2',
      });

      const incomingBundle: SyncBundle = {
        version: 1,
        deviceId: 'remote-mobile',
        exportedAt: new Date().toISOString(),
        words: [
          {
            id: word.id,
            sync_id: word.sync_id,
            word: 'discardable',
            meaning: 'can be discarded',
            level: 'A2',
            created_at: word.created_at,
            updated_at: Date.now() + 5000,
            deleted_at: Date.now() + 5000,
          },
        ],
        folders: [],
        word_folders: [],
        review_history: [],
      };

      const { result } = SyncService.mergeSyncBundle(incomingBundle);
      expect(result.wordsDeleted).toBe(1);

      // Word should now be soft-deleted in SQLite
      expect(WordService.getWordById(word.id)).toBeNull();
      const rawRow = db.prepare('SELECT deleted_at FROM words WHERE id = ?').get(word.id) as any;
      expect(rawRow.deleted_at).not.toBeNull();
    });

    it('merges an incoming bundle with orphaned word_folders without FOREIGN KEY crash and omits orphaned junctions', () => {
      const folder = FolderService.createFolder('Science', '#10b981');
      const word = WordService.createWord({
        word: 'hypothesis',
        meaning: 'proposed explanation',
        level: 'B2',
      });

      const incomingBundle: SyncBundle = {
        version: 1,
        deviceId: 'remote-mobile',
        exportedAt: new Date().toISOString(),
        words: [],
        folders: [],
        word_folders: [
          // 1. Valid link
          { word_id: word.id, folder_id: folder.id },
          // 2. Orphaned word_id (non-existent word)
          { word_id: 'non-existent-word-id', folder_id: folder.id },
          // 3. Orphaned folder_id (non-existent folder)
          { word_id: word.id, folder_id: 'non-existent-folder-id' },
          // 4. Both non-existent
          { word_id: 'ghost-word', folder_id: 'ghost-folder' },
        ],
        review_history: [],
      };

      const { result, serverBundle } = SyncService.mergeSyncBundle(incomingBundle);
      expect(result.success).toBe(true);

      // Check word_folders in SQLite
      const junctions = db.prepare('SELECT word_id, folder_id FROM word_folders').all() as any[];
      expect(junctions).toHaveLength(1);
      expect(junctions[0].word_id).toBe(word.id);
      expect(junctions[0].folder_id).toBe(folder.id);

      // Check serverBundle export
      expect(serverBundle.word_folders).toHaveLength(1);
      expect(serverBundle.word_folders[0]).toEqual({
        word_id: word.id,
        folder_id: folder.id,
      });
    });

    it('merges an incoming bundle with orphaned review_history without FOREIGN KEY crash and omits orphaned reviews', () => {
      const word = WordService.createWord({
        word: 'experiment',
        meaning: 'scientific procedure',
        level: 'B1',
      });

      const incomingBundle: SyncBundle = {
        version: 1,
        deviceId: 'remote-mobile',
        exportedAt: new Date().toISOString(),
        words: [],
        folders: [],
        word_folders: [],
        review_history: [
          // Valid review
          {
            id: 'rev-valid',
            sync_id: 'sync-rev-valid',
            word_id: word.id,
            rating: 'good',
            mastery_before: 0,
            mastery_after: 1,
            interval_step_before: 0,
            interval_step_after: 1,
            reviewed_at: new Date().toISOString(),
          },
          // Orphaned review (word_id does not exist)
          {
            id: 'rev-orphan',
            sync_id: 'sync-rev-orphan',
            word_id: 'ghost-word-id-12345',
            rating: 'easy',
            mastery_before: 0,
            mastery_after: 2,
            interval_step_before: 0,
            interval_step_after: 2,
            reviewed_at: new Date().toISOString(),
          },
        ],
      };

      const { result, serverBundle } = SyncService.mergeSyncBundle(incomingBundle);
      expect(result.success).toBe(true);

      // Check reviews in SQLite
      const reviews = db.prepare('SELECT id, word_id FROM review_history').all() as any[];
      expect(reviews).toHaveLength(1);
      expect(reviews[0].word_id).toBe(word.id);

      // Check serverBundle export
      expect(serverBundle.review_history).toHaveLength(1);
      expect(serverBundle.review_history[0].word_id).toBe(word.id);
    });

    it('does not re-link words to a deleted folder and cleans up existing associations', () => {
      const folder = FolderService.createFolder('Temporary Folder', '#ef4444');
      const word = WordService.createWord({
        word: 'transient',
        meaning: 'lasting only for a short time',
        level: 'C1',
        folderIds: [folder.id],
      });

      // Folder is deleted on server
      FolderService.deleteFolder(folder.id);

      // Incoming bundle has the word_folders link from before the folder was deleted
      const incomingBundle: SyncBundle = {
        version: 1,
        deviceId: 'remote-mobile',
        exportedAt: new Date().toISOString(),
        words: [],
        folders: [],
        word_folders: [
          { word_id: word.id, folder_id: folder.id },
        ],
        review_history: [],
      };

      const { result, serverBundle } = SyncService.mergeSyncBundle(incomingBundle);
      expect(result.success).toBe(true);

      // SQLite must NOT have the word_folders link
      const junctions = db.prepare('SELECT * FROM word_folders WHERE folder_id = ?').all(folder.id);
      expect(junctions).toHaveLength(0);

      // Server bundle export must NOT contain junction pointing to deleted folder
      expect(serverBundle.word_folders.some((wf) => wf.folder_id === folder.id)).toBe(false);
    });

    it('cleans up word_folders when a folder is soft-deleted via incoming bundle', () => {
      const folder = FolderService.createFolder('Archive', '#6b7280');
      const word = WordService.createWord({
        word: 'relic',
        meaning: 'an object surviving from an earlier time',
        level: 'B2',
        folderIds: [folder.id],
      });

      // Verify junction exists before sync
      const initialJunctions = db.prepare('SELECT * FROM word_folders WHERE folder_id = ?').all(folder.id);
      expect(initialJunctions).toHaveLength(1);

      // Incoming bundle marks the folder as deleted
      const incomingBundle: SyncBundle = {
        version: 1,
        deviceId: 'remote-mobile',
        exportedAt: new Date().toISOString(),
        words: [],
        folders: [
          {
            id: folder.id,
            sync_id: folder.sync_id,
            name: folder.name,
            color: folder.color,
            wordCount: 0,
            created_at: folder.created_at,
            updated_at: Date.now() + 5000,
            deleted_at: Date.now() + 5000,
          },
        ],
        word_folders: [
          { word_id: word.id, folder_id: folder.id },
        ],
        review_history: [],
      };

      const { result, serverBundle } = SyncService.mergeSyncBundle(incomingBundle);
      expect(result.success).toBe(true);
      expect(result.foldersDeleted).toBe(1);

      // Verify junction was deleted from SQLite
      const afterJunctions = db.prepare('SELECT * FROM word_folders WHERE folder_id = ?').all(folder.id);
      expect(afterJunctions).toHaveLength(0);
      expect(serverBundle.word_folders).toHaveLength(0);
    });
  });

  describe('HTTP Sync Routes (/api/sync)', () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
      const app = createApp();
      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const port = (server.address() as AddressInfo).port;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('POST /api/sync accepts bundle and returns merged results', async () => {
      WordService.createWord({ word: 'server_word', meaning: 'meaning1', level: 'B1' });

      const incomingBundle: SyncBundle = {
        version: 1,
        deviceId: 'client-node',
        exportedAt: new Date().toISOString(),
        words: [
          {
            id: 'client-w1',
            sync_id: 'sync-cw1',
            word: 'client_word',
            meaning: 'meaning2',
            level: 'A1',
            created_at: new Date().toISOString(),
            updated_at: Date.now(),
            deleted_at: null,
          },
        ],
        folders: [],
        word_folders: [],
        review_history: [],
      };

      const res = await fetch(`${baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: incomingBundle }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.result.wordsAdded).toBe(1);
      expect(json.serverBundle.words).toHaveLength(2);
    });

    it('POST /api/sync rejects invalid or corrupted bundles with 400', async () => {
      const res = await fetch(`${baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: { version: 99 } }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it('GET /api/sync/bundle returns current server sync bundle', async () => {
      WordService.createWord({ word: 'export_me', meaning: 'to be exported', level: 'A2' });

      const res = await fetch(`${baseUrl}/api/sync/bundle`);
      expect(res.status).toBe(200);
      const bundle = await res.json();
      expect(bundle.version).toBe(1);
      expect(bundle.words.some((w: any) => w.word === 'export_me')).toBe(true);
    });

    it('allows CORS requests from RFC 1918 private network origins', async () => {
      const res = await fetch(`${baseUrl}/api/sync/bundle`, {
        headers: { Origin: 'http://192.168.1.150:5173' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://192.168.1.150:5173');
    });

    it('rejects CORS requests from untrusted public origins', async () => {
      const res = await fetch(`${baseUrl}/api/sync/bundle`, {
        headers: { Origin: 'http://malicious-website.com' },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('Bidirectional Exchange (IndexedDB <-> SQLite)', () => {
    it('synchronizes data bi-directionally between mobile IndexedDB and desktop SQLite', async () => {
      // 1. Setup isolated in-memory IndexedDB client repository
      const testFactory = createInMemoryIDBFactory();
      const adapter = new IndexedDbAdapter(`test_sync_${generateId()}`, 1, testFactory);
      const clientRepo = new LocalRepository(adapter);

      // 2. Client creates a word and processes a review
      const clientWord = await clientRepo.createWord({
        word: 'client_vocab',
        meaning: 'learned on mobile',
        level: 'B1',
      });
      await clientRepo.processReview(clientWord.id, 'good');

      // 3. Server creates a word in SQLite
      const serverWord = WordService.createWord({
        word: 'server_vocab',
        meaning: 'created on desktop',
        level: 'C1',
      });

      // 4. Client exports sync bundle
      const clientBundle = await clientRepo.exportSyncBundle();
      expect(clientBundle.words).toHaveLength(1);
      expect(clientBundle.review_history).toHaveLength(1);

      // 5. Server receives client bundle and merges it
      const { result: serverMergeResult, serverBundle } = SyncService.mergeSyncBundle(clientBundle);
      expect(serverMergeResult.wordsAdded).toBe(1);
      expect(serverMergeResult.reviewsMerged).toBe(1);

      // 6. Client receives serverBundle and merges it into IndexedDB
      const clientMergeResult = await clientRepo.mergeSyncBundle(serverBundle);
      expect(clientMergeResult.wordsAdded).toBe(1); // Added server_vocab

      // 7. Verify both nodes are in full sync
      const finalClientWords = await clientRepo.getWords();
      const finalServerWords = WordService.getWords();

      expect(finalClientWords).toHaveLength(2);
      expect(finalServerWords).toHaveLength(2);

      const clientWordNames = finalClientWords.map((w) => w.word).sort();
      const serverWordNames = finalServerWords.map((w) => w.word).sort();
      expect(clientWordNames).toEqual(['client_vocab', 'server_vocab']);
      expect(serverWordNames).toEqual(['client_vocab', 'server_vocab']);
    });

    it('filters orphaned word_folders and reviews on client IndexedDB smart merge', async () => {
      const testFactory = createInMemoryIDBFactory();
      const adapter = new IndexedDbAdapter(`test_orphan_${generateId()}`, 1, testFactory);
      const clientRepo = new LocalRepository(adapter);

      const word = await clientRepo.createWord({
        word: 'catalyst',
        meaning: 'substance that increases rate of reaction',
        level: 'C1',
      });
      const folder = await clientRepo.createFolder('Chemistry', '#06b6d4');

      const incomingBundle: SyncBundle = {
        version: 1,
        deviceId: 'server-desktop',
        exportedAt: new Date().toISOString(),
        words: [],
        folders: [],
        word_folders: [
          { word_id: word.id, folder_id: folder.id },
          { word_id: 'unknown-word', folder_id: folder.id },
          { word_id: word.id, folder_id: 'unknown-folder' },
        ],
        review_history: [
          {
            id: 'rev-client-valid',
            sync_id: 'sync-rev-c-valid',
            word_id: word.id,
            rating: 'good',
            mastery_before: 0,
            mastery_after: 1,
            interval_step_before: 0,
            interval_step_after: 1,
            reviewed_at: new Date().toISOString(),
          },
          {
            id: 'rev-client-orphan',
            sync_id: 'sync-rev-c-orphan',
            word_id: 'unknown-word',
            rating: 'again',
            mastery_before: 0,
            mastery_after: 0,
            interval_step_before: 0,
            interval_step_after: 0,
            reviewed_at: new Date().toISOString(),
          },
        ],
      };

      const mergeResult = await clientRepo.mergeSyncBundle(incomingBundle);
      expect(mergeResult.success).toBe(true);

      const savedWordFolders = await adapter.getAll('word_folders');
      expect(savedWordFolders).toHaveLength(1);

      const savedReviews = await adapter.getAll('review_history');
      expect(savedReviews).toHaveLength(1);
    });
  });
});
