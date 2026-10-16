import { LocalRepository, localRepository } from './localRepository';
import {
  IndexedDbAdapter,
  indexedDbAdapter,
  isIndexedDbSupported,
  LocalSyncMetaRecord,
  LocalReviewHistoryRecord,
} from './indexedDb';
import { Word } from '../types';

export interface DesktopMigrationResult {
  migrated: boolean;
  reason: 'already_migrated' | 'no_local_data' | 'success' | 'failed' | 'not_supported';
  error?: string;
}

export interface DesktopMigrationOptions {
  adapter?: IndexedDbAdapter;
  repository?: LocalRepository;
  apiBase?: string;
  fetchFn?: typeof fetch;
}

/**
 * One-time desktop data rescue.
 * In desktop mode, if IndexedDB contains any words or reviews and
 * sync_meta.desktop_migrated_at is not set, exports the local sync bundle
 * and POSTs it to the server SQLite database via /api/sync.
 *
 * Invariants:
 * - Runs once per desktop device (sets desktop_migrated_at flag).
 * - Fails silently on network/server errors so it can retry on next launch.
 * - Never clears, deletes, or modifies existing IndexedDB data.
 */
export async function checkAndMigrateDesktopData(
  options: DesktopMigrationOptions = {}
): Promise<DesktopMigrationResult> {
  const adapter = options.adapter || indexedDbAdapter;
  const repository = options.repository || localRepository;
  const apiBase = options.apiBase || '';
  const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined);

  if (!options.adapter && !isIndexedDbSupported()) {
    return { migrated: false, reason: 'not_supported' };
  }

  try {
    // 1. Check if already migrated
    const meta = await adapter.get<LocalSyncMetaRecord>('sync_meta', 'desktop_migrated_at');
    if (meta && meta.value) {
      return { migrated: false, reason: 'already_migrated' };
    }

    // 2. Check if local IndexedDB has words or reviews
    const words = await adapter.getAll<Word>('words');
    const reviews = await adapter.getAll<LocalReviewHistoryRecord>('review_history');
    if (words.length === 0 && reviews.length === 0) {
      return { migrated: false, reason: 'no_local_data' };
    }

    if (!fetchFn) {
      return { migrated: false, reason: 'failed', error: 'Fetch API not available' };
    }

    // 3. Export local sync bundle
    const bundle = await repository.exportSyncBundle();

    // 4. POST to /api/sync
    const normalizedBase = apiBase.replace(/\/+$/, '');
    const url = normalizedBase ? `${normalizedBase}/api/sync` : '/api/sync';

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bundle }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        migrated: false,
        reason: 'failed',
        error: `Server sync endpoint returned HTTP ${response.status}: ${errText}`,
      };
    }

    // 5. On success, mark desktop_migrated_at
    const timestamp = new Date().toISOString();
    await adapter.put<LocalSyncMetaRecord>('sync_meta', {
      key: 'desktop_migrated_at',
      value: timestamp,
      updated_at: timestamp,
    });

    return { migrated: true, reason: 'success' };
  } catch (err: any) {
    // On failure, do nothing and return failed result so it retries on next launch.
    // Local IndexedDB data is strictly preserved.
    return {
      migrated: false,
      reason: 'failed',
      error: err?.message || 'Unexpected migration error',
    };
  }
}
