import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  autoSync,
  checkPeerHealth,
  normalizePeerUrl,
  resetSyncState,
  PEER_URL_KEY,
  LAST_SYNC_ATTEMPT_KEY,
  LAST_SUCCESSFUL_SYNC_KEY,
} from '../src/sync/autoSync';
import * as dataApi from '../src/api/data';

// Provide a lightweight in-memory localStorage mock for Node test environment
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createLocalStorageMock(),
    writable: true,
    configurable: true,
  });
}

describe('Automatic LAN Sync (autoSync)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSyncState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    resetSyncState();
    vi.restoreAllMocks();
  });

  describe('normalizePeerUrl', () => {
    it('normalizes bare IPv4 addresses and strips trailing slashes', () => {
      expect(normalizePeerUrl('192.168.1.42')).toBe('http://192.168.1.42:3001');
      expect(normalizePeerUrl('192.168.1.42:3001/')).toBe('http://192.168.1.42:3001');
      expect(normalizePeerUrl('http://192.168.1.42:3001')).toBe('http://192.168.1.42:3001');
      expect(normalizePeerUrl('  10.0.0.15  ')).toBe('http://10.0.0.15:3001');
      expect(normalizePeerUrl('my-laptop.local')).toBe('http://my-laptop.local:3001');
      expect(normalizePeerUrl('capacitor://localhost')).toBe('');
      expect(normalizePeerUrl('')).toBe('');
    });
  });

  describe('checkPeerHealth', () => {
    it('returns true when peer answers 200 OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const isHealthy = await checkPeerHealth('http://192.168.1.50:3001');
      expect(isHealthy).toBe(true);
      expect(fetch).toHaveBeenCalledWith('http://192.168.1.50:3001/api/health', expect.any(Object));
    });

    it('returns false when peer responds with 500 error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const isHealthy = await checkPeerHealth('http://192.168.1.50:3001');
      expect(isHealthy).toBe(false);
    });

    it('returns false and aborts when request times out after specified timeout (2s)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init: any) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          }
        });
      });

      // Use a short timeout of 50ms to verify abort logic deterministically
      const start = Date.now();
      const isHealthy = await checkPeerHealth('http://192.168.1.50:3001', 50);
      const elapsed = Date.now() - start;

      expect(isHealthy).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('returns false silently on network connection reset/refusal', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch'));

      const isHealthy = await checkPeerHealth('http://192.168.1.50:3001');
      expect(isHealthy).toBe(false);
    });
  });

  describe('autoSync logic and guards', () => {
    it('returns ran: false when no peer URL is configured', async () => {
      const outcome = await autoSync();
      expect(outcome.ran).toBe(false);
      expect(outcome.error).toBe('No peer URL configured');
    });

    it('throttles execution when invoked within 30 seconds of previous run', async () => {
      localStorage.setItem(PEER_URL_KEY, 'http://192.168.1.100:3001');
      const now = Date.now();
      // Set previous sync attempt 10 seconds ago
      localStorage.setItem(LAST_SYNC_ATTEMPT_KEY, (now - 10_000).toString());

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const outcome = await autoSync();

      expect(outcome.ran).toBe(false);
      expect(outcome.error).toContain('Throttled');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows execution when throttle interval (30s) has elapsed', async () => {
      localStorage.setItem(PEER_URL_KEY, 'http://192.168.1.100:3001');
      const now = Date.now();
      // Set previous sync attempt 35 seconds ago
      localStorage.setItem(LAST_SYNC_ATTEMPT_KEY, (now - 35_000).toString());

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      vi.spyOn(dataApi, 'syncWithLanPeer').mockResolvedValueOnce({
        success: true,
        summary: '+2 reviews',
        result: {
          success: true,
          wordsAdded: 0,
          wordsUpdated: 0,
          wordsDeleted: 0,
          foldersAdded: 0,
          foldersUpdated: 0,
          foldersDeleted: 0,
          reviewsMerged: 2,
        },
      });

      const outcome = await autoSync();
      expect(outcome.ran).toBe(true);
      expect(outcome.summary).toBe('+2 reviews');
      expect(localStorage.getItem(LAST_SUCCESSFUL_SYNC_KEY)).toBeTruthy();
    });

    it('allows execution when force option is true even if within throttle window', async () => {
      localStorage.setItem(PEER_URL_KEY, 'http://192.168.1.100:3001');
      localStorage.setItem(LAST_SYNC_ATTEMPT_KEY, Date.now().toString());

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      vi.spyOn(dataApi, 'syncWithLanPeer').mockResolvedValueOnce({
        success: true,
        summary: 'All data up to date',
        result: {
          success: true,
          wordsAdded: 0,
          wordsUpdated: 0,
          wordsDeleted: 0,
          foldersAdded: 0,
          foldersUpdated: 0,
          foldersDeleted: 0,
          reviewsMerged: 0,
        },
      });

      const outcome = await autoSync({ force: true });
      expect(outcome.ran).toBe(true);
      expect(outcome.summary).toBe('All data up to date');
    });

    it('concurrency guard prevents overlapping runs', async () => {
      localStorage.setItem(PEER_URL_KEY, 'http://192.168.1.100:3001');

      let resolveFetch: (value: any) => void;
      const hangingFetch = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(hangingFetch as any);

      // Start first autoSync without awaiting
      const firstRunPromise = autoSync({ force: true });

      // Immediate second autoSync while first is still awaiting fetch
      const secondOutcome = await autoSync({ force: true });

      expect(secondOutcome.ran).toBe(false);
      expect(secondOutcome.error).toBe('Sync already in progress');

      // Resolve the first fetch so it finishes cleanly
      resolveFetch!({ ok: false, status: 500 });
      await firstRunPromise;
    });

    it('fails silently when health check fails (PC is offline/unreachable)', async () => {
      localStorage.setItem(PEER_URL_KEY, 'http://192.168.1.100:3001');

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch'));
      const syncSpy = vi.spyOn(dataApi, 'syncWithLanPeer');

      const outcome = await autoSync({ force: true });

      expect(outcome.ran).toBe(false);
      expect(outcome.error).toBe('Peer is offline or unreachable');
      expect(syncSpy).not.toHaveBeenCalled();
    });

    it('fails silently when syncWithLanPeer throws network exception', async () => {
      localStorage.setItem(PEER_URL_KEY, 'http://192.168.1.100:3001');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      vi.spyOn(dataApi, 'syncWithLanPeer').mockRejectedValueOnce(
        new Error('Network disconnected mid-transfer')
      );

      const outcome = await autoSync({ force: true });

      expect(outcome.ran).toBe(false);
      expect(outcome.error).toBe('Network disconnected mid-transfer');
      expect(localStorage.getItem(LAST_SUCCESSFUL_SYNC_KEY)).toBeNull();
    });
  });
});
