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
 * Formats SQLite UTC strings without timezone indicators to ISO UTC so JavaScript
 * parses them reliably regardless of host machine timezone offset.
 */
export function normalizeTimestamp(val: any): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    let s = val.trim();
    if (!s) return 0;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    } else if (/^\d+$/.test(s)) {
      const num = Number(s);
      if (!isNaN(num)) return num;
    }
    const parsed = new Date(s).getTime();
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
 * Pure deterministic LWW merge for word_folders associations per word.
 * When a word exists on both peers, the peer with the newer word.updated_at
 * timestamp determines the authoritative set of folder memberships for that word.
 */
export function mergeWordFolders(
  localWords: Word[],
  incomingWords: Word[],
  wordIdMap: Map<string, string>,
  folderIdMap: Map<string, string>,
  localWordFolders: { word_id: string; folder_id: string }[],
  incomingWordFolders: { word_id: string; folder_id: string }[]
): { word_id: string; folder_id: string }[] {
  const localByWord = new Map<string, Set<string>>();
  for (const wf of localWordFolders || []) {
    let set = localByWord.get(wf.word_id);
    if (!set) {
      set = new Set();
      localByWord.set(wf.word_id, set);
    }
    set.add(wf.folder_id);
  }

  const incomingByWord = new Map<string, Set<string>>();
  for (const wf of incomingWordFolders || []) {
    const mappedWordId = wordIdMap.get(wf.word_id) || wf.word_id;
    const mappedFolderId = folderIdMap.get(wf.folder_id) || wf.folder_id;
    let set = incomingByWord.get(mappedWordId);
    if (!set) {
      set = new Set();
      incomingByWord.set(mappedWordId, set);
    }
    set.add(mappedFolderId);
  }

  const localWordUpdatedAt = new Map<string, number>();
  for (const w of localWords) {
    localWordUpdatedAt.set(w.id, normalizeTimestamp(w.updated_at));
  }

  const incomingWordUpdatedAt = new Map<string, number>();
  for (const w of incomingWords) {
    const mappedId = wordIdMap.get(w.id) || w.id;
    incomingWordUpdatedAt.set(mappedId, normalizeTimestamp(w.updated_at));
  }

  const allWordIds = new Set<string>([
    ...localWordUpdatedAt.keys(),
    ...incomingWordUpdatedAt.keys(),
    ...localByWord.keys(),
    ...incomingByWord.keys(),
  ]);

  const result: { word_id: string; folder_id: string }[] = [];

  for (const wordId of allWordIds) {
    const localFolders = localByWord.get(wordId) || new Set<string>();
    const incFolders = incomingByWord.get(wordId) || new Set<string>();

    const inLocal = localWordUpdatedAt.has(wordId);
    const inIncoming = incomingWordUpdatedAt.has(wordId);

    let chosenFolders: Set<string>;
    if (inLocal && inIncoming) {
      const localTs = localWordUpdatedAt.get(wordId) || 0;
      const incTs = incomingWordUpdatedAt.get(wordId) || 0;
      if (incTs > localTs) {
        chosenFolders = incFolders;
      } else if (localTs > incTs) {
        chosenFolders = localFolders;
      } else {
        chosenFolders = new Set([...localFolders, ...incFolders]);
      }
    } else {
      chosenFolders = new Set([...localFolders, ...incFolders]);
    }

    for (const folderId of chosenFolders) {
      result.push({ word_id: wordId, folder_id: folderId });
    }
  }

  return result;
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
    const defaultTime = word.created_at || new Date().toISOString();
    return {
      id: generateSyncId(),
      word_id: word.id,
      mastery: 0,
      interval_step: 0,
      next_review: defaultTime,
      last_reviewed: null,
      review_count: 0,
      correct_count: 0,
      wrong_count: 0,
      consecutive_correct: 0,
      sentence_mastery: 0,
      sentence_interval_step: 0,
      sentence_next_review: defaultTime,
      sentence_last_reviewed: null,
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
    sentence_mastery: existingState?.sentence_mastery ?? 0,
    sentence_interval_step: existingState?.sentence_interval_step ?? 0,
    sentence_next_review: existingState?.sentence_next_review ?? (word.created_at || sorted[0].reviewed_at),
    sentence_last_reviewed: existingState?.sentence_last_reviewed ?? null,
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

  // 6. Remap and merge word_folders via per-word LWW
  const mergedWordFolders = mergeWordFolders(
    localWords,
    bundle.words,
    wordIdMap,
    folderIdMap,
    localWordFolders,
    Array.isArray(bundle.word_folders) ? bundle.word_folders : []
  ).map((wf) => ({
    id: `${wf.word_id}_${wf.folder_id}`,
    word_id: wf.word_id,
    folder_id: wf.folder_id,
  }));

  // 7. Defensive filtering for foreign keys & soft-deleted folders
  const validWordIds = new Set<string>(wordMerge.merged.map((w) => w.id));
  const validFolderIds = new Set<string>(folderMerge.merged.map((f) => f.id));
  const deletedFolderIds = new Set<string>(
    folderMerge.merged.filter((f) => f.deleted_at != null).map((f) => f.id)
  );

  const filteredWordFolders = mergedWordFolders.filter(
    (wf) =>
      validWordIds.has(wf.word_id) &&
      validFolderIds.has(wf.folder_id) &&
      !deletedFolderIds.has(wf.folder_id)
  );

  const filteredReviews = reviewMerge.merged.filter((r) => validWordIds.has(r.word_id));

  // 8. Harmonize learning states for all words
  const reviewsByWord = new Map<string, LocalReviewHistoryRecord[]>();
  for (const rev of filteredReviews) {
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

  // Ensure stale word_folders and orphaned reviews are removed from IndexedDB
  const validWfKeySet = new Set(
    filteredWordFolders.map((wf) => `${wf.word_id}_${wf.folder_id}`)
  );
  const staleWordFolderDeletions = localWordFolders
    .filter((wf) => !validWfKeySet.has(`${wf.word_id}_${wf.folder_id}`))
    .map((wf) => adapter.delete('word_folders', wf.id || `${wf.word_id}_${wf.folder_id}`));

  const staleReviewDeletions = localReviews
    .filter((r) => !validWordIds.has(r.word_id))
    .map((r) => adapter.delete('review_history', r.id));

  // 9. Commit changes atomically into IndexedDB
  await Promise.all([
    ...staleWordFolderDeletions,
    ...staleReviewDeletions,
    adapter.putMany('words', wordMerge.merged),
    adapter.putMany('folders', folderMerge.merged),
    adapter.putMany('review_history', filteredReviews),
    adapter.putMany(
      'word_folders',
      filteredWordFolders.map((wf) => ({
        id: wf.id || `${wf.word_id}_${wf.folder_id}`,
        word_id: wf.word_id,
        folder_id: wf.folder_id,
      }))
    ),
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
