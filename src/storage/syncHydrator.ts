import { WordWithState, FolderListResponse, Word, LearningState, Folder } from '../types';
import {
  IndexedDbAdapter,
  indexedDbAdapter,
  LocalWordFolderRecord,
  LocalSyncMetaRecord,
} from './indexedDb';

export interface HydrationOptions {
  /** If true, overwrites / updates local database even if already populated. Default: false */
  force?: boolean;
  /** Base URL for API requests (e.g. '' in browser or 'http://127.0.0.1:3001'). Default: '' */
  apiBase?: string;
  /** Custom fetch implementation (useful for tests and non-browser runtimes) */
  fetchFn?: typeof fetch;
  /** Custom adapter instance */
  adapter?: IndexedDbAdapter;
}

export interface HydrationResult {
  success: boolean;
  hydrated: boolean;
  wordsCount: number;
  foldersCount: number;
  lastHydratedAt: string;
  reason: 'already_initialized' | 'completed' | 'offline_or_failed';
  error?: string;
}

/**
 * Checks whether the local IndexedDB contains any words or was previously hydrated.
 */
export async function isLocalDatabaseInitialized(adapter: IndexedDbAdapter = indexedDbAdapter): Promise<boolean> {
  const words = await adapter.getAll<Word>('words');
  return words.length > 0;
}

/**
 * Retrieves the last hydration timestamp from IndexedDB metadata.
 */
export async function getLastHydratedAt(adapter: IndexedDbAdapter = indexedDbAdapter): Promise<string | null> {
  const meta = await adapter.get<LocalSyncMetaRecord>('sync_meta', 'last_hydrated_at');
  return meta?.value || null;
}

/**
 * Hydrates the local client-side IndexedDB from the backend API:
 * 1. Checks if local database is already initialized (skipped unless force = true).
 * 2. Fetches words (/api/words) and folders (/api/folders) from the server.
 * 3. Bulk inserts words, learning_states, word_folders, and folders into IndexedDB.
 * 4. Records `last_hydrated_at` in the `sync_meta` store.
 */
export async function hydrateLocalDatabase(options: HydrationOptions = {}): Promise<HydrationResult> {
  const adapter = options.adapter || indexedDbAdapter;
  const apiBase = options.apiBase || '';
  const fetchFn =
    options.fetchFn ||
    (typeof window !== 'undefined'
      ? window.fetch.bind(window)
      : typeof globalThis !== 'undefined'
      ? globalThis.fetch.bind(globalThis)
      : undefined);

  if (!fetchFn) {
    return {
      success: false,
      hydrated: false,
      wordsCount: 0,
      foldersCount: 0,
      lastHydratedAt: '',
      reason: 'offline_or_failed',
      error: 'Fetch API is not available in this environment.',
    };
  }

  // Check if uninitialized or explicitly forced
  const existingWords = await adapter.getAll<Word>('words');
  if (!options.force && existingWords.length > 0) {
    const lastHydratedAt = (await getLastHydratedAt(adapter)) || '';
    const existingFolders = await adapter.getAll<Folder>('folders');
    return {
      success: true,
      hydrated: false,
      wordsCount: existingWords.length,
      foldersCount: existingFolders.length,
      lastHydratedAt,
      reason: 'already_initialized',
    };
  }

  // Fetch words and folders from backend API
  try {
    const wordsUrl = `${apiBase}/api/words`;
    const foldersUrl = `${apiBase}/api/folders`;

    const [wordsRes, foldersRes] = await Promise.all([
      fetchFn(wordsUrl),
      fetchFn(foldersUrl),
    ]);

    if (!wordsRes.ok || !foldersRes.ok) {
      return {
        success: false,
        hydrated: false,
        wordsCount: 0,
        foldersCount: 0,
        lastHydratedAt: '',
        reason: 'offline_or_failed',
        error: `Server responded with status: words=${wordsRes.status}, folders=${foldersRes.status}`,
      };
    }

    const wordsData: WordWithState[] = await wordsRes.json();
    const foldersData: FolderListResponse = await foldersRes.json();

    const wordsToPut: Word[] = [];
    const statesToPut: LearningState[] = [];
    const wordFoldersToPut: LocalWordFolderRecord[] = [];

    for (const item of wordsData) {
      wordsToPut.push({
        id: item.id,
        word: item.word,
        meaning: item.meaning,
        level: item.level,
        part_of_speech: item.part_of_speech || null,
        example_sentence: item.example_sentence || null,
        example_translation: item.example_translation || null,
        notes: item.notes || null,
        created_at: item.created_at,
        updated_at: item.updated_at,
      });

      if (item.learning_state) {
        statesToPut.push(item.learning_state);
      }

      if (item.folderIds && item.folderIds.length > 0) {
        for (const fId of item.folderIds) {
          wordFoldersToPut.push({
            id: `${item.id}_${fId}`,
            word_id: item.id,
            folder_id: fId,
          });
        }
      }
    }

    const foldersList = foldersData.folders || [];
    const foldersToPut: Folder[] = foldersList.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color || '#94a3b8',
      wordCount: f.wordCount || 0,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }));

    // Bulk store into IndexedDB
    await Promise.all([
      adapter.putMany('words', wordsToPut),
      adapter.putMany('learning_states', statesToPut),
      adapter.putMany('word_folders', wordFoldersToPut),
      adapter.putMany('folders', foldersToPut),
    ]);

    // Set sync_meta marker
    const nowIso = new Date().toISOString();
    await adapter.put<LocalSyncMetaRecord>('sync_meta', {
      key: 'last_hydrated_at',
      value: nowIso,
      updated_at: nowIso,
    });

    return {
      success: true,
      hydrated: true,
      wordsCount: wordsToPut.length,
      foldersCount: foldersToPut.length,
      lastHydratedAt: nowIso,
      reason: 'completed',
    };
  } catch (err: any) {
    return {
      success: false,
      hydrated: false,
      wordsCount: 0,
      foldersCount: 0,
      lastHydratedAt: '',
      reason: 'offline_or_failed',
      error: err?.message || 'Network or parse error during hydration',
    };
  }
}
