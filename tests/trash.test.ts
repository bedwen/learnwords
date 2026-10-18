import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { initializeSchema } from '../server/db/schema';
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
  LocalWordFolderRecord,
  LocalReviewHistoryRecord,
} from '../src/storage/indexedDb';
import * as platform from '../src/platform';
import * as wordsApi from '../src/api/words';
import { localRepository } from '../src/storage/localRepository';
import { LearningState, Word } from '../src/types';

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

const db = () => globalThis.__TEST_DB__;

function count(sql: string, ...params: unknown[]): number {
  return (db().prepare(sql).get(...params) as { count: number }).count;
}

describe('Word Trash Bin Feature (D033)', () => {
  let sqliteDb: Database.Database;

  beforeEach(() => {
    sqliteDb = new Database(':memory:');
    sqliteDb.pragma('foreign_keys = ON');
    initializeSchema(sqliteDb);
    globalThis.__TEST_DB__ = sqliteDb;
  });

  afterEach(() => {
    sqliteDb.close();
  });

  describe('WordService (SQLite Backend)', () => {
    it('correctly lists soft-deleted words in getTrashWords and excludes them from active queries', () => {
      const w1 = WordService.createWord({ word: 'serendipity', meaning: 'pleasant surprise', level: 'B2' });
      const w2 = WordService.createWord({ word: 'ephemeral', meaning: 'lasting a short time', level: 'C1' });
      const w3 = WordService.createWord({ word: 'ubiquitous', meaning: 'present everywhere', level: 'C1' });

      // Initially, trash is empty and active words has 3 items
      expect(WordService.getTrashCount()).toBe(0);
      expect(WordService.getTrashWords()).toHaveLength(0);
      expect(WordService.getWords()).toHaveLength(3);

      // Soft delete w1 and w2
      expect(WordService.deleteWord(w1.id)).toBe(true);
      expect(WordService.deleteWord(w2.id)).toBe(true);

      // Active words now only contains w3
      const activeWords = WordService.getWords();
      expect(activeWords).toHaveLength(1);
      expect(activeWords[0].id).toBe(w3.id);
      expect(WordService.getWordById(w1.id)).toBeNull();

      // Trash contains 2 items
      expect(WordService.getTrashCount()).toBe(2);
      const trash = WordService.getTrashWords();
      expect(trash).toHaveLength(2);
      expect(trash.map((w) => w.word)).toContain('serendipity');
      expect(trash.map((w) => w.word)).toContain('ephemeral');
    });

    it('filters trash words by search and level', () => {
      const w1 = WordService.createWord({ word: 'resilient', meaning: 'able to recover quickly', level: 'B2' });
      const w2 = WordService.createWord({ word: 'reticent', meaning: 'not revealing thoughts readily', level: 'C1' });
      const w3 = WordService.createWord({ word: 'tenacious', meaning: 'persistent', level: 'C1' });

      WordService.deleteWord(w1.id);
      WordService.deleteWord(w2.id);
      WordService.deleteWord(w3.id);

      // Search by word
      const searchRes = WordService.getTrashWords({ search: 'resil' });
      expect(searchRes).toHaveLength(1);
      expect(searchRes[0].id).toBe(w1.id);

      // Search by meaning
      const meaningRes = WordService.getTrashWords({ search: 'persistent' });
      expect(meaningRes).toHaveLength(1);
      expect(meaningRes[0].id).toBe(w3.id);

      // Filter by level
      const levelC1 = WordService.getTrashWords({ level: 'C1' });
      expect(levelC1).toHaveLength(2);
      expect(levelC1.map((w) => w.id)).toEqual(expect.arrayContaining([w2.id, w3.id]));
    });

    it('sorts trash words chronologically descending even with mixed timestamp representations', () => {
      const w1 = WordService.createWord({ word: 'first', meaning: 'm1', level: 'A1' });
      const w2 = WordService.createWord({ word: 'second', meaning: 'm2', level: 'A2' });
      const w3 = WordService.createWord({ word: 'third', meaning: 'm3', level: 'B1' });

      // Simulate mixed timestamp representations in DB
      db().prepare('UPDATE words SET deleted_at = ? WHERE id = ?').run('2026-10-18 10:00:00', w1.id);
      db().prepare('UPDATE words SET deleted_at = ? WHERE id = ?').run(Date.UTC(2026, 9, 18, 12, 0, 0), w2.id);
      db().prepare('UPDATE words SET deleted_at = ? WHERE id = ?').run('2026-10-18T11:00:00.000Z', w3.id);

      const trash = WordService.getTrashWords();
      expect(trash).toHaveLength(3);
      expect(trash[0].id).toBe(w2.id); // 12:00:00 UTC (newest)
      expect(trash[1].id).toBe(w3.id); // 11:00:00 UTC
      expect(trash[2].id).toBe(w1.id); // 10:00:00 UTC (oldest)
    });

    it('restores a word safely and preserves 100% of learning_states (SRS progress invariance)', () => {
      const word = WordService.createWord({ word: 'persist', meaning: 'continue firmly', level: 'B1' });

      // Simulate reviews to establish SRS progress
      StudyService.processReview(word.id, 'good'); // mastery = 1, interval_step = 1
      StudyService.processReview(word.id, 'good'); // mastery = 2, interval_step = 2

      const stateBeforeDelete = db().prepare('SELECT * FROM learning_states WHERE word_id = ?').get(word.id) as any;
      expect(stateBeforeDelete.mastery).toBe(2);
      expect(stateBeforeDelete.interval_step).toBe(2);
      expect(stateBeforeDelete.review_count).toBe(2);

      // Soft delete
      WordService.deleteWord(word.id);
      expect(WordService.getTrashCount()).toBe(1);

      // Restore word
      const restored = WordService.restoreWord(word.id);
      expect(restored).toBe(true);
      expect(WordService.getTrashCount()).toBe(0);

      // Verify active vocabulary has word back
      const restoredWord = WordService.getWordById(word.id);
      expect(restoredWord).not.toBeNull();
      expect(restoredWord?.deleted_at).toBeNull();
      expect(restoredWord?.level).toBe('B1');

      // Verify learning state is completely intact
      const stateAfterRestore = db().prepare('SELECT * FROM learning_states WHERE word_id = ?').get(word.id) as any;
      expect(stateAfterRestore.mastery).toBe(stateBeforeDelete.mastery);
      expect(stateAfterRestore.interval_step).toBe(stateBeforeDelete.interval_step);
      expect(stateAfterRestore.review_count).toBe(stateBeforeDelete.review_count);
      expect(stateAfterRestore.correct_count).toBe(stateBeforeDelete.correct_count);
      expect(stateAfterRestore.next_review).toBe(stateBeforeDelete.next_review);
    });

    it('returns false when trying to restore a non-deleted or non-existent word', () => {
      const word = WordService.createWord({ word: 'active', meaning: 'in use', level: 'A1' });
      // Word is active (deleted_at is null), restoring should return false
      expect(WordService.restoreWord(word.id)).toBe(false);
      expect(WordService.restoreWord('non-existent-id')).toBe(false);
    });

    it('permanently deletes a word and cascades to learning_states, review_history, and word_folders', () => {
      const folder = FolderService.createFolder('My Folder', '#10b981');
      const word = WordService.createWord({
        word: 'transient',
        meaning: 'passing quickly',
        level: 'B2',
        folderIds: [folder.id],
      });
      StudyService.processReview(word.id, 'easy');

      expect(count('SELECT COUNT(*) as count FROM words WHERE id = ?', word.id)).toBe(1);
      expect(count('SELECT COUNT(*) as count FROM learning_states WHERE word_id = ?', word.id)).toBe(1);
      expect(count('SELECT COUNT(*) as count FROM review_history WHERE word_id = ?', word.id)).toBe(1);
      expect(count('SELECT COUNT(*) as count FROM word_folders WHERE word_id = ?', word.id)).toBe(1);

      // Soft delete first
      WordService.deleteWord(word.id);
      expect(WordService.getTrashCount()).toBe(1);

      // Permanent purge
      const purged = WordService.permanentDeleteWord(word.id);
      expect(purged).toBe(true);
      expect(WordService.getTrashCount()).toBe(0);

      // Verify cascading physical deletions
      expect(count('SELECT COUNT(*) as count FROM words WHERE id = ?', word.id)).toBe(0);
      expect(count('SELECT COUNT(*) as count FROM learning_states WHERE word_id = ?', word.id)).toBe(0);
      expect(count('SELECT COUNT(*) as count FROM review_history WHERE word_id = ?', word.id)).toBe(0);
      expect(count('SELECT COUNT(*) as count FROM word_folders WHERE word_id = ?', word.id)).toBe(0);
      // Folder itself remains intact
      expect(count('SELECT COUNT(*) as count FROM folders WHERE id = ?', folder.id)).toBe(1);
    });

    it('batch restores multiple words preserving learning states', () => {
      const w1 = WordService.createWord({ word: 'w1', meaning: 'm1', level: 'A1' });
      const w2 = WordService.createWord({ word: 'w2', meaning: 'm2', level: 'A2' });
      const w3 = WordService.createWord({ word: 'w3', meaning: 'm3', level: 'B1' });

      StudyService.processReview(w1.id, 'good');
      StudyService.processReview(w2.id, 'good');

      const expectedMastery1 = WordService.getWordById(w1.id)!.learning_state.mastery;
      const expectedMastery2 = WordService.getWordById(w2.id)!.learning_state.mastery;

      WordService.deleteWord(w1.id);
      WordService.deleteWord(w2.id);
      WordService.deleteWord(w3.id);
      expect(WordService.getTrashCount()).toBe(3);

      const countRestored = WordService.batchRestoreWords([w1.id, w2.id, 'missing-id']);
      expect(countRestored).toBe(2);
      expect(WordService.getTrashCount()).toBe(1);

      const restored1 = WordService.getWordById(w1.id);
      const restored2 = WordService.getWordById(w2.id);
      expect(restored1).not.toBeNull();
      expect(restored2).not.toBeNull();
      expect(restored1?.learning_state.mastery).toBe(expectedMastery1);
      expect(restored2?.learning_state.mastery).toBe(expectedMastery2);
    });

    it('batch permanently deletes multiple words and cleans up all related records', () => {
      const w1 = WordService.createWord({ word: 'w1', meaning: 'm1', level: 'A1' });
      const w2 = WordService.createWord({ word: 'w2', meaning: 'm2', level: 'A2' });
      const w3 = WordService.createWord({ word: 'w3', meaning: 'm3', level: 'B1' });

      WordService.deleteWord(w1.id);
      WordService.deleteWord(w2.id);
      WordService.deleteWord(w3.id);

      const purgedCount = WordService.batchPermanentDeleteWords([w1.id, w2.id]);
      expect(purgedCount).toBe(2);
      expect(WordService.getTrashCount()).toBe(1);
      expect(count('SELECT COUNT(*) as count FROM words WHERE id IN (?, ?)', w1.id, w2.id)).toBe(0);
      expect(count('SELECT COUNT(*) as count FROM words WHERE id = ?', w3.id)).toBe(1);
    });

    it('emptyTrash permanently deletes all soft-deleted words while leaving active words untouched', () => {
      const active1 = WordService.createWord({ word: 'active1', meaning: 'm', level: 'A1' });
      const active2 = WordService.createWord({ word: 'active2', meaning: 'm', level: 'A2' });
      const trash1 = WordService.createWord({ word: 'trash1', meaning: 'm', level: 'B1' });
      const trash2 = WordService.createWord({ word: 'trash2', meaning: 'm', level: 'B2' });

      WordService.deleteWord(trash1.id);
      WordService.deleteWord(trash2.id);
      expect(WordService.getTrashCount()).toBe(2);

      const purgedCount = WordService.emptyTrash();
      expect(purgedCount).toBe(2);
      expect(WordService.getTrashCount()).toBe(0);

      // Active words must remain 100% untouched
      expect(WordService.getWords()).toHaveLength(2);
      expect(WordService.getWordById(active1.id)).not.toBeNull();
      expect(WordService.getWordById(active2.id)).not.toBeNull();
    });
  });

  describe('HTTP API Endpoints & Route Precedence', () => {
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

    it('GET /api/words/trash resolves to trash handler and does NOT collide with /:id', async () => {
      const word = WordService.createWord({ word: 'deliberate', meaning: 'intentional', level: 'B2' });
      WordService.deleteWord(word.id);

      const res = await fetch(`${baseUrl}/api/words/trash`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].word).toBe('deliberate');
    });

    it('GET /api/words/trash/count returns the count of soft-deleted words', async () => {
      const word = WordService.createWord({ word: 'count-test', meaning: 'testing', level: 'A1' });
      WordService.deleteWord(word.id);

      const res = await fetch(`${baseUrl}/api/words/trash/count`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ count: 1 });
    });

    it('POST /api/words/:id/restore restores word and preserves learning state', async () => {
      const word = WordService.createWord({ word: 'restore-test', meaning: 'restore meaning', level: 'B1' });
      StudyService.processReview(word.id, 'easy');
      const expectedMastery = WordService.getWordById(word.id)!.learning_state.mastery;
      WordService.deleteWord(word.id);

      const res = await fetch(`${baseUrl}/api/words/${word.id}/restore`, { method: 'POST' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const activeWord = WordService.getWordById(word.id);
      expect(activeWord).not.toBeNull();
      expect(activeWord?.learning_state.mastery).toBe(expectedMastery);
    });

    it('DELETE /api/words/:id/permanent permanently deletes a word', async () => {
      const word = WordService.createWord({ word: 'perm-delete', meaning: 'delete me', level: 'A2' });
      WordService.deleteWord(word.id);

      const res = await fetch(`${baseUrl}/api/words/${word.id}/permanent`, { method: 'DELETE' });
      expect(res.status).toBe(204);

      expect(count('SELECT COUNT(*) as count FROM words WHERE id = ?', word.id)).toBe(0);
    });

    it('POST /api/words/batch/restore restores multiple words', async () => {
      const w1 = WordService.createWord({ word: 'batch1', meaning: 'm1', level: 'A1' });
      const w2 = WordService.createWord({ word: 'batch2', meaning: 'm2', level: 'A2' });
      WordService.deleteWord(w1.id);
      WordService.deleteWord(w2.id);

      const res = await fetch(`${baseUrl}/api/words/batch/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordIds: [w1.id, w2.id] }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true, count: 2 });
      expect(WordService.getTrashCount()).toBe(0);
    });

    it('POST /api/words/batch/permanent permanently purges multiple words', async () => {
      const w1 = WordService.createWord({ word: 'batch-p1', meaning: 'm1', level: 'A1' });
      const w2 = WordService.createWord({ word: 'batch-p2', meaning: 'm2', level: 'A2' });
      WordService.deleteWord(w1.id);
      WordService.deleteWord(w2.id);

      const res = await fetch(`${baseUrl}/api/words/batch/permanent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordIds: [w1.id, w2.id] }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true, count: 2 });
      expect(count('SELECT COUNT(*) as count FROM words WHERE id IN (?, ?)', w1.id, w2.id)).toBe(0);
    });

    it('DELETE /api/words/trash/empty purges all trash words', async () => {
      const w1 = WordService.createWord({ word: 'empty-t1', meaning: 'm1', level: 'A1' });
      const w2 = WordService.createWord({ word: 'empty-t2', meaning: 'm2', level: 'A2' });
      WordService.deleteWord(w1.id);
      WordService.deleteWord(w2.id);

      const res = await fetch(`${baseUrl}/api/words/trash/empty`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true, count: 2 });
      expect(WordService.getTrashCount()).toBe(0);
    });
  });

  describe('Autonomous LocalRepository (Mobile / IndexedDB Mode)', () => {
    let adapter: IndexedDbAdapter;
    let repo: LocalRepository;

    beforeEach(async () => {
      const testFactory = createInMemoryIDBFactory();
      adapter = new IndexedDbAdapter(`test_trash_${generateId()}`, 2, testFactory);
      repo = new LocalRepository(adapter);
    });

    it('manages trash lifecycle in IndexedDB correctly', async () => {
      const word1 = await repo.createWord({ word: 'offline1', meaning: 'offline meaning 1', level: 'B1' });
      const word2 = await repo.createWord({ word: 'offline2', meaning: 'offline meaning 2', level: 'B2' });

      // Review word1 to advance learning state
      await repo.processReview(word1.id, 'good');
      const stateBefore = (await repo.getWordById(word1.id))?.learning_state;
      expect(stateBefore?.mastery).toBe(1);

      // Initially trash count is 0
      expect(await repo.getTrashCount()).toBe(0);

      // Soft delete word1 and word2
      await repo.deleteWord(word1.id);
      await repo.deleteWord(word2.id);

      expect(await repo.getTrashCount()).toBe(2);
      const trashWords = await repo.getTrashWords();
      expect(trashWords).toHaveLength(2);
      expect(trashWords.map((w) => w.word)).toContain('offline1');
      expect(trashWords.map((w) => w.word)).toContain('offline2');

      // Search within trash
      const searchRes = await repo.getTrashWords({ search: 'offline1' });
      expect(searchRes).toHaveLength(1);
      expect(searchRes[0].id).toBe(word1.id);

      // Restore word1
      const restored = await repo.restoreWord(word1.id);
      expect(restored).toBe(true);
      expect(await repo.getTrashCount()).toBe(1);

      // Active query sees word1 back, with intact learning state
      const restoredWord = await repo.getWordById(word1.id);
      expect(restoredWord).not.toBeNull();
      expect(restoredWord?.deleted_at).toBeNull();
      expect(restoredWord?.learning_state.mastery).toBe(1);

      // Permanent delete word2
      const purged = await repo.permanentDeleteWord(word2.id);
      expect(purged).toBe(true);
      expect(await repo.getTrashCount()).toBe(0);
      expect(await repo.getWordById(word2.id)).toBeNull();
    });

    it('batch restores and batch permanent deletes words in IndexedDB', async () => {
      const w1 = await repo.createWord({ word: 'bw1', meaning: 'bm1', level: 'A1' });
      const w2 = await repo.createWord({ word: 'bw2', meaning: 'bm2', level: 'A2' });
      const w3 = await repo.createWord({ word: 'bw3', meaning: 'bm3', level: 'B1' });

      await repo.deleteWord(w1.id);
      await repo.deleteWord(w2.id);
      await repo.deleteWord(w3.id);
      expect(await repo.getTrashCount()).toBe(3);

      // Batch restore w1 and w2
      const restoredCount = await repo.batchRestoreWords([w1.id, w2.id]);
      expect(restoredCount).toBe(2);
      expect(await repo.getTrashCount()).toBe(1);

      // Batch permanent delete w3
      const purgedCount = await repo.batchPermanentDeleteWords([w3.id]);
      expect(purgedCount).toBe(1);
      expect(await repo.getTrashCount()).toBe(0);
    });

    it('emptyTrash purges all soft-deleted records in IndexedDB', async () => {
      const active = await repo.createWord({ word: 'active', meaning: 'm', level: 'A1' });
      const t1 = await repo.createWord({ word: 't1', meaning: 'm', level: 'B1' });
      const t2 = await repo.createWord({ word: 't2', meaning: 'm', level: 'B2' });

      await repo.deleteWord(t1.id);
      await repo.deleteWord(t2.id);
      expect(await repo.getTrashCount()).toBe(2);

      const purged = await repo.emptyTrash();
      expect(purged).toBe(2);
      expect(await repo.getTrashCount()).toBe(0);

      // Active word remains intact
      expect(await repo.getWordById(active.id)).not.toBeNull();
    });
  });

  describe('Dual-Mode API Layer (src/api/words.ts)', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    describe('Desktop Mode (isMobileApp() === false)', () => {
      beforeEach(() => {
        vi.spyOn(platform, 'isMobileApp').mockReturnValue(false);
      });

      it('routes getTrashWords and getTrashCount to HTTP endpoints', async () => {
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
          if (url.includes('/api/words/trash/count')) {
            return Promise.resolve({ ok: true, json: async () => ({ count: 5 }) });
          }
          if (url.includes('/api/words/trash')) {
            return Promise.resolve({ ok: true, json: async () => [{ id: 'tw1', word: 'trashy' }] });
          }
          return Promise.reject(new Error('Unknown url'));
        });

        const countRes = await wordsApi.getTrashCount();
        expect(countRes).toEqual({ count: 5 });

        const wordsRes = await wordsApi.getTrashWords({ search: 'trash', level: 'C1' });
        expect(wordsRes).toEqual([{ id: 'tw1', word: 'trashy' }]);
        const calledUrl = (globalThis.fetch as any).mock.calls[1][0];
        expect(calledUrl).toContain('/api/words/trash?search=trash&level=C1');
      });

      it('routes restoreWord and permanentDeleteWord to HTTP endpoints', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

        await wordsApi.restoreWord('word-123');
        expect(globalThis.fetch).toHaveBeenCalledWith(
          '/api/words/word-123/restore',
          expect.objectContaining({ method: 'POST' })
        );

        await wordsApi.permanentDeleteWord('word-123');
        expect(globalThis.fetch).toHaveBeenCalledWith(
          '/api/words/word-123/permanent',
          expect.objectContaining({ method: 'DELETE' })
        );
      });

      it('routes batch restore, batch permanent delete, and emptyTrash to HTTP endpoints', async () => {
        globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
          if (url.includes('/api/words/batch/restore')) {
            return Promise.resolve({ ok: true, json: async () => ({ success: true, count: 2 }) });
          }
          if (url.includes('/api/words/batch/permanent')) {
            return Promise.resolve({ ok: true, json: async () => ({ success: true, count: 2 }) });
          }
          if (url.includes('/api/words/trash/empty')) {
            return Promise.resolve({ ok: true, json: async () => ({ success: true, count: 5 }) });
          }
          return Promise.reject(new Error('Unknown url'));
        });

        const r1 = await wordsApi.batchRestoreWords(['w1', 'w2']);
        expect(r1).toEqual({ success: true, count: 2 });

        const r2 = await wordsApi.batchPermanentDeleteWords(['w1', 'w2']);
        expect(r2).toEqual({ success: true, count: 2 });

        const r3 = await wordsApi.emptyTrash();
        expect(r3).toEqual({ success: true, count: 5 });
      });
    });

    describe('Mobile Mode (isMobileApp() === true)', () => {
      beforeEach(() => {
        vi.spyOn(platform, 'isMobileApp').mockReturnValue(true);
      });

      it('delegates trash operations directly to localRepository', async () => {
        const spyGetTrash = vi.spyOn(localRepository, 'getTrashWords').mockResolvedValue([] as any);
        const spyGetCount = vi.spyOn(localRepository, 'getTrashCount').mockResolvedValue(3);
        const spyRestore = vi.spyOn(localRepository, 'restoreWord').mockResolvedValue(true);
        const spyPermanent = vi.spyOn(localRepository, 'permanentDeleteWord').mockResolvedValue(true);
        const spyBatchRestore = vi.spyOn(localRepository, 'batchRestoreWords').mockResolvedValue(2);
        const spyBatchPermanent = vi.spyOn(localRepository, 'batchPermanentDeleteWords').mockResolvedValue(2);
        const spyEmpty = vi.spyOn(localRepository, 'emptyTrash').mockResolvedValue(3);

        await wordsApi.getTrashWords({ search: 'test' });
        expect(spyGetTrash).toHaveBeenCalledWith({ search: 'test' });

        const countResult = await wordsApi.getTrashCount();
        expect(countResult).toEqual({ count: 3 });
        expect(spyGetCount).toHaveBeenCalled();

        await wordsApi.restoreWord('w1');
        expect(spyRestore).toHaveBeenCalledWith('w1');

        await wordsApi.permanentDeleteWord('w1');
        expect(spyPermanent).toHaveBeenCalledWith('w1');

        const br = await wordsApi.batchRestoreWords(['w1', 'w2']);
        expect(br).toEqual({ success: true, count: 2 });
        expect(spyBatchRestore).toHaveBeenCalledWith(['w1', 'w2']);

        const bp = await wordsApi.batchPermanentDeleteWords(['w1', 'w2']);
        expect(bp).toEqual({ success: true, count: 2 });
        expect(spyBatchPermanent).toHaveBeenCalledWith(['w1', 'w2']);

        const emp = await wordsApi.emptyTrash();
        expect(emp).toEqual({ success: true, count: 3 });
        expect(spyEmpty).toHaveBeenCalled();
      });
    });
  });
});
