import { describe, it, expect, beforeEach } from 'vitest';
import {
  mergeWords,
  mergeFolders,
  mergeReviews,
  harmonizeWordLearningState,
  executeSmartMerge,
} from '../src/storage/smartMerge';
import {
  LocalRepository,
  generateId,
} from '../src/storage/localRepository';
import {
  IndexedDbAdapter,
  createInMemoryIDBFactory,
} from '../src/storage/indexedDb';
import { Word, Folder, LocalReviewHistoryRecord, SyncBundle } from '../src/types';

describe('Smart Merge Engine (Pure Functions)', () => {
  describe('mergeWords (Last-Write-Wins & Soft Delete)', () => {
    it('inserts unseen incoming words', () => {
      const localWords: Word[] = [
        {
          id: 'w1',
          sync_id: 'sync-w1',
          word: 'resilient',
          meaning: 'able to recover quickly',
          level: 'B2',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 1000,
          deleted_at: null,
        },
      ];

      const incomingWords: Word[] = [
        {
          id: 'w2-remote',
          sync_id: 'sync-w2',
          word: 'ephemeral',
          meaning: 'lasting a very short time',
          level: 'C1',
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: 2000,
          deleted_at: null,
        },
      ];

      const result = mergeWords(localWords, incomingWords);
      expect(result.added).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.merged).toHaveLength(2);
      expect(result.merged.find((w) => w.sync_id === 'sync-w2')).toBeDefined();
    });

    it('LWW: newer incoming word overwrites local word', () => {
      const localWords: Word[] = [
        {
          id: 'w1',
          sync_id: 'sync-w1',
          word: 'ubiquitous',
          meaning: 'present everywhere',
          level: 'B2',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 1000,
          deleted_at: null,
        },
      ];

      const incomingWords: Word[] = [
        {
          id: 'w1-remote',
          sync_id: 'sync-w1',
          word: 'ubiquitous',
          meaning: 'present, appearing, or found everywhere (updated)',
          level: 'C1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 2000, // Newer!
          deleted_at: null,
        },
      ];

      const result = mergeWords(localWords, incomingWords);
      expect(result.added).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(0);
      expect(result.merged).toHaveLength(1);

      const merged = result.merged[0];
      expect(merged.id).toBe('w1'); // Local ID preserved
      expect(merged.meaning).toBe('present, appearing, or found everywhere (updated)');
      expect(merged.level).toBe('C1');
      expect(merged.updated_at).toBe(2000);
    });

    it('LWW: older incoming word is ignored', () => {
      const localWords: Word[] = [
        {
          id: 'w1',
          sync_id: 'sync-w1',
          word: 'lucid',
          meaning: 'expressed clearly',
          level: 'B2',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 5000, // Newer local
          deleted_at: null,
        },
      ];

      const incomingWords: Word[] = [
        {
          id: 'w1-remote',
          sync_id: 'sync-w1',
          word: 'lucid',
          meaning: 'old meaning',
          level: 'B1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 3000, // Older remote
          deleted_at: null,
        },
      ];

      const result = mergeWords(localWords, incomingWords);
      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.merged[0].meaning).toBe('expressed clearly');
      expect(result.merged[0].updated_at).toBe(5000);
    });

    it('propagates soft-deletion when remote deleted_at is newer', () => {
      const localWords: Word[] = [
        {
          id: 'w1',
          sync_id: 'sync-w1',
          word: 'obsolete',
          meaning: 'no longer produced or used',
          level: 'C1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 1000,
          deleted_at: null,
        },
      ];

      const incomingWords: Word[] = [
        {
          id: 'w1-remote',
          sync_id: 'sync-w1',
          word: 'obsolete',
          meaning: 'no longer produced or used',
          level: 'C1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 3000,
          deleted_at: 3000, // Deleted remotely
        },
      ];

      const result = mergeWords(localWords, incomingWords);
      expect(result.deleted).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.merged[0].deleted_at).toBe(3000);
    });

    it('matches by word text as fallback when sync_id is absent on legacy records', () => {
      const localWords: Word[] = [
        {
          id: 'w1',
          sync_id: 'sync-local-1',
          word: 'Pragmatic',
          meaning: 'practical',
          level: 'B2',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 1000,
          deleted_at: null,
        },
      ];

      const incomingWords: Word[] = [
        {
          id: 'w-legacy',
          sync_id: '', // Empty sync_id
          word: 'pragmatic',
          meaning: 'dealing with things sensibly and realistically',
          level: 'C1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 2000,
          deleted_at: null,
        },
      ];

      const result = mergeWords(localWords, incomingWords);
      expect(result.added).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.merged).toHaveLength(1);
      expect(result.merged[0].meaning).toBe('dealing with things sensibly and realistically');
    });
  });

  describe('mergeFolders (Last-Write-Wins & Soft Delete)', () => {
    it('merges new folders and applies LWW', () => {
      const localFolders: Folder[] = [
        {
          id: 'f1',
          sync_id: 'sync-f1',
          name: 'Academic',
          color: '#3b82f6',
          wordCount: 5,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 1000,
          deleted_at: null,
        },
      ];

      const incomingFolders: Folder[] = [
        {
          id: 'f1-remote',
          sync_id: 'sync-f1',
          name: 'Academic Vocab',
          color: '#6366f1',
          wordCount: 0,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 2000, // Newer
          deleted_at: null,
        },
        {
          id: 'f2-remote',
          sync_id: 'sync-f2',
          name: 'Idioms',
          color: '#10b981',
          wordCount: 0,
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: 1500,
          deleted_at: null,
        },
      ];

      const result = mergeFolders(localFolders, incomingFolders);
      expect(result.added).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.merged).toHaveLength(2);

      const f1 = result.merged.find((f) => f.sync_id === 'sync-f1')!;
      expect(f1.name).toBe('Academic Vocab');
      expect(f1.color).toBe('#6366f1');
    });

    it('propagates folder soft-deletion', () => {
      const localFolders: Folder[] = [
        {
          id: 'f1',
          sync_id: 'sync-f1',
          name: 'Old Folder',
          color: '#ef4444',
          wordCount: 0,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 1000,
          deleted_at: null,
        },
      ];

      const incomingFolders: Folder[] = [
        {
          id: 'f1-remote',
          sync_id: 'sync-f1',
          name: 'Old Folder',
          color: '#ef4444',
          wordCount: 0,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: 2000,
          deleted_at: 2000,
        },
      ];

      const result = mergeFolders(localFolders, incomingFolders);
      expect(result.deleted).toBe(1);
      expect(result.merged[0].deleted_at).toBe(2000);
    });
  });

  describe('mergeReviews (Lossless Deduplicated Union)', () => {
    it('losslessly combines reviews across nodes with deduplication by sync_id', () => {
      const localReviews: LocalReviewHistoryRecord[] = [
        {
          id: 'r1',
          sync_id: 'sync-r1',
          word_id: 'w1',
          rating: 'good',
          mastery_before: 0,
          mastery_after: 1,
          interval_step_before: 0,
          interval_step_after: 1,
          reviewed_at: '2026-01-01T10:00:00.000Z',
        },
        {
          id: 'r2',
          sync_id: 'sync-r2',
          word_id: 'w1',
          rating: 'easy',
          mastery_before: 1,
          mastery_after: 2,
          interval_step_before: 1,
          interval_step_after: 3,
          reviewed_at: '2026-01-04T10:00:00.000Z',
        },
      ];

      const incomingReviews: LocalReviewHistoryRecord[] = [
        // Duplicate review from sync
        {
          id: 'r1-dup',
          sync_id: 'sync-r1',
          word_id: 'w1',
          rating: 'good',
          mastery_before: 0,
          mastery_after: 1,
          interval_step_before: 0,
          interval_step_after: 1,
          reviewed_at: '2026-01-01T10:00:00.000Z',
        },
        // New review done on mobile node
        {
          id: 'r3-mobile',
          sync_id: 'sync-r3-mobile',
          word_id: 'w1',
          rating: 'good',
          mastery_before: 2,
          mastery_after: 3,
          interval_step_before: 3,
          interval_step_after: 4,
          reviewed_at: '2026-01-18T10:00:00.000Z',
        },
      ];

      const result = mergeReviews(localReviews, incomingReviews);
      expect(result.added).toBe(1);
      expect(result.merged).toHaveLength(3);
      expect(result.merged.map((r) => r.sync_id)).toEqual(['sync-r1', 'sync-r2', 'sync-r3-mobile']);
    });
  });

  describe('harmonizeWordLearningState (Deterministic Event Sourcing)', () => {
    it('correctly calculates unified learning state from merged review logs', () => {
      const word: Word = {
        id: 'w1',
        sync_id: 'sync-w1',
        word: 'tenacious',
        meaning: 'persistent',
        level: 'C1',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: 1000,
        deleted_at: null,
      };

      const reviews: LocalReviewHistoryRecord[] = [
        {
          id: 'r1',
          sync_id: 'sync-r1',
          word_id: 'w1',
          rating: 'good', // Step 0 -> Step 1 (3 days)
          mastery_before: 0,
          mastery_after: 1,
          interval_step_before: 0,
          interval_step_after: 1,
          reviewed_at: '2026-01-01T10:00:00.000Z',
        },
        {
          id: 'r2',
          sync_id: 'sync-r2',
          word_id: 'w1',
          rating: 'good', // Step 1 -> Step 2 (7 days)
          mastery_before: 1,
          mastery_after: 2,
          interval_step_before: 1,
          interval_step_after: 2,
          reviewed_at: '2026-01-04T10:00:00.000Z',
        },
        {
          id: 'r3',
          sync_id: 'sync-r3',
          word_id: 'w1',
          rating: 'good', // Step 2 -> Step 3 (14 days)
          mastery_before: 2,
          mastery_after: 3,
          interval_step_before: 2,
          interval_step_after: 3,
          reviewed_at: '2026-01-11T10:00:00.000Z',
        },
      ];

      const state = harmonizeWordLearningState(word, undefined, reviews);
      expect(state.review_count).toBe(3);
      expect(state.correct_count).toBe(3);
      expect(state.wrong_count).toBe(0);
      expect(state.consecutive_correct).toBe(3);
      expect(state.interval_step).toBe(3);
      expect(state.mastery).toBe(3);
      expect(state.last_reviewed).toBe('2026-01-11T10:00:00.000Z');
    });
  });
});

describe('SyncBundle Integration & LocalRepository Roundtrip', () => {
  let adapterA: IndexedDbAdapter;
  let repoA: LocalRepository;
  let adapterB: IndexedDbAdapter;
  let repoB: LocalRepository;

  beforeEach(async () => {
    const factoryA = createInMemoryIDBFactory();
    adapterA = new IndexedDbAdapter(`device_a_${generateId()}`, 2, factoryA);
    repoA = new LocalRepository(adapterA);

    const factoryB = createInMemoryIDBFactory();
    adapterB = new IndexedDbAdapter(`device_b_${generateId()}`, 2, factoryB);
    repoB = new LocalRepository(adapterB);
  });

  it('exports from Node A and non-destructively merges into Node B', async () => {
    // 1. Device A creates folder, words, and reviews
    const folderA = await repoA.createFolder('Travel', '#0284c7');
    const wordA1 = await repoA.createWord({
      word: 'itinerary',
      meaning: 'planned route',
      level: 'B1',
      folderIds: [folderA.id],
    });
    const wordA2 = await repoA.createWord({
      word: 'sojourn',
      meaning: 'temporary stay',
      level: 'C2',
      folderIds: [folderA.id],
    });

    await repoA.processReview(wordA1.id, 'good');

    // 2. Device B has its own independent word
    const wordB = await repoB.createWord({
      word: 'wanderlust',
      meaning: 'strong desire to travel',
      level: 'B2',
    });

    // 3. Export bundle from Device A
    const bundleA: SyncBundle = await repoA.exportSyncBundle();
    expect(bundleA.version).toBe(1);
    expect(bundleA.words).toHaveLength(2);
    expect(bundleA.folders).toHaveLength(1);
    expect(bundleA.review_history).toHaveLength(1);

    // 4. Merge bundle into Device B
    const mergeResult = await repoB.mergeSyncBundle(bundleA);
    expect(mergeResult.success).toBe(true);
    expect(mergeResult.wordsAdded).toBe(2);
    expect(mergeResult.foldersAdded).toBe(1);
    expect(mergeResult.reviewsMerged).toBe(1);

    // 5. Verify Device B contains all words (local + merged)
    const wordsOnB = await repoB.getWords();
    expect(wordsOnB).toHaveLength(3);
    expect(wordsOnB.map((w) => w.word).sort()).toEqual(['itinerary', 'sojourn', 'wanderlust']);

    // Verify Device B folder exists with correct word count
    const foldersOnB = await repoB.getFolders();
    expect(foldersOnB.folders).toHaveLength(1);
    expect(foldersOnB.folders[0].name).toBe('Travel');
    expect(foldersOnB.folders[0].wordCount).toBe(2);

    // Verify learning state on Device B reflects the review from Device A
    const itineraryOnB = wordsOnB.find((w) => w.word === 'itinerary')!;
    expect(itineraryOnB.learning_state.review_count).toBe(1);
    expect(itineraryOnB.learning_state.mastery).toBe(1);
  });

  it('propagates soft-delete bidirectionally between nodes', async () => {
    // 1. Node A creates word and exports to Node B
    const word = await repoA.createWord({
      word: 'transient',
      meaning: 'lasting only for a short time',
      level: 'C1',
    });
    const bundle1 = await repoA.exportSyncBundle();
    await repoB.mergeSyncBundle(bundle1);

    expect(await repoB.getWordById(word.id)).not.toBeNull();

    // 2. Node B soft-deletes the word
    const deletedOnB = await repoB.deleteWord(word.id);
    expect(deletedOnB).toBe(true);
    expect(await repoB.getWordById(word.id)).toBeNull();

    // 3. Node B exports sync bundle back to Node A
    const bundle2 = await repoB.exportSyncBundle();
    const mergeResultA = await repoA.mergeSyncBundle(bundle2);
    expect(mergeResultA.wordsDeleted).toBe(1);

    // 4. Verify Node A now sees the word as soft-deleted and hidden from active UI
    expect(await repoA.getWordById(word.id)).toBeNull();
    const wordsOnA = await repoA.getWords();
    expect(wordsOnA).toHaveLength(0);
  });
});
