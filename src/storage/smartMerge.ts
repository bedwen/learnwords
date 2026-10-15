import {
  Word,
  Folder,
  LocalReviewHistoryRecord,
  SyncBundle,
  SyncMergeResult,
  LearningState,
} from '../types';
import {
  IndexedDbAdapter,
  LocalWordFolderRecord,
  LocalSyncMetaRecord,
} from './indexedDb';
import { LearningEngine } from '../learning/learningEngine';

/**
 * Pure UUID generator using native crypto.randomUUID with RFC4122 v4 fallback.
 * Zero external packages.
 */
export function generateSyncId(): string {
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
 * Normalizes timestamps to Unix epoch milliseconds.
 */
export function normalizeTimestamp(val: any): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * Pure deterministic merge for words based on Last-Write-Wins (LWW) and Soft Delete.
 */
export function mergeWords(
  localWords: Word[],
  incomingWords: Word[]
): {
  merged: Word[];
  added: number;
  updated: number;
  deleted: number;
} {
  const localBySyncId = new Map<string, Word>();
  const localByText = new Map<string, Word>();
  const mergedMap = new Map<string, Word>();

  for (const word of localWords) {
    if (word.sync_id) {
      localBySyncId.set(word.sync_id, word);
    }
    localByText.set(word.word.toLowerCase().trim(), word);
    mergedMap.set(word.id, { ...word });
  }

  let added = 0;
  let updated = 0;
  let deleted = 0;

  for (const incoming of incomingWords) {
    // Match by sync_id first, fallback to word text
    const matched =
      (incoming.sync_id ? localBySyncId.get(incoming.sync_id) : undefined) ||
      localByText.get(incoming.word.toLowerCase().trim());

    const incomingUpdatedAt = normalizeTimestamp(incoming.updated_at) || Date.now();
    const isIncomingDeleted = incoming.deleted_at !== null && incoming.deleted_at !== undefined;

    if (!matched) {
      // Unseen word: INSERT
      const newWord: Word = {
        ...incoming,
        id: incoming.id || generateSyncId(),
        sync_id: incoming.sync_id || generateSyncId(),
        updated_at: incomingUpdatedAt,
        deleted_at: isIncomingDeleted ? normalizeTimestamp(incoming.deleted_at) : null,
      };
      mergedMap.set(newWord.id, newWord);
      localBySyncId.set(newWord.sync_id, newWord);
      localByText.set(newWord.word.toLowerCase().trim(), newWord);

      if (isIncomingDeleted) {
        deleted++;
      } else {
        added++;
      }
    } else {
      // Existing word: Last-Write-Wins comparison
      const localUpdatedAt = normalizeTimestamp(matched.updated_at);
      const isLocalDeleted = matched.deleted_at !== null && matched.deleted_at !== undefined;

      if (incomingUpdatedAt > localUpdatedAt) {
        // Incoming is newer -> update local
        const mergedWord: Word = {
          ...matched,
          word: incoming.word,
          meaning: incoming.meaning,
          level: incoming.level,
          part_of_speech: incoming.part_of_speech !== undefined ? incoming.part_of_speech : matched.part_of_speech,
          example_sentence: incoming.example_sentence !== undefined ? incoming.example_sentence : matched.example_sentence,
          example_translation: incoming.example_translation !== undefined ? incoming.example_translation : matched.example_translation,
          notes: incoming.notes !== undefined ? incoming.notes : matched.notes,
          sync_id: matched.sync_id || incoming.sync_id || generateSyncId(),
          updated_at: incomingUpdatedAt,
          deleted_at: isIncomingDeleted ? normalizeTimestamp(incoming.deleted_at) : null,
        };

        mergedMap.set(matched.id, mergedWord);
        localBySyncId.set(mergedWord.sync_id, mergedWord);
        localByText.set(mergedWord.word.toLowerCase().trim(), mergedWord);

        if (isIncomingDeleted && !isLocalDeleted) {
          deleted++;
        } else {
          updated++;
        }
      }
    }
  }

  return {
    merged: Array.from(mergedMap.values()),
    added,
    updated,
    deleted,
  };
}

/**
 * Pure deterministic merge for folders based on Last-Write-Wins (LWW) and Soft Delete.
 */
export function mergeFolders(
  localFolders: Folder[],
  incomingFolders: Folder[]
): {
  merged: Folder[];
  added: number;
  updated: number;
  deleted: number;
} {
  const localBySyncId = new Map<string, Folder>();
  const localByName = new Map<string, Folder>();
  const mergedMap = new Map<string, Folder>();

  for (const folder of localFolders) {
    if (folder.sync_id) {
      localBySyncId.set(folder.sync_id, folder);
    }
    localByName.set(folder.name.toLowerCase().trim(), folder);
    mergedMap.set(folder.id, { ...folder });
  }

  let added = 0;
  let updated = 0;
  let deleted = 0;

  for (const incoming of incomingFolders) {
    const matched =
      (incoming.sync_id ? localBySyncId.get(incoming.sync_id) : undefined) ||
      localByName.get(incoming.name.toLowerCase().trim());

    const incomingUpdatedAt = normalizeTimestamp(incoming.updated_at) || Date.now();
    const isIncomingDeleted = incoming.deleted_at !== null && incoming.deleted_at !== undefined;

    if (!matched) {
      const newFolder: Folder = {
        ...incoming,
        id: incoming.id || generateSyncId(),
        sync_id: incoming.sync_id || generateSyncId(),
        updated_at: incomingUpdatedAt,
        deleted_at: isIncomingDeleted ? normalizeTimestamp(incoming.deleted_at) : null,
      };
      mergedMap.set(newFolder.id, newFolder);
      localBySyncId.set(newFolder.sync_id, newFolder);
      localByName.set(newFolder.name.toLowerCase().trim(), newFolder);

      if (isIncomingDeleted) {
        deleted++;
      } else {
        added++;
      }
    } else {
      const localUpdatedAt = normalizeTimestamp(matched.updated_at);
      const isLocalDeleted = matched.deleted_at !== null && matched.deleted_at !== undefined;

      if (incomingUpdatedAt > localUpdatedAt) {
        const mergedFolder: Folder = {
          ...matched,
          name: incoming.name,
          color: incoming.color || matched.color,
          sync_id: matched.sync_id || incoming.sync_id || generateSyncId(),
          updated_at: incomingUpdatedAt,
          deleted_at: isIncomingDeleted ? normalizeTimestamp(incoming.deleted_at) : null,
        };

        mergedMap.set(matched.id, mergedFolder);
        localBySyncId.set(mergedFolder.sync_id, mergedFolder);
        localByName.set(mergedFolder.name.toLowerCase().trim(), mergedFolder);

        if (isIncomingDeleted && !isLocalDeleted) {
          deleted++;
        } else {
          updated++;
        }
      }
    }
  }

  return {
    merged: Array.from(mergedMap.values()),
    added,
    updated,
    deleted,
  };
}

/**
 * Pure deterministic review history union:
 * Merges reviews across mobile and desktop losslessly with deduplication by sync_id.
 */
export function mergeReviews(
  localReviews: LocalReviewHistoryRecord[],
  incomingReviews: LocalReviewHistoryRecord[]
): {
  merged: LocalReviewHistoryRecord[];
  added: number;
} {
  const existingSyncIds = new Set<string>();
  const existingKeys = new Set<string>();
  const merged: LocalReviewHistoryRecord[] = [];

  for (const r of localReviews) {
    if (r.sync_id) {
      existingSyncIds.add(r.sync_id);
    }
    existingKeys.add(`${r.word_id}_${r.reviewed_at}_${r.rating}`);
    merged.push(r);
  }

  let added = 0;

  for (const r of incomingReviews) {
    const key = `${r.word_id}_${r.reviewed_at}_${r.rating}`;
    if (r.sync_id && existingSyncIds.has(r.sync_id)) {
      continue;
    }
    if (existingKeys.has(key)) {
      continue;
    }

    const reviewSyncId = r.sync_id || generateSyncId();
    existingSyncIds.add(reviewSyncId);
    existingKeys.add(key);

    merged.push({
      ...r,
      id: r.id || generateSyncId(),
      sync_id: reviewSyncId,
    });
    added++;
  }

  return {
    merged,
    added,
  };
}

/**
 * Re-derives the accurate LearningState for a word by replaying its review history.
 */
export function harmonizeWordLearningState(
  word: Word,
  existingState: LearningState | undefined,
  reviews: LocalReviewHistoryRecord[]
): LearningState {
  if (reviews.length === 0) {
    if (existingState) return existingState;
    return {
      id: generateSyncId(),
      word_id: word.id,
      mastery: 0,
      interval_step: 0,
      next_review: word.created_at || new Date().toISOString(),
      last_reviewed: null,
      review_count: 0,
      correct_count: 0,
      wrong_count: 0,
      consecutive_correct: 0,
    };
  }

  // Sort chronological
  const sorted = [...reviews].sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));

  let state: LearningState = {
    id: existingState?.id || generateSyncId(),
    word_id: word.id,
    mastery: 0,
    interval_step: 0,
    next_review: word.created_at || sorted[0].reviewed_at,
    last_reviewed: null,
    review_count: 0,
    correct_count: 0,
    wrong_count: 0,
    consecutive_correct: 0,
  };

  const priorHistory: { rating: any; reviewed_at: string }[] = [];

  for (const rev of sorted) {
    const res = LearningEngine.processReview(state, priorHistory, rev.rating, rev.reviewed_at);
    const isCorrect = rev.rating === 'good' || rev.rating === 'easy';

    state = {
      ...state,
      mastery: res.mastery,
      interval_step: res.interval_step,
      next_review: res.next_review,
      last_reviewed: rev.reviewed_at,
      review_count: state.review_count + 1,
      correct_count: state.correct_count + (isCorrect ? 1 : 0),
      wrong_count: state.wrong_count + (isCorrect ? 0 : 1),
      consecutive_correct: isCorrect ? state.consecutive_correct + 1 : 0,
    };

    priorHistory.push({ rating: rev.rating, reviewed_at: rev.reviewed_at });
  }

  return state;
}

/**
 * Executes an atomic smart merge of a SyncBundle into IndexedDB.
 */
export async function executeSmartMerge(
  adapter: IndexedDbAdapter,
  bundle: SyncBundle
): Promise<SyncMergeResult> {
  if (
    !bundle ||
    bundle.version !== 1 ||
    !Array.isArray(bundle.words) ||
    !Array.isArray(bundle.folders) ||
    !Array.isArray(bundle.review_history)
  ) {
    throw new Error('Invalid sync bundle: unsupported version or corrupted payload');
  }

  const [localWords, localFolders, localReviews, localWordFolders, localStates] =
    await Promise.all([
      adapter.getAll<Word>('words'),
      adapter.getAll<Folder>('folders'),
      adapter.getAll<LocalReviewHistoryRecord>('review_history'),
      adapter.getAll<LocalWordFolderRecord>('word_folders'),
      adapter.getAll<LearningState>('learning_states'),
    ]);

  // 1. Build ID mapping for incoming folders
  const folderIdMap = new Map<string, string>();
  const localFolderBySync = new Map<string, Folder>();
  const localFolderByName = new Map<string, Folder>();
  for (const f of localFolders) {
    if (f.sync_id) localFolderBySync.set(f.sync_id, f);
    localFolderByName.set(f.name.toLowerCase().trim(), f);
  }
  for (const incomingF of bundle.folders) {
    const match =
      (incomingF.sync_id ? localFolderBySync.get(incomingF.sync_id) : undefined) ||
      localFolderByName.get(incomingF.name.toLowerCase().trim());
    if (match) {
      folderIdMap.set(incomingF.id, match.id);
    }
  }

  // 2. Merge folders
  const folderMerge = mergeFolders(localFolders, bundle.folders);

  // 3. Build ID mapping for incoming words
  const wordIdMap = new Map<string, string>();
  const localWordBySync = new Map<string, Word>();
  const localWordByText = new Map<string, Word>();
  for (const w of localWords) {
    if (w.sync_id) localWordBySync.set(w.sync_id, w);
    localWordByText.set(w.word.toLowerCase().trim(), w);
  }
  for (const incomingW of bundle.words) {
    const match =
      (incomingW.sync_id ? localWordBySync.get(incomingW.sync_id) : undefined) ||
      localWordByText.get(incomingW.word.toLowerCase().trim());
    if (match) {
      wordIdMap.set(incomingW.id, match.id);
    }
  }

  // 4. Merge words
  const wordMerge = mergeWords(localWords, bundle.words);

  // 5. Remap incoming reviews to match local word IDs
  const remappedReviews = bundle.review_history.map((rev) => {
    const mappedWordId = wordIdMap.get(rev.word_id) || rev.word_id;
    return {
      ...rev,
      word_id: mappedWordId,
    };
  });
  const reviewMerge = mergeReviews(localReviews, remappedReviews);

  // 6. Remap and merge word_folders
  const existingWfKeys = new Set(localWordFolders.map((wf) => `${wf.word_id}_${wf.folder_id}`));
  const mergedWordFolders = [...localWordFolders];

  if (Array.isArray(bundle.word_folders)) {
    for (const wf of bundle.word_folders) {
      const mappedWordId = wordIdMap.get(wf.word_id) || wf.word_id;
      const mappedFolderId = folderIdMap.get(wf.folder_id) || wf.folder_id;
      const key = `${mappedWordId}_${mappedFolderId}`;
      if (!existingWfKeys.has(key)) {
        existingWfKeys.add(key);
        mergedWordFolders.push({
          id: key,
          word_id: mappedWordId,
          folder_id: mappedFolderId,
        });
      }
    }
  }

  // 7. Harmonize learning states for all words
  const reviewsByWord = new Map<string, LocalReviewHistoryRecord[]>();
  for (const rev of reviewMerge.merged) {
    const list = reviewsByWord.get(rev.word_id) || [];
    list.push(rev);
    reviewsByWord.set(rev.word_id, list);
  }

  const localStateMap = new Map<string, LearningState>();
  for (const s of localStates) {
    localStateMap.set(s.word_id, s);
  }

  const harmonizedStates: LearningState[] = [];
  for (const word of wordMerge.merged) {
    const wordReviews = reviewsByWord.get(word.id) || [];
    const state = harmonizeWordLearningState(
      word,
      localStateMap.get(word.id),
      wordReviews
    );
    harmonizedStates.push(state);
  }

  // 8. Commit changes atomically into IndexedDB
  await Promise.all([
    adapter.putMany('words', wordMerge.merged),
    adapter.putMany('folders', folderMerge.merged),
    adapter.putMany('review_history', reviewMerge.merged),
    adapter.putMany('word_folders', mergedWordFolders),
    adapter.putMany('learning_states', harmonizedStates),
  ]);

  const nowIso = new Date().toISOString();
  await adapter.put<LocalSyncMetaRecord>('sync_meta', {
    key: 'last_sync_at',
    value: nowIso,
    updated_at: nowIso,
  });

  return {
    success: true,
    wordsAdded: wordMerge.added,
    wordsUpdated: wordMerge.updated,
    wordsDeleted: wordMerge.deleted,
    foldersAdded: folderMerge.added,
    foldersUpdated: folderMerge.updated,
    foldersDeleted: folderMerge.deleted,
    reviewsMerged: reviewMerge.added,
  };
}
