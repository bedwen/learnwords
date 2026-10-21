import { getDatabase } from '../db';
import {
  Word,
  Folder,
  LocalReviewHistoryRecord,
  SyncBundle,
  SyncMergeResult,
  LearningState,
} from '../../src/types';
import {
  mergeWords,
  mergeFolders,
  mergeReviews,
  mergeWordFolders,
  harmonizeWordLearningState,
  normalizeTimestamp,
  generateSyncId,
} from '../../src/storage/smartMerge';

export class SyncService {
  /**
   * Export all syncable entities from SQLite into a standard SyncBundle.
   * Includes soft-deleted words and folders so deletions propagate across peers.
   */
  static exportSyncBundle(): SyncBundle {
    const db = getDatabase();

    const wordRows = db.prepare(`
      SELECT 
        id, sync_id, word, meaning, level, part_of_speech,
        example_sentence, example_translation, notes,
        created_at, updated_at, deleted_at
      FROM words
      ORDER BY created_at ASC
    `).all() as any[];

    const words: Word[] = wordRows.map((r) => ({
      id: r.id,
      sync_id: r.sync_id || r.id,
      word: r.word,
      meaning: r.meaning,
      level: r.level,
      part_of_speech: r.part_of_speech,
      example_sentence: r.example_sentence,
      example_translation: r.example_translation,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: normalizeTimestamp(r.updated_at),
      deleted_at: r.deleted_at ? normalizeTimestamp(r.deleted_at) : null,
    }));

    const folderRows = db.prepare(`
      SELECT id, sync_id, name, color, created_at, updated_at, deleted_at
      FROM folders
      ORDER BY created_at ASC
    `).all() as any[];

    const folders: Folder[] = folderRows.map((r) => ({
      id: r.id,
      sync_id: r.sync_id || r.id,
      name: r.name,
      color: r.color,
      wordCount: 0,
      created_at: r.created_at,
      updated_at: normalizeTimestamp(r.updated_at),
      deleted_at: r.deleted_at ? normalizeTimestamp(r.deleted_at) : null,
    }));

    const wfRows = db.prepare(`
      SELECT word_id, folder_id
      FROM word_folders
    `).all() as { word_id: string; folder_id: string }[];

    const reviewRows = db.prepare(`
      SELECT 
        id, sync_id, word_id, rating, mastery_before, mastery_after,
        interval_step_before, interval_step_after, reviewed_at
      FROM review_history
      ORDER BY reviewed_at ASC
    `).all() as any[];

    const reviewHistory: LocalReviewHistoryRecord[] = reviewRows.map((r) => ({
      id: r.id,
      sync_id: r.sync_id || r.id,
      word_id: r.word_id,
      rating: r.rating,
      mastery_before: r.mastery_before,
      mastery_after: r.mastery_after,
      interval_step_before: r.interval_step_before,
      interval_step_after: r.interval_step_after,
      reviewed_at: r.reviewed_at,
    }));

    return {
      version: 1,
      deviceId: 'server-desktop',
      exportedAt: new Date().toISOString(),
      words,
      folders,
      word_folders: wfRows,
      review_history: reviewHistory,
    };
  }

  /**
   * Merge an incoming SyncBundle into the local SQLite database.
   * Resolves conflicts via Last-Write-Wins (LWW) and harmonizes SRS states.
   * Returns merge statistics and the resulting server bundle.
   */
  static mergeSyncBundle(incomingBundle: SyncBundle): {
    result: SyncMergeResult;
    serverBundle: SyncBundle;
  } {
    if (
      !incomingBundle ||
      incomingBundle.version !== 1 ||
      !Array.isArray(incomingBundle.words) ||
      !Array.isArray(incomingBundle.folders) ||
      !Array.isArray(incomingBundle.review_history)
    ) {
      throw new Error('Invalid sync bundle: unsupported version or corrupted payload');
    }

    const db = getDatabase();

    // 1. Fetch local records
    const localBundle = this.exportSyncBundle();
    const localLearningStates = db.prepare(`
      SELECT 
        id, word_id, mastery, interval_step, next_review,
        last_reviewed, review_count, correct_count, wrong_count,
        consecutive_correct, sentence_mastery, sentence_interval_step,
        sentence_next_review, sentence_last_reviewed
      FROM learning_states
    `).all() as LearningState[];

    const localStateMap = new Map<string, LearningState>();
    for (const ls of localLearningStates) {
      localStateMap.set(ls.word_id, ls);
    }

    // 2. Build folder ID mapping & merge folders
    const folderIdMap = new Map<string, string>();
    const localFolderBySync = new Map<string, Folder>();
    const localFolderByName = new Map<string, Folder>();
    for (const f of localBundle.folders) {
      if (f.sync_id) localFolderBySync.set(f.sync_id, f);
      localFolderByName.set(f.name.toLowerCase().trim(), f);
    }
    for (const incomingF of incomingBundle.folders) {
      const match =
        (incomingF.sync_id ? localFolderBySync.get(incomingF.sync_id) : undefined) ||
        localFolderByName.get(incomingF.name.toLowerCase().trim());
      if (match) {
        folderIdMap.set(incomingF.id, match.id);
      }
    }

    const folderMerge = mergeFolders(localBundle.folders, incomingBundle.folders);

    // 3. Build word ID mapping & merge words
    const wordIdMap = new Map<string, string>();
    const localWordBySync = new Map<string, Word>();
    const localWordByText = new Map<string, Word>();
    for (const w of localBundle.words) {
      if (w.sync_id) localWordBySync.set(w.sync_id, w);
      localWordByText.set(w.word.toLowerCase().trim(), w);
    }
    for (const incomingW of incomingBundle.words) {
      const match =
        (incomingW.sync_id ? localWordBySync.get(incomingW.sync_id) : undefined) ||
        localWordByText.get(incomingW.word.toLowerCase().trim());
      if (match) {
        wordIdMap.set(incomingW.id, match.id);
      }
    }

    const wordMerge = mergeWords(localBundle.words, incomingBundle.words);

    // 4. Remap reviews to match local word IDs & merge
    const remappedIncomingReviews = incomingBundle.review_history.map((rev) => {
      const mappedWordId = wordIdMap.get(rev.word_id) || rev.word_id;
      return {
        ...rev,
        word_id: mappedWordId,
      };
    });
    const reviewMerge = mergeReviews(localBundle.review_history, remappedIncomingReviews);

    // 5. Remap and merge word_folders via per-word LWW
    const mergedWordFolders = mergeWordFolders(
      localBundle.words,
      incomingBundle.words,
      wordIdMap,
      folderIdMap,
      localBundle.word_folders,
      Array.isArray(incomingBundle.word_folders) ? incomingBundle.word_folders : []
    );

    // 6. Defensive filtering for foreign keys & soft-deleted folders
    const validWordIds = new Set<string>(wordMerge.merged.map((w) => w.id));
    const validFolderIds = new Set<string>(folderMerge.merged.map((f) => f.id));
    const deletedFolderIds = new Set<string>(
      folderMerge.merged.filter((f) => f.deleted_at != null).map((f) => f.id)
    );

    const validWordFolders = mergedWordFolders.filter(
      (wf) =>
        validWordIds.has(wf.word_id) &&
        validFolderIds.has(wf.folder_id) &&
        !deletedFolderIds.has(wf.folder_id)
    );

    const validReviews = reviewMerge.merged.filter((r) => validWordIds.has(r.word_id));

    // 7. Harmonize learning states for all words
    const reviewsByWord = new Map<string, LocalReviewHistoryRecord[]>();
    for (const rev of validReviews) {
      const list = reviewsByWord.get(rev.word_id) || [];
      list.push(rev);
      reviewsByWord.set(rev.word_id, list);
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

    // 8. Transactional write to SQLite
    const upsertFolderStmt = db.prepare(`
      INSERT INTO folders (id, sync_id, name, color, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        sync_id = excluded.sync_id,
        name = excluded.name,
        color = excluded.color,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);

    const deleteAllWordFoldersStmt = db.prepare('DELETE FROM word_folders');

    const upsertWordStmt = db.prepare(`
      INSERT INTO words (id, sync_id, word, meaning, level, part_of_speech, example_sentence, example_translation, notes, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        sync_id = excluded.sync_id,
        word = excluded.word,
        meaning = excluded.meaning,
        level = excluded.level,
        part_of_speech = excluded.part_of_speech,
        example_sentence = excluded.example_sentence,
        example_translation = excluded.example_translation,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);

    const insertReviewStmt = db.prepare(`
      INSERT OR IGNORE INTO review_history (id, sync_id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWordFolderStmt = db.prepare(`
      INSERT OR IGNORE INTO word_folders (word_id, folder_id)
      VALUES (?, ?)
    `);

    const upsertStateStmt = db.prepare(`
      INSERT INTO learning_states (id, word_id, mastery, interval_step, next_review, last_reviewed, review_count, correct_count, wrong_count, consecutive_correct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(word_id) DO UPDATE SET
        mastery = excluded.mastery,
        interval_step = excluded.interval_step,
        next_review = excluded.next_review,
        last_reviewed = excluded.last_reviewed,
        review_count = excluded.review_count,
        correct_count = excluded.correct_count,
        wrong_count = excluded.wrong_count,
        consecutive_correct = excluded.consecutive_correct
    `);

    const tx = db.transaction(() => {
      // Folders
      for (const f of folderMerge.merged) {
        upsertFolderStmt.run(
          f.id,
          f.sync_id || generateSyncId(),
          f.name,
          f.color || '#94a3b8',
          f.created_at || new Date().toISOString(),
          typeof f.updated_at === 'number' ? f.updated_at : normalizeTimestamp(f.updated_at),
          f.deleted_at ? normalizeTimestamp(f.deleted_at) : null
        );
      }

      // Words
      for (const w of wordMerge.merged) {
        upsertWordStmt.run(
          w.id,
          w.sync_id || generateSyncId(),
          w.word,
          w.meaning,
          w.level,
          w.part_of_speech || null,
          w.example_sentence || null,
          w.example_translation || null,
          w.notes || null,
          w.created_at || new Date().toISOString(),
          typeof w.updated_at === 'number' ? w.updated_at : normalizeTimestamp(w.updated_at),
          w.deleted_at ? normalizeTimestamp(w.deleted_at) : null
        );
      }

      // Reviews
      for (const r of validReviews) {
        insertReviewStmt.run(
          r.id || generateSyncId(),
          r.sync_id || generateSyncId(),
          r.word_id,
          r.rating,
          r.mastery_before,
          r.mastery_after,
          r.interval_step_before,
          r.interval_step_after,
          r.reviewed_at
        );
      }

      // Word Folders: replace table with merged valid links so unlinked rows are removed
      deleteAllWordFoldersStmt.run();
      for (const wf of validWordFolders) {
        insertWordFolderStmt.run(wf.word_id, wf.folder_id);
      }

      // Learning States
      for (const s of harmonizedStates) {
        upsertStateStmt.run(
          s.id || generateSyncId(),
          s.word_id,
          s.mastery,
          s.interval_step,
          s.next_review,
          s.last_reviewed || null,
          s.review_count,
          s.correct_count,
          s.wrong_count,
          s.consecutive_correct
        );
      }
    });

    tx();

    // 8. Re-export updated server bundle
    const serverBundle = this.exportSyncBundle();

    const result: SyncMergeResult = {
      success: true,
      wordsAdded: wordMerge.added,
      wordsUpdated: wordMerge.updated,
      wordsDeleted: wordMerge.deleted,
      foldersAdded: folderMerge.added,
      foldersUpdated: folderMerge.updated,
      foldersDeleted: folderMerge.deleted,
      reviewsMerged: reviewMerge.added,
    };

    return { result, serverBundle };
  }
}
