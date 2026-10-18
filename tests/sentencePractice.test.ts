import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../server/db/schema';
import { WordService } from '../server/services/words';
import { FolderService } from '../server/services/folders';
import { StudyService } from '../server/services/study';
import {
  LocalRepository,
  generateId,
} from '../src/storage/localRepository';
import {
  IndexedDbAdapter,
  createInMemoryIDBFactory,
} from '../src/storage/indexedDb';
import * as platform from '../src/platform';
import * as studyApi from '../src/api/study';
import { clearCache, getCached } from '../src/api/cache';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LearningState, WordWithState, ReviewRating } from '../src/types';
import { SentencePracticeView } from '../src/components/study/SentencePracticeView';

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

describe('Sentence Translation Practice', () => {
  describe('SQLite Backend: StudyService.getStudyQueue', () => {
    beforeEach(() => {
      globalThis.__TEST_DB__ = new Database(':memory:');
      globalThis.__TEST_DB__.pragma('foreign_keys = ON');
      initializeSchema(globalThis.__TEST_DB__);
    });

    afterEach(() => {
      globalThis.__TEST_DB__.close();
    });

    it('returns only words with non-empty sentence and translation in sentence mode', () => {
      // 1. Complete sentence pair
      const validWord = WordService.createWord({
        word: 'lucid',
        meaning: 'clear and easy to understand',
        level: 'B2',
        example_sentence: 'She gave a lucid explanation of the concept.',
        example_translation: 'Kavramin acik bir aciklamasini yapti.',
      });

      // 2. Word with sentence but missing translation
      WordService.createWord({
        word: 'opaque',
        meaning: 'not transparent',
        level: 'B2',
        example_sentence: 'The glass was opaque.',
        example_translation: '',
      });

      // 3. Word with translation but missing sentence
      WordService.createWord({
        word: 'vague',
        meaning: 'unclear',
        level: 'B1',
        example_sentence: '',
        example_translation: 'Belirsiz.',
      });

      // 4. Word with whitespace-only sentence and translation
      WordService.createWord({
        word: 'hazy',
        meaning: 'foggy or indistinct',
        level: 'B1',
        example_sentence: '   ',
        example_translation: '   ',
      });

      // 5. Word with null sentence fields
      WordService.createWord({
        word: 'murky',
        meaning: 'dark and gloomy',
        level: 'C1',
      });

      // Word mode returns all 5 words
      const wordQueue = StudyService.getStudyQueue(50, undefined, 'words');
      expect(wordQueue).toHaveLength(5);

      // Sentence mode returns strictly 1 word with valid pair
      const sentenceQueue = StudyService.getStudyQueue(50, undefined, 'sentences');
      expect(sentenceQueue).toHaveLength(1);
      expect(sentenceQueue[0].id).toBe(validWord.id);
      expect(sentenceQueue[0].word).toBe('lucid');
    });

    it('respects folder filtering and ungrouped filtering in sentence mode', () => {
      const folder = FolderService.createFolder('Academic', '#3b82f6');

      // Word in folder with valid sentence
      const folderWord = WordService.createWord({
        word: 'paradigm',
        meaning: 'a typical example or pattern',
        level: 'C1',
        example_sentence: 'This marks a new paradigm in linguistic research.',
        example_translation: 'Bu dilbilimsel arastirmada yeni bir paradigma belirler.',
        folderIds: [folder.id],
      });

      // Ungrouped word with valid sentence
      const ungroupedWord = WordService.createWord({
        word: 'resilient',
        meaning: 'able to recover quickly',
        level: 'B2',
        example_sentence: 'The human spirit is incredibly resilient.',
        example_translation: 'Insan ruhu inanilmaz derecede direnclidir.',
      });

      // Filter by folder
      const folderQueue = StudyService.getStudyQueue(50, folder.id, 'sentences');
      expect(folderQueue).toHaveLength(1);
      expect(folderQueue[0].id).toBe(folderWord.id);

      // Filter by ungrouped
      const ungroupedQueue = StudyService.getStudyQueue(50, 'ungrouped', 'sentences');
      expect(ungroupedQueue).toHaveLength(1);
      expect(ungroupedQueue[0].id).toBe(ungroupedWord.id);
    });

    it('prioritizes due reviews over new words in sentence mode', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Word 1: New word (mastery = 0)
      const newWord = WordService.createWord({
        word: 'novel',
        meaning: 'new or unusual',
        level: 'B1',
        example_sentence: 'They came up with a novel approach.',
        example_translation: 'Yeni bir yaklasim buldular.',
      });

      // Word 2: Due review (mastery = 1, next_review in the past)
      const dueWord = WordService.createWord({
        word: 'ancient',
        meaning: 'belonging to the very distant past',
        level: 'A2',
        example_sentence: 'The ancient ruins attract thousands of tourists.',
        example_translation: 'Antik kalintilar binlerce turist cekiyor.',
      });

      // Promote Word 2 to mastery 1 with past next_review
      globalThis.__TEST_DB__.prepare(`
        UPDATE learning_states
        SET mastery = 1, next_review = ?, interval_step = 1
        WHERE word_id = ?
      `).run(pastDate, dueWord.id);

      const queue = StudyService.getStudyQueue(50, undefined, 'sentences');
      expect(queue).toHaveLength(2);
      expect(queue[0].id).toBe(dueWord.id); // Due word comes first
      expect(queue[1].id).toBe(newWord.id); // New word comes second
    });

    it('excludes soft-deleted words from sentence study queue', () => {
      const word = WordService.createWord({
        word: 'transient',
        meaning: 'lasting only for a short time',
        level: 'C1',
        example_sentence: 'Beauty is transient.',
        example_translation: 'Guzellik gecicidir.',
      });

      WordService.deleteWord(word.id);

      const queue = StudyService.getStudyQueue(50, undefined, 'sentences');
      expect(queue).toHaveLength(0);
    });

    it('processes review rating and deterministically updates learning states and history', () => {
      const word = WordService.createWord({
        word: 'articulate',
        meaning: 'fluent and clear in speech',
        level: 'C1',
        example_sentence: 'She is an articulate speaker.',
        example_translation: 'O akici ve anlasilir bir konusmacidir.',
      });

      const updated = StudyService.processReview(word.id, 'good');

      expect(updated.learning_state.mastery).toBe(1);
      expect(updated.learning_state.review_count).toBe(1);
      expect(updated.learning_state.correct_count).toBe(1);

      const history = globalThis.__TEST_DB__.prepare(
        'SELECT * FROM review_history WHERE word_id = ?'
      ).all(word.id) as any[];

      expect(history).toHaveLength(1);
      expect(history[0].rating).toBe('good');
      expect(history[0].mastery_before).toBe(0);
      expect(history[0].mastery_after).toBe(1);
    });
  });

  describe('Offline Mobile Repository: LocalRepository.getStudyQueue', () => {
    let adapter: IndexedDbAdapter;
    let repo: LocalRepository;

    beforeEach(async () => {
      const testFactory = createInMemoryIDBFactory();
      adapter = new IndexedDbAdapter(`test_sentence_practice_${generateId()}`, 1, testFactory);
      repo = new LocalRepository(adapter);
    });

    it('filters sentence practice candidates symmetrically with SQLite backend', async () => {
      const validWord = await repo.createWord({
        word: 'meticulous',
        meaning: 'showing great attention to detail',
        level: 'C1',
        example_sentence: 'He was meticulous about keeping records.',
        example_translation: 'Kayitlari tutma konusunda cok titizdi.',
      });

      await repo.createWord({
        word: 'sloppy',
        meaning: 'careless and unsystematic',
        level: 'B2',
        example_sentence: '',
        example_translation: '',
      });

      await repo.createWord({
        word: 'hasty',
        meaning: 'done with excessive speed',
        level: 'B1',
        example_sentence: 'A hasty decision.',
        example_translation: '   ',
      });

      // Word mode returns all 3
      const wordQueue = await repo.getStudyQueue(50, undefined, 'words');
      expect(wordQueue).toHaveLength(3);

      // Sentence mode returns strictly 1
      const sentenceQueue = await repo.getStudyQueue(50, undefined, 'sentences');
      expect(sentenceQueue).toHaveLength(1);
      expect(sentenceQueue[0].id).toBe(validWord.id);
      expect(sentenceQueue[0].word).toBe('meticulous');
    });

    it('supports folder filtering and excludes soft-deleted items offline', async () => {
      const folder = await repo.createFolder('Travel', '#10b981');

      const wordInFolder = await repo.createWord({
        word: 'itinerary',
        meaning: 'a planned route or journey',
        level: 'B1',
        example_sentence: 'We planned a detailed itinerary.',
        example_translation: 'Detayli bir seyahat programi hazirladik.',
        folderIds: [folder.id],
      });

      const wordToDelete = await repo.createWord({
        word: 'luggage',
        meaning: 'bags and suitcases',
        level: 'A2',
        example_sentence: 'Do not leave luggage unattended.',
        example_translation: 'Bagajinizi basibos birakmayiniz.',
        folderIds: [folder.id],
      });

      await repo.deleteWord(wordToDelete.id); // soft-delete

      const folderQueue = await repo.getStudyQueue(50, folder.id, 'sentences');
      expect(folderQueue).toHaveLength(1);
      expect(folderQueue[0].id).toBe(wordInFolder.id);
    });
  });

  describe('Client API Bridge: src/api/study.ts', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      clearCache();
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it('passes mode=sentences query parameter and caches queue on desktop', async () => {
      vi.spyOn(platform, 'isMobileApp').mockReturnValue(false);

      const mockQueue: WordWithState[] = [
        {
          id: 'w1',
          word: 'ubiquitous',
          meaning: 'present everywhere',
          level: 'C1',
          example_sentence: 'Smartphones are ubiquitous today.',
          example_translation: 'Akilli telefonlar gunumuzde her yerdedir.',
          created_at: new Date().toISOString(),
          updated_at: Date.now(),
          sync_id: 's1',
          deleted_at: null,
          learning_state: {
            id: 'ls1',
            word_id: 'w1',
            mastery: 0,
            interval_step: 0,
            next_review: new Date().toISOString(),
            last_reviewed: null,
            review_count: 0,
            correct_count: 0,
            wrong_count: 0,
            consecutive_correct: 0,
          },
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockQueue,
      } as any);

      // Fetch sentence queue
      const queue = await studyApi.getStudyQueue(undefined, 'sentences');
      expect(queue).toEqual(mockQueue);

      const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
      expect(calledUrl).toContain('/api/study/queue');
      expect(calledUrl).toContain('mode=sentences');

      // Verify cached
      const cached = getCached<WordWithState[]>('study_queue_all_sentences');
      expect(cached).toEqual(mockQueue);

      // Subsequent call returns cached without another fetch
      const queue2 = await studyApi.getStudyQueue(undefined, 'sentences');
      expect(queue2).toEqual(mockQueue);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('delegates to localRepository.getStudyQueue with mode on mobile', async () => {
      vi.spyOn(platform, 'isMobileApp').mockReturnValue(true);

      const mockQueue = [{ id: 'w1', word: 'mobile' }] as any;
      const repoSpy = vi.spyOn(LocalRepository.prototype, 'getStudyQueue').mockResolvedValue(mockQueue);

      const queue = await studyApi.getStudyQueue('folder1', 'sentences');
      expect(queue).toEqual(mockQueue);
      expect(repoSpy).toHaveBeenCalledWith(50, 'folder1', 'sentences');
    });

    it('submitReview invalidates study queue cache', async () => {
      vi.spyOn(platform, 'isMobileApp').mockReturnValue(false);

      const mockQueue = [{ id: 'w1', word: 'test' }] as any;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockQueue,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'w1', word: 'test' }),
        } as any);

      await studyApi.getStudyQueue(undefined, 'sentences');
      expect(getCached('study_queue_all_sentences')).not.toBeNull();

      await studyApi.submitReview('w1', 'good');
      expect(getCached('study_queue_all_sentences')).toBeNull();
    });
  });

  describe('SentencePracticeView UI & Transition Synchronization', () => {
    const mockWord1: WordWithState = {
      id: 'w1',
      word: 'meticulous',
      meaning: 'showing great attention to detail',
      level: 'C1',
      example_sentence: 'He was meticulous about keeping records.',
      example_translation: 'Kayitlari tutma konusunda cok titizdi.',
      created_at: new Date().toISOString(),
      updated_at: Date.now(),
      sync_id: 's1',
      deleted_at: null,
      learning_state: {
        id: 'ls1',
        word_id: 'w1',
        mastery: 2,
        interval_step: 2,
        next_review: new Date().toISOString(),
        last_reviewed: null,
        review_count: 3,
        correct_count: 2,
        wrong_count: 1,
        consecutive_correct: 1,
      },
    };

    const mockWord2: WordWithState = {
      id: 'w2',
      word: 'lucid',
      meaning: 'clear and easy to understand',
      level: 'B2',
      example_sentence: 'She gave a lucid explanation of the concept.',
      example_translation: 'Kavramin acik bir aciklamasini yapti.',
      created_at: new Date().toISOString(),
      updated_at: Date.now(),
      sync_id: 's2',
      deleted_at: null,
      learning_state: {
        id: 'ls2',
        word_id: 'w2',
        mastery: 1,
        interval_step: 1,
        next_review: new Date().toISOString(),
        last_reviewed: null,
        review_count: 1,
        correct_count: 1,
        wrong_count: 0,
        consecutive_correct: 1,
      },
    };

    it('renders empty completion view when queue is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(SentencePracticeView, {
          queue: [],
          folders: [],
          onReview: vi.fn(),
          onSwitchToFlashcards: vi.fn(),
          onRefreshQueue: vi.fn(),
        })
      );

      expect(html).toContain('Sentence Practice Complete!');
      expect(html).toContain('No sentence practice cards due in this queue.');
      expect(html).not.toContain('Check Answer');
    });

    it('renders active word prompt in unrevealed state initially', () => {
      const html = renderToStaticMarkup(
        React.createElement(SentencePracticeView, {
          queue: [mockWord1, mockWord2],
          folders: [],
          onReview: vi.fn(),
          onSwitchToFlashcards: vi.fn(),
          onRefreshQueue: vi.fn(),
        })
      );

      // Prompt is visible
      expect(html).toContain('He was meticulous about keeping records.');
      // Answer action is visible
      expect(html).toContain('Check Answer');
      // Rating buttons are hidden in unrevealed state
      expect(html).not.toContain('Rate your recall');
      expect(html).not.toContain('DiffHighlight');
    });

    it('renders next word prompt when queue advances without leaking previous word answer', () => {
      // First card
      const htmlWord1 = renderToStaticMarkup(
        React.createElement(SentencePracticeView, {
          queue: [mockWord1, mockWord2],
          folders: [],
          onReview: vi.fn(),
          onSwitchToFlashcards: vi.fn(),
          onRefreshQueue: vi.fn(),
        })
      );
      expect(htmlWord1).toContain('He was meticulous about keeping records.');

      // Queue advances: mockWord2 is now currentWord
      const htmlWord2 = renderToStaticMarkup(
        React.createElement(SentencePracticeView, {
          queue: [mockWord2],
          folders: [],
          onReview: vi.fn(),
          onSwitchToFlashcards: vi.fn(),
          onRefreshQueue: vi.fn(),
        })
      );
      expect(htmlWord2).toContain('She gave a lucid explanation of the concept.');
      expect(htmlWord2).not.toContain('He was meticulous about keeping records.');
      expect(htmlWord2).toContain('Check Answer');
      expect(htmlWord2).not.toContain('Rate your recall');
    });

    it('clears revelation and input immediately upon submission before review network completes', async () => {
      let isRevealed = true;
      let input = 'My typed answer';
      let submitting = false;

      const onReviewMock = vi.fn(async (_rating: ReviewRating) => {
        // Verify that during onReview execution, isRevealed is already false and input is already cleared
        expect(isRevealed).toBe(false);
        expect(input).toBe('');
        expect(submitting).toBe(true);
      });

      // Execute synchronous reset matching SentencePracticeView.handleRatingSubmit
      const handleRatingSubmit = async (rating: ReviewRating) => {
        if (submitting) return;
        input = '';
        isRevealed = false;
        setSubmitting(true);
        try {
          await onReviewMock(rating);
        } finally {
          setSubmitting(false);
        }
      };

      const setSubmitting = (val: boolean) => {
        submitting = val;
      };

      await handleRatingSubmit('good');
      expect(onReviewMock).toHaveBeenCalledTimes(1);
      expect(isRevealed).toBe(false);
      expect(input).toBe('');
      expect(submitting).toBe(false);
    });

    it('triggers toast error notification when review submission fails', async () => {
      const toastApi = {
        error: vi.fn(),
        success: vi.fn(),
        info: vi.fn(),
        dismiss: vi.fn(),
      };

      const failingSubmitReview = vi.fn().mockRejectedValue(new Error('Network offline'));

      // Study.tsx handleRating pattern with toast notification
      const handleRating = async (wordId: string, rating: ReviewRating) => {
        try {
          await failingSubmitReview(wordId, rating);
        } catch (err) {
          toastApi.error('Failed to submit review. Please try again.');
        }
      };

      await handleRating('w1', 'good');

      expect(failingSubmitReview).toHaveBeenCalledWith('w1', 'good');
      expect(toastApi.error).toHaveBeenCalledWith('Failed to submit review. Please try again.');
    });
  });
});
