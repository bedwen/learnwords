import { syncWithLanPeer, SyncMergeResult } from '../api/data';

export interface AutoSyncOutcome {
  ran: boolean;
  summary?: string;
  error?: string;
  result?: SyncMergeResult;
}

export const PEER_URL_KEY = 'learnwords-peer-url';
export const LAST_SYNC_ATTEMPT_KEY = 'learnwords-last-sync-timestamp';
export const LAST_SUCCESSFUL_SYNC_KEY = 'learnwords-last-successful-sync';

export const THROTTLE_INTERVAL_MS = 30_000; // 30 seconds
export const HEALTH_CHECK_TIMEOUT_MS = 2_000; // 2 seconds

let isSyncRunning = false;

export function isSyncInProgress(): boolean {
  return isSyncRunning;
}

export function resetSyncState(): void {
  isSyncRunning = false;
}

export function getStoredPeerUrl(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(PEER_URL_KEY);
}

export function getLastSuccessfulSyncTime(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(LAST_SUCCESSFUL_SYNC_KEY);
}

export async function checkPeerHealth(
  peerUrl: string,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS
): Promise<boolean> {
  const normalized = peerUrl.trim().replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${normalized}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function autoSync(options?: { force?: boolean }): Promise<AutoSyncOutcome> {
  // Concurrency guard: prevent overlapping runs
  if (isSyncRunning) {
    return { ran: false, error: 'Sync already in progress' };
  }

  const peerUrl = getStoredPeerUrl();
  if (!peerUrl) {
    return { ran: false, error: 'No peer URL configured' };
  }

  const now = Date.now();

  // Throttling: ignore calls within 30 seconds unless force is true
  if (!options?.force && typeof localStorage !== 'undefined') {
    const lastAttemptStr = localStorage.getItem(LAST_SYNC_ATTEMPT_KEY);
    if (lastAttemptStr) {
      const lastAttempt = parseInt(lastAttemptStr, 10);
      if (!Number.isNaN(lastAttempt) && now - lastAttempt < THROTTLE_INTERVAL_MS) {
        return { ran: false, error: 'Throttled: less than 30s since last attempt' };
      }
    }
  }

  isSyncRunning = true;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_SYNC_ATTEMPT_KEY, now.toString());
  }

  try {
    // Health check with 2-second timeout
    const isHealthy = await checkPeerHealth(peerUrl, HEALTH_CHECK_TIMEOUT_MS);
    if (!isHealthy) {
      // Fails silently when PC is offline/unreachable
      return { ran: false, error: 'Peer is offline or unreachable' };
    }

    const response = await syncWithLanPeer(peerUrl);
    if (response.success) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_SUCCESSFUL_SYNC_KEY, new Date().toISOString());
      }
      return {
        ran: true,
        summary: response.summary,
        result: response.result,
      };
    }

    return { ran: false, error: 'Sync failed' };
  } catch (err: any) {
    // Fails silently on network failure
    return { ran: false, error: err?.message || 'Sync network error' };
  } finally {
    isSyncRunning = false;
  }
}
