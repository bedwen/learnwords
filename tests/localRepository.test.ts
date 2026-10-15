import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocalRepository,
  generateId,
  LocalFolderNotFoundError,
} from '../src/storage/localRepository';
import {
  IndexedDbAdapter,
  createInMemoryIDBFactory,
  LocalWordFolderRecord,
  LocalReviewHistoryRecord,
} from '../src/storage/indexedDb';
import { hydrateLocalDatabase, getLastHydratedAt } from '../src/storage/syncHydrator';
import { LearningState, Word } from '../src/types';

describe('LocalRepository & Autonomous Client-Side Storage', () => {
  let adapter: IndexedDbAdapter;
  let repo: LocalRepository;

  beforeEach(async () => {
    // Isolated in-memory IDB instance for each test suite run
    const testFactory = createInMemoryIDBFactory();
    adapter = new IndexedDbAdapter(`test_learnwords_${generateId()}`, 1, testFactory);
    repo = new LocalRepository(adapter);
  });

  describe('SRS Study Queue Scheduling Priorities', () => {
    it('prioritizes due reviews over new words, ordered by next_review ASC', async () => {
      const now = new Date();
      const past2Days = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
      const past5Days = new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString();
      const past10Days = new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString();
      const futureTomorrow = new Date(now.getTime() + 1 * 24 * 3600 * 1000).toISOString();

      // 1. Due Review 1 (past 2 days, mastery 1)
      const word1 = await repo.createWord({ word: 'ephemeral', meaning: 'short-lived', level: 'C1' });
      await adapter.put<LearningState>('learning_states', {
        id: word1.learning_state.id,
        word_id: word1.id,
        mastery: 1,
        interval_step: 1,
        next_review: past2Days,
        last_reviewed: null,
        review_count: 1,
        correct_count: 1,
        wrong_count: 0,
        consecutive_correct: 1,
      });

      // 2. Due Review 2 (past 5 days, mastery 2) - should come before Due Review 1
      const word2 = await repo.createWord({ word: 'serendipity', meaning: 'happy accident', level: 'B2' });
      await adapter.put<LearningState>('learning_states', {
        id: word2.learning_state.id,
        word_id: word2.id,
        mastery: 2,
        interval_step: 2,
        next_review: past5Days,
        last_reviewed: null,
        review_count: 2,
        correct_count: 2,
        wrong_count: 0,
        consecutive_correct: 2,
      });

      // 3. New Word (mastery 0, past 10 days) - even though next_review is oldest, mastery === 0 must be prioritized AFTER due reviews
      const word3 = await repo.createWord({ word: 'ubiquitous', meaning: 'everywhere', level: 'B2' });
      await adapter.put<LearningState>('learning_states', {
        id: word3.learning_state.id,
        word_id: word3.id,
        mastery: 0,
        interval_step: 0,
        next_review: past10Days,
        last_reviewed: null,
        review_count: 0,
        correct_count: 0,
        wrong_count: 0,
        consecutive_correct: 0,
      });

      // 4. Future word (mastery 1, not due) - should NOT be included in queue
      const word4 = await repo.createWord({ word: 'future', meaning: 'not yet due', level: 'A1' });
      await adapter.put<LearningState>('learning_states', {
        id: word4.learning_state.id,
        word_id: word4.id,
        mastery: 1,
        interval_step: 1,
        next_review: futureTomorrow,
        last_reviewed: null,
        review_count: 1,
        correct_count: 1,
        wrong_count: 0,
        consecutive_correct: 1,
      });

      const queue = await repo.getStudyQueue(10);

      // Only the 3 eligible cards are returned
      expect(queue).toHaveLength(3);

      // Priority ordering: Due reviews (mastery > 0) ordered by next_review ASC, followed by new words (mastery === 0)
      expect(queue[0].id).toBe(word2.id); // Due review (5 days ago)
      expect(queue[1].id).toBe(word1.id); // Due review (2 days ago)
      expect(queue[2].id).toBe(word3.id); // New word (mastery 0)
    });

    it('filters queue by folderId and ungrouped', async () => {
      const folder = await repo.createFolder('Academic', '#3b82f6');

      const wordInFolder = await repo.createWord({
        word: 'hypothesis',
        meaning: 'proposed explanation',
        level: 'B2',
        folderIds: [folder.id],
      });

      const wordUngrouped = await repo.createWord({
        word: 'dog',
        meaning: 'canine animal',
        level: 'A1',
      });

      const folderQueue = await repo.getStudyQueue(10, folder.id);
      expect(folderQueue.map((w) => w.id)).toContain(wordInFolder.id);
      expect(folderQueue.map((w) => w.id)).not.toContain(wordUngrouped.id);

      const ungroupedQueue = await repo.getStudyQueue(10, 'ungrouped');
      expect(ungroupedQueue.map((w) => w.id)).toContain(wordUngrouped.id);
      expect(ungroupedQueue.map((w) => w.id)).not.toContain(wordInFolder.id);
    });
  });

  describe('Local Review Processing with LearningEngine', () => {
    it('progresses New (0) to Learning (1) on Good and records review history', async () => {
      const word = await repo.createWord({ word: 'lucid', meaning: 'clear', level: 'B2' });
      expect(word.learning_state.mastery).toBe(0);
      expect(word.learning_state.interval_step).toBe(0);

      const updated = await repo.processReview(word.id, 'good');

      expect(updated.learning_state.mastery).toBe(1);
      expect(updated.learning_state.interval_step).toBe(1);
      expect(updated.learning_state.review_count).toBe(1);
      expect(updated.learning_state.correct_count).toBe(1);
      expect(updated.learning_state.wrong_count).toBe(0);
      expect(updated.learning_state.consecutive_correct).toBe(1);

      // Verify review_history entry in IndexedDB
      const history = await adapter.queryByIndex<LocalReviewHistoryRecord>(
        'review_history',
        'word_id',
        word.id
      );
      expect(history).toHaveLength(1);
      expect(history[0].rating).toBe('good');
      expect(history[0].mastery_before).toBe(0);
      expect(history[0].mastery_after).toBe(1);
      expect(history[0].interval_step_before).toBe(0);
      expect(history[0].interval_step_after).toBe(1);
    });

    it('regresses Strong (3) to Familiar (2) on Again and resets consecutive streak', async () => {
      const word = await repo.createWord({ word: 'resilient', meaning: 'tough', level: 'B2' });

      // Simulate a Strong state
      await adapter.put<LearningState>('learning_states', {
        id: word.learning_state.id,
        word_id: word.id,
        mastery: 3,
        interval_step: 4,
        next_review: new Date().toISOString(),
        last_reviewed: new Date().toISOString(),
        review_count: 5,
        correct_count: 5,
        wrong_count: 0,
        consecutive_correct: 5,
      });

      const updated = await repo.processReview(word.id, 'again');

      expect(updated.learning_state.mastery).toBe(2); // Strong -> Familiar
      expect(updated.learning_state.interval_step).toBe(3); // Regressed 1 step (4 -> 3)
      expect(updated.learning_state.review_count).toBe(6);
      expect(updated.learning_state.wrong_count).toBe(1);
      expect(updated.learning_state.consecutive_correct).toBe(0); // Reset
    });

    it('promotes to Mastered (4) when all deterministic criteria are satisfied', async () => {
      const word = await repo.createWord({ word: 'meticulous', meaning: 'thorough', level: 'C1' });

      // Populate history over 4 previous calendar days
      const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];
      for (const d of days) {
        await adapter.put<LocalReviewHistoryRecord>('review_history', {
          id: generateId(),
          word_id: word.id,
          rating: 'good',
          mastery_before: 3,
          mastery_after: 3,
          interval_step_before: 2,
          interval_step_after: 3,
          reviewed_at: `${d}T10:00:00.000Z`,
        });
      }

      // Strong state at interval step 3 (14 days). A Good rating advances to step 4 (30 days)
      await adapter.put<LearningState>('learning_states', {
        id: word.learning_state.id,
        word_id: word.id,
        mastery: 3,
        interval_step: 3,
        next_review: '2026-01-05T00:00:00.000Z',
        last_reviewed: '2026-01-04T10:00:00.000Z',
        review_count: 4,
        correct_count: 4,
        wrong_count: 0,
        consecutive_correct: 4,
      });

      const updated = await repo.processReview(word.id, 'good');

      expect(updated.learning_state.mastery).toBe(4); // Mastered!
      expect(updated.learning_state.interval_step).toBe(4); // 30 days
    });
  });

  describe('Cascade Deletion & Integrity Invariants', () => {
    it('completely cascades delete across learning_states, review_history, and word_folders', async () => {
      const folder = await repo.createFolder('GRE Prep', '#10b981');
      const word = await repo.createWord({
        word: 'cacophony',
        meaning: 'harsh noise',
        level: 'C2',
        folderIds: [folder.id],
      });

      // Perform reviews to create history records
      await repo.processReview(word.id, 'good');
      await repo.processReview(word.id, 'easy');

      // Verify records exist in all stores
      expect(await adapter.get('words', word.id)).toBeDefined();
      expect(
        await adapter.queryByIndex('learning_states', 'word_id', word.id)
      ).toHaveLength(1);
      expect(
        await adapter.queryByIndex('review_history', 'word_id', word.id)
      ).toHaveLength(2);
      expect(
        await adapter.queryByIndex('word_folders', 'word_id', word.id)
      ).toHaveLength(1);

      // Delete the word
      const deleted = await repo.deleteWord(word.id);
      expect(deleted).toBe(true);

      // Verify cascading removal
      expect(await adapter.get('words', word.id)).toBeUndefined();
      expect(
        await adapter.queryByIndex('learning_states', 'word_id', word.id)
      ).toHaveLength(0);
      expect(
        await adapter.queryByIndex('review_history', 'word_id', word.id)
      ).toHaveLength(0);
      expect(
        await adapter.queryByIndex('word_folders', 'word_id', word.id)
      ).toHaveLength(0);

      // Verify folder itself was NOT deleted
      const existingFolder = await repo.getFolderById(folder.id);
      expect(existingFolder).not.toBeNull();
      expect(existingFolder!.wordCount).toBe(0);
    });

    it('deleting a folder does not delete words (words become ungrouped)', async () => {
      const folder = await repo.createFolder('Tech', '#6366f1');
      const word = await repo.createWord({
        word: 'bandwidth',
        meaning: 'data capacity',
        level: 'B1',
        folderIds: [folder.id],
      });

      const deletedFolder = await repo.deleteFolder(folder.id);
      expect(deletedFolder).toBe(true);

      // Folder is gone
      expect(await repo.getFolderById(folder.id)).toBeNull();

      // Word remains intact and is now ungrouped
      const wordAfter = await repo.getWordById(word.id);
      expect(wordAfter).not.toBeNull();
      expect(wordAfter!.folderIds).toEqual([]);

      const folderList = await repo.getFolders();
      expect(folderList.ungroupedCount).toBe(1);
    });
  });

  describe('Word & Folder CRUD and Batch Operations', () => {
    it('supports getWords with search, level, status, and sorting', async () => {
      await repo.createWord({ word: 'apple', meaning: 'fruit', level: 'A1' });
      await repo.createWord({ word: 'avalanche', meaning: 'snow slide', level: 'B2' });
      await repo.createWord({ word: 'banana', meaning: 'yellow fruit', level: 'A1' });

      const a1Words = await repo.getWords({ level: 'A1' });
      expect(a1Words).toHaveLength(2);

      const fruitWords = await repo.getWords({ search: 'fruit' });
      expect(fruitWords).toHaveLength(2);

      const sortedByWordAsc = await repo.getWords({ sortBy: 'word', order: 'asc' });
      expect(sortedByWordAsc[0].word).toBe('apple');
      expect(sortedByWordAsc[1].word).toBe('avalanche');
      expect(sortedByWordAsc[2].word).toBe('banana');
    });

    it('batch updates CEFR level and batch deletes words', async () => {
      const w1 = await repo.createWord({ word: 'run', meaning: 'move fast', level: 'A1' });
      const w2 = await repo.createWord({ word: 'walk', meaning: 'move slow', level: 'A1' });

      const updatedCount = await repo.batchUpdateCefr([w1.id, w2.id], 'B1');
      expect(updatedCount).toBe(2);

      const afterUpdate = await repo.getWordById(w1.id);
      expect(afterUpdate!.level).toBe('B1');

      const deletedCount = await repo.batchDeleteWords([w1.id, w2.id]);
      expect(deletedCount).toBe(2);
      expect(await repo.getWordById(w1.id)).toBeNull();
    });

    it('batch updates folder associations and handles missing folder gracefully', async () => {
      const folder = await repo.createFolder('Verbs', '#eab308');
      const w1 = await repo.createWord({ word: 'listen', meaning: 'hear', level: 'A1' });
      const w2 = await repo.createWord({ word: 'speak', meaning: 'talk', level: 'A1' });

      await repo.batchUpdateFolder([w1.id, w2.id], folder.id, 'add');

      const folderData = await repo.getFolderById(folder.id);
      expect(folderData!.wordCount).toBe(2);

      await repo.batchUpdateFolder([w1.id], folder.id, 'remove');
      const folderDataAfter = await repo.getFolderById(folder.id);
      expect(folderDataAfter!.wordCount).toBe(1);

      await expect(
        repo.batchUpdateFolder([w2.id], 'non-existent-folder', 'add')
      ).rejects.toThrow(LocalFolderNotFoundError);
    });
  });

  describe('Home Summary Computation', () => {
    it('computes total words, due words, CEFR distribution, and activity streaks', async () => {
      const w1 = await repo.createWord({ word: 'basic', meaning: 'simple', level: 'A1' });
      const w2 = await repo.createWord({ word: 'advanced', meaning: 'complex', level: 'C1' });

      // Mark w1 as Mastered
      await adapter.put<LearningState>('learning_states', {
        id: w1.learning_state.id,
        word_id: w1.id,
        mastery: 4,
        interval_step: 4,
        next_review: new Date(Date.now() + 30 * 86400000).toISOString(), // Not due
        last_reviewed: new Date().toISOString(),
        review_count: 5,
        correct_count: 5,
        wrong_count: 0,
        consecutive_correct: 5,
      });

      // w2 is mastery 0 (New), so dueForReview should count it
      const summary = await repo.getHomeSummary();

      expect(summary.totalWords).toBe(2);
      expect(summary.dueForReview).toBe(1); // w2 is new

      const a1Stats = summary.cefrDistribution.find((s) => s.level === 'A1');
      expect(a1Stats?.totalWords).toBe(1);
      expect(a1Stats?.masteredWords).toBe(1);

      const c1Stats = summary.cefrDistribution.find((s) => s.level === 'C1');
      expect(c1Stats?.totalWords).toBe(1);
      expect(c1Stats?.masteredWords).toBe(0);

      expect(summary.activityDays).toBeDefined();
      expect(summary.activityDays!.length).toBeGreaterThan(90);
    });
  });

  describe('Backend Hydration Utility (syncHydrator)', () => {
    it('seeds uninitialized local IndexedDB from backend API response', async () => {
      const mockWords: any[] = [
        {
          id: 'mock-w1',
          word: 'quintessential',
          meaning: 'typical example',
          level: 'C2',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          learning_state: {
            id: 'mock-ls1',
            word_id: 'mock-w1',
            mastery: 3,
            interval_step: 3,
            next_review: '2026-01-02T00:00:00.000Z',
            review_count: 3,
            correct_count: 3,
            wrong_count: 0,
            consecutive_correct: 3,
          },
          folderIds: ['mock-f1'],
        },
      ];

      const mockFolders: any = {
        folders: [
          {
            id: 'mock-f1',
            name: 'Advanced Vocab',
            color: '#ec4899',
            wordCount: 1,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        ungroupedCount: 0,
      };

      const mockFetch: typeof fetch = async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/words')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockWords,
          } as Response;
        }
        if (urlStr.includes('/api/folders')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockFolders,
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      };

      // 1. Initial hydration
      const result = await hydrateLocalDatabase({
        adapter,
        fetchFn: mockFetch,
        apiBase: 'http://127.0.0.1:3001',
      });

      expect(result.success).toBe(true);
      expect(result.hydrated).toBe(true);
      expect(result.wordsCount).toBe(1);
      expect(result.foldersCount).toBe(1);
      expect(result.lastHydratedAt).toBeTruthy();

      const lastHydratedAt = await getLastHydratedAt(adapter);
      expect(lastHydratedAt).toBe(result.lastHydratedAt);

      // Verify data in IndexedDB
      const storedWord = await repo.getWordById('mock-w1');
      expect(storedWord).not.toBeNull();
      expect(storedWord!.word).toBe('quintessential');
      expect(storedWord!.folderIds).toContain('mock-f1');

      // 2. Second hydration without force should skip
      const secondResult = await hydrateLocalDatabase({
        adapter,
        fetchFn: mockFetch,
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.hydrated).toBe(false);
      expect(secondResult.reason).toBe('already_initialized');
    });
  });
});
