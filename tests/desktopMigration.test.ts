import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkAndMigrateDesktopData,
} from '../src/storage/desktopMigration';
import { LocalRepository } from '../src/storage/localRepository';
import {
  IndexedDbAdapter,
  createInMemoryIDBFactory,
  LocalSyncMetaRecord,
  LocalReviewHistoryRecord,
} from '../src/storage/indexedDb';
import { Word } from '../src/types';

describe('Desktop Data Rescue Migration (checkAndMigrateDesktopData)', () => {
  let adapter: IndexedDbAdapter;
  let repo: LocalRepository;

  beforeEach(() => {
    const testFactory = createInMemoryIDBFactory();
    adapter = new IndexedDbAdapter(`test_rescue_${Math.random()}`, 1, testFactory);
    repo = new LocalRepository(adapter);
  });

  it('skips migration when local database has no words or reviews', async () => {
    const fetchMock = vi.fn();
    const result = await checkAndMigrateDesktopData({
      adapter,
      repository: repo,
      fetchFn: fetchMock as any,
    });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('no_local_data');
    expect(fetchMock).not.toHaveBeenCalled();

    const meta = await adapter.get<LocalSyncMetaRecord>('sync_meta', 'desktop_migrated_at');
    expect(meta).toBeUndefined();
  });

  it('migrates local data, posts bundle to /api/sync, and sets desktop_migrated_at flag on success', async () => {
    // Populate local words and reviews
    const createdWord = await repo.createWord({
      word: 'serendipity',
      meaning: 'fortunate discovery',
      level: 'B2',
    });
    await repo.processReview(createdWord.id, 'good');

    let postedPayload: any = null;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      expect(url).toBe('/api/sync');
      expect(init.method).toBe('POST');
      postedPayload = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: { wordsAdded: 1, reviewsMerged: 1 },
        }),
      };
    });

    const result = await checkAndMigrateDesktopData({
      adapter,
      repository: repo,
      fetchFn: fetchMock as any,
    });

    expect(result.migrated).toBe(true);
    expect(result.reason).toBe('success');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postedPayload.bundle).toBeDefined();
    expect(postedPayload.bundle.words.length).toBeGreaterThan(0);
    expect(postedPayload.bundle.review_history.length).toBeGreaterThan(0);

    // Verify flag is stored in sync_meta
    const meta = await adapter.get<LocalSyncMetaRecord>('sync_meta', 'desktop_migrated_at');
    expect(meta).toBeDefined();
    expect(meta?.value).toBeTruthy();
  });

  it('runs only once: subsequent launches detect desktop_migrated_at and skip', async () => {
    // Populate local data and pre-set desktop_migrated_at
    await repo.createWord({ word: 'ephemeral', meaning: 'short-lived', level: 'C1' });
    const timestamp = new Date().toISOString();
    await adapter.put<LocalSyncMetaRecord>('sync_meta', {
      key: 'desktop_migrated_at',
      value: timestamp,
      updated_at: timestamp,
    });

    const fetchMock = vi.fn();
    const result = await checkAndMigrateDesktopData({
      adapter,
      repository: repo,
      fetchFn: fetchMock as any,
    });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('already_migrated');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries after network or server failure without setting the migration flag', async () => {
    await repo.createWord({ word: 'resilient', meaning: 'able to recover quickly', level: 'B2' });

    // 1st attempt: server is offline (throws error)
    const failingFetchMock = vi.fn().mockRejectedValue(new Error('Network offline'));
    const firstResult = await checkAndMigrateDesktopData({
      adapter,
      repository: repo,
      fetchFn: failingFetchMock as any,
    });

    expect(firstResult.migrated).toBe(false);
    expect(firstResult.reason).toBe('failed');
    expect(firstResult.error).toContain('Network offline');

    // Migration flag must NOT be set
    let meta = await adapter.get<LocalSyncMetaRecord>('sync_meta', 'desktop_migrated_at');
    expect(meta).toBeUndefined();

    // 2nd attempt: server returns HTTP 500 error
    const serverErrorFetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    });
    const secondResult = await checkAndMigrateDesktopData({
      adapter,
      repository: repo,
      fetchFn: serverErrorFetchMock as any,
    });

    expect(secondResult.migrated).toBe(false);
    expect(secondResult.reason).toBe('failed');
    expect(secondResult.error).toContain('500');

    meta = await adapter.get<LocalSyncMetaRecord>('sync_meta', 'desktop_migrated_at');
    expect(meta).toBeUndefined();

    // 3rd attempt: server comes back online and succeeds
    const successFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: {} }),
    });
    const thirdResult = await checkAndMigrateDesktopData({
      adapter,
      repository: repo,
      fetchFn: successFetchMock as any,
    });

    expect(thirdResult.migrated).toBe(true);
    expect(thirdResult.reason).toBe('success');

    meta = await adapter.get<LocalSyncMetaRecord>('sync_meta', 'desktop_migrated_at');
    expect(meta).toBeDefined();
    expect(meta?.value).toBeTruthy();
  });

  it('strictly preserves local IndexedDB data and never deletes or truncates records', async () => {
    const word = await repo.createWord({
      word: 'inviolate',
      meaning: 'free or safe from injury or violation',
      level: 'C2',
    });
    await repo.processReview(word.id, 'easy');

    const wordsBefore = await adapter.getAll<Word>('words');
    const reviewsBefore = await adapter.getAll<LocalReviewHistoryRecord>('review_history');
    expect(wordsBefore.length).toBe(1);
    expect(reviewsBefore.length).toBe(1);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: {} }),
    });

    await checkAndMigrateDesktopData({
      adapter,
      repository: repo,
      fetchFn: fetchMock as any,
    });

    // Verify local data is 100% identical after migration
    const wordsAfter = await adapter.getAll<Word>('words');
    const reviewsAfter = await adapter.getAll<LocalReviewHistoryRecord>('review_history');

    expect(wordsAfter).toEqual(wordsBefore);
    expect(reviewsAfter).toEqual(reviewsBefore);
  });
});
