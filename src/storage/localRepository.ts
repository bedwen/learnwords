import {
  Word,
  LearningState,
  WordWithState,
  CreateWordDto,
  UpdateWordDto,
  Folder,
  FolderListResponse,
  HomeSummary,
  ActivityDay,
  CEFRLevel,
  ReviewRating,
} from '../types';
import { LearningEngine } from '../learning/learningEngine';
import {
  IndexedDbAdapter,
  indexedDbAdapter,
  LocalWordFolderRecord,
  LocalReviewHistoryRecord,
} from './indexedDb';

export const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export class LocalFolderNotFoundError extends Error {
  constructor(message = 'Folder not found') {
    super(message);
    this.name = 'LocalFolderNotFoundError';
  }
}

/**
 * Pure TypeScript & Web API standard UUID generator.
 * Zero external packages.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Autonomous Local Repository & Study Service.
 * Implements 100% offline, standalone client-side operations on native IndexedDB.
 */
export class LocalRepository {
  constructor(private adapter: IndexedDbAdapter = indexedDbAdapter) {}

  /**
   * Generates the study queue according to SRS scheduling priorities:
   * 1. Due reviews (next_review <= now)
   * 2. New words (mastery === 0)
   * Prioritizes due reviews over new words, ordered by next_review ASC.
   * Supports optional folder filtering (including 'ungrouped').
   */
  async getStudyQueue(limit = 50, folderId?: string): Promise<WordWithState[]> {
    const nowIso = new Date().toISOString();

    const [allWords, allStates, allWordFolders] = await Promise.all([
      this.adapter.getAll<Word>('words'),
      this.adapter.getAll<LearningState>('learning_states'),
      this.adapter.getAll<LocalWordFolderRecord>('word_folders'),
    ]);

    const stateMap = new Map<string, LearningState>();
    for (const state of allStates) {
      stateMap.set(state.word_id, state);
    }

    const folderMap = new Map<string, string[]>();
    for (const wf of allWordFolders) {
      const existing = folderMap.get(wf.word_id) || [];
      existing.push(wf.folder_id);
      folderMap.set(wf.word_id, existing);
    }

    // Join and filter candidates
    const candidates: WordWithState[] = [];

    for (const word of allWords) {
      const state = stateMap.get(word.id) || this.createDefaultState(word.id, word.created_at);
      const folderIds = folderMap.get(word.id) || [];

      // Folder filtering
      if (folderId === 'ungrouped') {
        if (folderIds.length > 0) continue;
      } else if (folderId && folderId !== 'all') {
        if (!folderIds.includes(folderId)) continue;
      }

      // Check due condition: next_review <= now OR mastery === 0
      const isDue = state.next_review <= nowIso || state.mastery === 0;
      if (isDue) {
        candidates.push({
          ...word,
          learning_state: state,
          folderIds,
        });
      }
    }

    // Sort: Due reviews (mastery > 0) first, then new words (mastery === 0)
    // Within same priority, order by next_review ASC
    candidates.sort((a, b) => {
      const aIsNew = a.learning_state.mastery === 0 ? 1 : 0;
      const bIsNew = b.learning_state.mastery === 0 ? 1 : 0;
      if (aIsNew !== bIsNew) {
        return aIsNew - bIsNew;
      }
      return a.learning_state.next_review.localeCompare(b.learning_state.next_review);
    });

    return candidates.slice(0, limit);
  }

  /**
   * Deterministically processes a review rating using Universal LearningEngine.
   * Atomically updates learning_states and appends to review_history in IndexedDB.
   */
  async processReview(wordId: string, rating: ReviewRating): Promise<WordWithState> {
    const wordWithState = await this.getWordById(wordId);
    if (!wordWithState) {
      throw new Error(`Word not found: ${wordId}`);
    }

    const currentState = wordWithState.learning_state;
    const nowIso = new Date().toISOString();

    // Fetch review history for this word
    const allHistory = await this.adapter.queryByIndex<LocalReviewHistoryRecord>(
      'review_history',
      'word_id',
      wordId
    );
    allHistory.sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));

    // Pure deterministic calculation
    const engineResult = LearningEngine.processReview(currentState, allHistory, rating, nowIso);

    // Update review counters
    const isCorrect = rating === 'good' || rating === 'easy';
    const newReviewCount = currentState.review_count + 1;
    const newCorrectCount = currentState.correct_count + (isCorrect ? 1 : 0);
    const newWrongCount = currentState.wrong_count + (isCorrect ? 0 : 1);
    const newConsecutive = isCorrect ? currentState.consecutive_correct + 1 : 0;

    const updatedState: LearningState = {
      ...currentState,
      mastery: engineResult.mastery,
      interval_step: engineResult.interval_step,
      next_review: engineResult.next_review,
      last_reviewed: nowIso,
      review_count: newReviewCount,
      correct_count: newCorrectCount,
      wrong_count: newWrongCount,
      consecutive_correct: newConsecutive,
    };

    const newHistoryRecord: LocalReviewHistoryRecord = {
      id: generateId(),
      word_id: wordId,
      rating,
      mastery_before: currentState.mastery,
      mastery_after: engineResult.mastery,
      interval_step_before: currentState.interval_step,
      interval_step_after: engineResult.interval_step,
      reviewed_at: nowIso,
    };

    // Save state and history
    await Promise.all([
      this.adapter.put('learning_states', updatedState),
      this.adapter.put('review_history', newHistoryRecord),
    ]);

    return {
      ...wordWithState,
      learning_state: updatedState,
    };
  }

  /**
   * Get words with optional search, level, status, folder, and sorting filters.
   */
  async getWords(options?: {
    search?: string;
    level?: string;
    status?: string; // "New", "Learning", "Familiar", "Strong", "Mastered"
    sortBy?: 'created_at' | 'word';
    order?: 'asc' | 'desc';
    folderId?: string;
  }): Promise<WordWithState[]> {
    const [allWords, allStates, allWordFolders] = await Promise.all([
      this.adapter.getAll<Word>('words'),
      this.adapter.getAll<LearningState>('learning_states'),
      this.adapter.getAll<LocalWordFolderRecord>('word_folders'),
    ]);

    const stateMap = new Map<string, LearningState>();
    for (const state of allStates) {
      stateMap.set(state.word_id, state);
    }

    const folderMap = new Map<string, string[]>();
    for (const wf of allWordFolders) {
      const existing = folderMap.get(wf.word_id) || [];
      existing.push(wf.folder_id);
      folderMap.set(wf.word_id, existing);
    }

    const statusMap: Record<string, number> = {
      New: 0,
      Learning: 1,
      Familiar: 2,
      Strong: 3,
      Mastered: 4,
    };

    const searchLower = options?.search ? options.search.trim().toLowerCase() : undefined;
    const targetMastery = options?.status ? statusMap[options.status] : undefined;

    let results: WordWithState[] = [];

    for (const word of allWords) {
      const state = stateMap.get(word.id) || this.createDefaultState(word.id, word.created_at);
      const folderIds = folderMap.get(word.id) || [];

      // Folder filter
      if (options?.folderId === 'ungrouped') {
        if (folderIds.length > 0) continue;
      } else if (options?.folderId && options.folderId !== 'all') {
        if (!folderIds.includes(options.folderId)) continue;
      }

      // Search filter (word or meaning)
      if (searchLower) {
        const matchesWord = word.word.toLowerCase().includes(searchLower);
        const matchesMeaning = word.meaning.toLowerCase().includes(searchLower);
        if (!matchesWord && !matchesMeaning) continue;
      }

      // Level filter
      if (options?.level && word.level !== options.level) {
        continue;
      }

      // Status filter
      if (targetMastery !== undefined && state.mastery !== targetMastery) {
        continue;
      }

      results.push({
        ...word,
        learning_state: state,
        folderIds,
      });
    }

    // Sort
    const sortBy = options?.sortBy === 'word' ? 'word' : 'created_at';
    const isAsc = options?.order === 'asc';

    results.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'word') {
        cmp = a.word.localeCompare(b.word);
      } else {
        cmp = a.created_at.localeCompare(b.created_at);
      }
      return isAsc ? cmp : -cmp;
    });

    return results;
  }

  /**
   * Get single word by ID with full state and folder associations.
   */
  async getWordById(id: string): Promise<WordWithState | null> {
    const word = await this.adapter.get<Word>('words', id);
    if (!word) return null;

    const state = await this.getLearningStateByWordId(id, word.created_at);
    const folderIds = await this.getWordFolderIds(id);

    return {
      ...word,
      learning_state: state,
      folderIds,
    };
  }

  /**
   * Creates a new word, initial learning state, and folder links.
   */
  async createWord(data: CreateWordDto): Promise<WordWithState> {
    const wordId = generateId();
    const stateId = generateId();
    const nowIso = new Date().toISOString();

    const word: Word = {
      id: wordId,
      word: data.word.trim(),
      meaning: data.meaning.trim(),
      level: data.level,
      part_of_speech: data.part_of_speech?.trim() || null,
      example_sentence: data.example_sentence?.trim() || null,
      example_translation: data.example_translation?.trim() || null,
      notes: data.notes?.trim() || null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const learningState: LearningState = {
      id: stateId,
      word_id: wordId,
      mastery: 0,
      interval_step: 0,
      next_review: nowIso,
      last_reviewed: null,
      review_count: 0,
      correct_count: 0,
      wrong_count: 0,
      consecutive_correct: 0,
    };

    const puts: Promise<any>[] = [
      this.adapter.put('words', word),
      this.adapter.put('learning_states', learningState),
    ];

    const folderIds = data.folderIds || [];
    for (const fId of folderIds) {
      puts.push(
        this.adapter.put<LocalWordFolderRecord>('word_folders', {
          id: `${wordId}_${fId}`,
          word_id: wordId,
          folder_id: fId,
        })
      );
    }

    await Promise.all(puts);

    return {
      ...word,
      learning_state: learningState,
      folderIds,
    };
  }

  /**
   * Updates an existing word and its folder associations.
   */
  async updateWord(id: string, data: UpdateWordDto): Promise<WordWithState | null> {
    const existing = await this.adapter.get<Word>('words', id);
    if (!existing) return null;

    const nowIso = new Date().toISOString();

    const updatedWord: Word = {
      ...existing,
      word: data.word !== undefined ? data.word.trim() : existing.word,
      meaning: data.meaning !== undefined ? data.meaning.trim() : existing.meaning,
      level: data.level !== undefined ? data.level : existing.level,
      part_of_speech:
        data.part_of_speech !== undefined
          ? data.part_of_speech ? data.part_of_speech.trim() : null
          : existing.part_of_speech,
      example_sentence:
        data.example_sentence !== undefined
          ? data.example_sentence ? data.example_sentence.trim() : null
          : existing.example_sentence,
      example_translation:
        data.example_translation !== undefined
          ? data.example_translation ? data.example_translation.trim() : null
          : existing.example_translation,
      notes:
        data.notes !== undefined
          ? data.notes ? data.notes.trim() : null
          : existing.notes,
      updated_at: nowIso,
    };

    await this.adapter.put('words', updatedWord);

    // Update folder associations if provided
    if (data.folderIds !== undefined) {
      await this.setWordFolders(id, data.folderIds);
    }

    return this.getWordById(id);
  }

  /**
   * Cascading word deletion:
   * Removes word, associated learning state(s), review history, and word_folders.
   */
  async deleteWord(id: string): Promise<boolean> {
    const word = await this.adapter.get<Word>('words', id);
    if (!word) return false;

    // Fetch and remove cascading associations
    const [states, history, wordFolders] = await Promise.all([
      this.adapter.queryByIndex<LearningState>('learning_states', 'word_id', id),
      this.adapter.queryByIndex<LocalReviewHistoryRecord>('review_history', 'word_id', id),
      this.adapter.queryByIndex<LocalWordFolderRecord>('word_folders', 'word_id', id),
    ]);

    const deletes: Promise<void>[] = [
      this.adapter.delete('words', id),
    ];

    for (const state of states) {
      deletes.push(this.adapter.delete('learning_states', state.id));
    }
    for (const h of history) {
      deletes.push(this.adapter.delete('review_history', h.id));
    }
    for (const wf of wordFolders) {
      deletes.push(this.adapter.delete('word_folders', wf.id));
    }

    await Promise.all(deletes);
    return true;
  }

  /**
   * Batch updates the CEFR level for a list of words without altering learning states.
   */
  async batchUpdateCefr(wordIds: string[], level: CEFRLevel): Promise<number> {
    if (!CEFR_LEVELS.includes(level)) {
      throw new Error('Invalid CEFR level');
    }
    const uniqueIds = Array.from(new Set(wordIds));
    if (uniqueIds.length === 0) return 0;

    let updatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const id of uniqueIds) {
      const word = await this.adapter.get<Word>('words', id);
      if (word) {
        word.level = level;
        word.updated_at = nowIso;
        await this.adapter.put('words', word);
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Batch deletes words with complete cascading cleanup.
   */
  async batchDeleteWords(wordIds: string[]): Promise<number> {
    const uniqueIds = Array.from(new Set(wordIds));
    let deletedCount = 0;

    for (const id of uniqueIds) {
      const deleted = await this.deleteWord(id);
      if (deleted) deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Batch add or remove words from a folder.
   */
  async batchUpdateFolder(wordIds: string[], folderId: string, action: 'add' | 'remove'): Promise<void> {
    const folder = await this.adapter.get<Folder>('folders', folderId);
    if (!folder) {
      throw new LocalFolderNotFoundError();
    }

    const uniqueIds = Array.from(new Set(wordIds));
    if (uniqueIds.length === 0) return;

    for (const wordId of uniqueIds) {
      const recordId = `${wordId}_${folderId}`;
      if (action === 'add') {
        const existingWord = await this.adapter.get<Word>('words', wordId);
        if (existingWord) {
          await this.adapter.put<LocalWordFolderRecord>('word_folders', {
            id: recordId,
            word_id: wordId,
            folder_id: folderId,
          });
        }
      } else {
        await this.adapter.delete('word_folders', recordId);
      }
    }
  }

  /**
   * Lists all folders with exact word counts, plus ungrouped count.
   */
  async getFolders(): Promise<FolderListResponse> {
    const [allFolders, allWords, allWordFolders] = await Promise.all([
      this.adapter.getAll<Folder>('folders'),
      this.adapter.getAll<Word>('words'),
      this.adapter.getAll<LocalWordFolderRecord>('word_folders'),
    ]);

    // Word counts per folder
    const folderCountMap = new Map<string, number>();
    const wordsWithFolder = new Set<string>();

    for (const wf of allWordFolders) {
      folderCountMap.set(wf.folder_id, (folderCountMap.get(wf.folder_id) || 0) + 1);
      wordsWithFolder.add(wf.word_id);
    }

    const ungroupedCount = allWords.filter(w => !wordsWithFolder.has(w.id)).length;

    const folders: Folder[] = allFolders.map((f) => ({
      ...f,
      wordCount: folderCountMap.get(f.id) || 0,
    }));

    // Order by created_at ASC matching server behavior
    folders.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return {
      folders,
      ungroupedCount,
    };
  }

  /**
   * Get single folder by ID.
   */
  async getFolderById(id: string): Promise<Folder | null> {
    const folder = await this.adapter.get<Folder>('folders', id);
    if (!folder) return null;

    const allWordFolders = await this.adapter.queryByIndex<LocalWordFolderRecord>(
      'word_folders',
      'folder_id',
      id
    );

    return {
      ...folder,
      wordCount: allWordFolders.length,
    };
  }

  /**
   * Create new folder.
   */
  async createFolder(name: string, color = '#94a3b8'): Promise<Folder> {
    const folderId = generateId();
    const nowIso = new Date().toISOString();

    const folder: Folder = {
      id: folderId,
      name: name.trim(),
      color: color.trim() || '#94a3b8',
      wordCount: 0,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await this.adapter.put('folders', folder);
    return folder;
  }

  /**
   * Update folder name or color.
   */
  async updateFolder(id: string, data: { name?: string; color?: string }): Promise<Folder | null> {
    const folder = await this.getFolderById(id);
    if (!folder) return null;

    const nowIso = new Date().toISOString();
    const updated: Folder = {
      ...folder,
      name: data.name !== undefined ? data.name.trim() : folder.name,
      color: data.color !== undefined ? data.color.trim() : folder.color,
      updated_at: nowIso,
    };

    await this.adapter.put('folders', updated);
    return updated;
  }

  /**
   * Delete folder. Words are preserved and become ungrouped.
   */
  async deleteFolder(id: string): Promise<boolean> {
    const folder = await this.adapter.get<Folder>('folders', id);
    if (!folder) return false;

    // Delete folder
    await this.adapter.delete('folders', id);

    // Delete folder links (words remain intact)
    const links = await this.adapter.queryByIndex<LocalWordFolderRecord>(
      'word_folders',
      'folder_id',
      id
    );
    await Promise.all(links.map((link) => this.adapter.delete('word_folders', link.id)));

    return true;
  }

  /**
   * Computes the Home / Dashboard summary locally from IndexedDB.
   */
  async getHomeSummary(): Promise<HomeSummary> {
    const [allWords, allStates, allHistory] = await Promise.all([
      this.adapter.getAll<Word>('words'),
      this.adapter.getAll<LearningState>('learning_states'),
      this.adapter.getAll<LocalReviewHistoryRecord>('review_history'),
    ]);

    const nowIso = new Date().toISOString();
    const totalWords = allWords.length;

    // Due for review: next_review <= now OR mastery = 0
    let dueForReview = 0;
    const stateMap = new Map<string, LearningState>();
    for (const state of allStates) {
      stateMap.set(state.word_id, state);
    }

    for (const word of allWords) {
      const state = stateMap.get(word.id);
      if (!state || state.next_review <= nowIso || state.mastery === 0) {
        dueForReview++;
      }
    }

    // CEFR distribution
    const cefrDistribution = CEFR_LEVELS.map((level) => {
      let levelTotal = 0;
      let mastered = 0;

      for (const word of allWords) {
        if (word.level === level) {
          levelTotal++;
          const st = stateMap.get(word.id);
          if (st && st.mastery === 4) {
            mastered++;
          }
        }
      }

      return {
        level,
        totalWords: levelTotal,
        masteredWords: mastered,
      };
    });

    // 13 weeks (~90 days) activity calendar
    const reviewsMap = new Map<string, number>();
    for (const rev of allHistory) {
      const dateStr = rev.reviewed_at.split('T')[0];
      reviewsMap.set(dateStr, (reviewsMap.get(dateStr) || 0) + 1);
    }

    const wordsMap = new Map<string, number>();
    for (const w of allWords) {
      const dateStr = w.created_at.split('T')[0];
      wordsMap.set(dateStr, (wordsMap.get(dateStr) || 0) + 1);
    }

    const today = new Date();
    const dayOfWeek = today.getUTCDay();
    const totalDays = 13 * 7 + dayOfWeek + 1;

    const activityDays: ActivityDay[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const reviews = reviewsMap.get(dateStr) || 0;
      const wordsAdded = wordsMap.get(dateStr) || 0;
      const count = reviews + wordsAdded;
      activityDays.push({
        date: dateStr,
        count,
        reviews,
        wordsAdded,
      });
    }

    const activeDaysLast90 = activityDays.filter((d) => d.count > 0).length;
    const totalContributionsLast90 = activityDays.reduce((acc, d) => acc + d.count, 0);

    let currentStreak = 0;
    const todayIndex = activityDays.length - 1;
    if (todayIndex >= 0) {
      let startIndex = -1;
      if (activityDays[todayIndex].count > 0) {
        startIndex = todayIndex;
      } else if (todayIndex > 0 && activityDays[todayIndex - 1].count > 0) {
        startIndex = todayIndex - 1;
      }

      if (startIndex >= 0) {
        for (let i = startIndex; i >= 0; i--) {
          if (activityDays[i].count > 0) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
    }

    return {
      totalWords,
      dueForReview,
      cefrDistribution,
      activityDays,
      activeDaysLast90,
      totalContributionsLast90,
      activeDaysLastYear: activeDaysLast90,
      totalContributionsLastYear: totalContributionsLast90,
      reviewActivity: activityDays,
      activeDaysLast60: activeDaysLast90,
      totalReviewsLast60: totalContributionsLast90,
      currentStreak,
    };
  }

  // --- Internal Helpers ---

  private async getLearningStateByWordId(wordId: string, wordCreatedAt: string): Promise<LearningState> {
    const states = await this.adapter.queryByIndex<LearningState>(
      'learning_states',
      'word_id',
      wordId
    );
    if (states.length > 0) return states[0];
    return this.createDefaultState(wordId, wordCreatedAt);
  }

  private async getWordFolderIds(wordId: string): Promise<string[]> {
    const links = await this.adapter.queryByIndex<LocalWordFolderRecord>(
      'word_folders',
      'word_id',
      wordId
    );
    return links.map((l) => l.folder_id);
  }

  private async setWordFolders(wordId: string, folderIds: string[]): Promise<void> {
    // Delete existing
    const existing = await this.adapter.queryByIndex<LocalWordFolderRecord>(
      'word_folders',
      'word_id',
      wordId
    );
    await Promise.all(existing.map((l) => this.adapter.delete('word_folders', l.id)));

    // Insert new
    const puts = folderIds.map((fId) =>
      this.adapter.put<LocalWordFolderRecord>('word_folders', {
        id: `${wordId}_${fId}`,
        word_id: wordId,
        folder_id: fId,
      })
    );
    await Promise.all(puts);
  }

  private createDefaultState(wordId: string, createdAt: string): LearningState {
    return {
      id: generateId(),
      word_id: wordId,
      mastery: 0,
      interval_step: 0,
      next_review: createdAt,
      last_reviewed: null,
      review_count: 0,
      correct_count: 0,
      wrong_count: 0,
      consecutive_correct: 0,
    };
  }
}

// Global default repository instance
export const localRepository = new LocalRepository();

// Standalone convenience exports
export const getLocalStudyQueue = (limit?: number, folderId?: string) =>
  localRepository.getStudyQueue(limit, folderId);
export const processLocalReview = (wordId: string, rating: ReviewRating) =>
  localRepository.processReview(wordId, rating);
export const getLocalWords = (params?: Parameters<LocalRepository['getWords']>[0]) =>
  localRepository.getWords(params);
export const getLocalWordById = (id: string) => localRepository.getWordById(id);
export const createLocalWord = (dto: CreateWordDto) => localRepository.createWord(dto);
export const updateLocalWord = (id: string, dto: UpdateWordDto) =>
  localRepository.updateWord(id, dto);
export const deleteLocalWord = (id: string) => localRepository.deleteWord(id);
export const getLocalFolders = () => localRepository.getFolders();
export const getLocalFolderById = (id: string) => localRepository.getFolderById(id);
export const createLocalFolder = (name: string, color?: string) =>
  localRepository.createFolder(name, color);
export const updateLocalFolder = (id: string, data: { name?: string; color?: string }) =>
  localRepository.updateFolder(id, data);
export const deleteLocalFolder = (id: string) => localRepository.deleteFolder(id);
export const batchUpdateLocalCefr = (wordIds: string[], level: CEFRLevel) =>
  localRepository.batchUpdateCefr(wordIds, level);
export const batchDeleteLocalWords = (wordIds: string[]) =>
  localRepository.batchDeleteWords(wordIds);
export const batchUpdateLocalFolder = (
  wordIds: string[],
  folderId: string,
  action: 'add' | 'remove'
) => localRepository.batchUpdateFolder(wordIds, folderId, action);
export const getLocalHomeSummary = () => localRepository.getHomeSummary();
