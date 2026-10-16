import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as platform from '../src/platform';
import * as wordsApi from '../src/api/words';
import * as foldersApi from '../src/api/folders';
import * as studyApi from '../src/api/study';
import * as homeApi from '../src/api/home';
import * as dataApi from '../src/api/data';
import { localRepository } from '../src/storage/localRepository';

describe('Dual-Mode API Layer (Desktop HTTP vs Mobile localRepository)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Desktop Mode (Default: isMobileApp() === false)', () => {
    beforeEach(() => {
      vi.spyOn(platform, 'isMobileApp').mockReturnValue(false);
    });

    it('fetches words via HTTP GET /api/words', async () => {
      const mockWords = [{ id: '1', word: 'test', meaning: 'a trial', level: 'A1' }];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockWords,
      } as any);

      const result = await wordsApi.getWords({ search: 'test', level: 'A1' });
      expect(result).toEqual(mockWords);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
      expect(calledUrl).toContain('/api/words?search=test&level=A1');
    });

    it('creates a word via HTTP POST /api/words', async () => {
      const createdWord = { id: 'w1', word: 'hello', meaning: 'greeting', level: 'A1' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createdWord,
      } as any);

      const result = await wordsApi.createWord({ word: 'hello', meaning: 'greeting', level: 'A1' });
      expect(result).toEqual(createdWord);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/words',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('fetches folders via HTTP GET /api/folders', async () => {
      const mockFolders = { folders: [], totalWords: 0, ungroupedCount: 0 };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockFolders,
      } as any);

      const result = await foldersApi.getFolders();
      expect(result).toEqual(mockFolders);
      const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
      expect(calledUrl).toContain('/api/folders');
    });

    it('submits a study review via HTTP POST /api/study/review', async () => {
      const updatedWord = { id: 'w1', word: 'study', meaning: 'learn', level: 'A1' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => updatedWord,
      } as any);

      const result = await studyApi.submitReview('w1', 'good');
      expect(result).toEqual(updatedWord);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/study/review',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ wordId: 'w1', rating: 'good' }),
        })
      );
    });

    it('fetches home summary via HTTP GET /api/home/summary', async () => {
      const mockSummary = { totalWords: 10, dueCount: 2, todayReviewedCount: 5 };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSummary,
      } as any);

      const result = await homeApi.getHomeSummary();
      expect(result).toEqual(mockSummary);
      const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
      expect(calledUrl).toContain('/api/home/summary');
    });

    it('exports sync bundle via HTTP GET /api/sync/bundle', async () => {
      const mockBundle = { version: 1, exported_at: 1000, words: [], folders: [], reviews: [] };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockBundle,
      } as any);

      const { blob, filename } = await dataApi.exportSyncBundle();
      expect(filename).toContain('learnwords-sync-bundle-');
      const text = await blob.text();
      expect(JSON.parse(text)).toEqual(mockBundle);
      const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
      expect(calledUrl).toContain('/api/sync/bundle');
    });

    it('merges sync bundle via HTTP POST /api/sync', async () => {
      const mockResult = {
        success: true,
        wordsAdded: 1,
        wordsUpdated: 0,
        wordsDeleted: 0,
        foldersAdded: 0,
        foldersUpdated: 0,
        foldersDeleted: 0,
        reviewsMerged: 0,
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, result: mockResult }),
      } as any);

      const file = new File(
        [JSON.stringify({ version: 1, exported_at: 1000, words: [], folders: [], reviews: [] })],
        'sync.json',
        { type: 'application/json' }
      );
      const result = await dataApi.importSyncBundle(file);
      expect(result).toEqual(mockResult);
      const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
      expect(calledUrl).toContain('/api/sync');
    });
  });

  describe('Mobile Mode (isMobileApp() === true)', () => {
    beforeEach(() => {
      vi.spyOn(platform, 'isMobileApp').mockReturnValue(true);
    });

    it('delegates getWords to localRepository.getWords', async () => {
      const repoSpy = vi.spyOn(localRepository, 'getWords').mockResolvedValue([] as any);
      const result = await wordsApi.getWords({ level: 'B1' });
      expect(result).toEqual([]);
      expect(repoSpy).toHaveBeenCalledWith({ level: 'B1' });
    });

    it('delegates createWord to localRepository.createWord', async () => {
      const mockCreated = { id: 'w2', word: 'mobile', meaning: 'portable', level: 'A2' } as any;
      const repoSpy = vi.spyOn(localRepository, 'createWord').mockResolvedValue(mockCreated);
      const result = await wordsApi.createWord({ word: 'mobile', meaning: 'portable', level: 'A2' });
      expect(result).toEqual(mockCreated);
      expect(repoSpy).toHaveBeenCalledWith({ word: 'mobile', meaning: 'portable', level: 'A2' });
    });

    it('delegates getFolders to localRepository.getFolders', async () => {
      const mockFolders = { folders: [], totalWords: 0, ungroupedCount: 0 };
      const repoSpy = vi.spyOn(localRepository, 'getFolders').mockResolvedValue(mockFolders);
      const result = await foldersApi.getFolders();
      expect(result).toEqual(mockFolders);
      expect(repoSpy).toHaveBeenCalled();
    });

    it('delegates submitReview to localRepository.processReview', async () => {
      const mockReviewed = { id: 'w1', word: 'test' } as any;
      const repoSpy = vi.spyOn(localRepository, 'processReview').mockResolvedValue(mockReviewed);
      const result = await studyApi.submitReview('w1', 'easy');
      expect(result).toEqual(mockReviewed);
      expect(repoSpy).toHaveBeenCalledWith('w1', 'easy');
    });

    it('delegates getHomeSummary to localRepository.getHomeSummary', async () => {
      const mockSummary = { totalWords: 5 } as any;
      const repoSpy = vi.spyOn(localRepository, 'getHomeSummary').mockResolvedValue(mockSummary);
      const result = await homeApi.getHomeSummary();
      expect(result).toEqual(mockSummary);
      expect(repoSpy).toHaveBeenCalled();
    });

    it('delegates exportSyncBundle to localRepository.exportSyncBundle', async () => {
      const mockBundle = { version: 1, exported_at: 2000, words: [], folders: [], reviews: [] };
      const repoSpy = vi.spyOn(localRepository, 'exportSyncBundle').mockResolvedValue(mockBundle);
      const { blob, filename } = await dataApi.exportSyncBundle();
      expect(filename).toContain('learnwords-sync-bundle-');
      const text = await blob.text();
      expect(JSON.parse(text)).toEqual(mockBundle);
      expect(repoSpy).toHaveBeenCalled();
    });
  });
});
