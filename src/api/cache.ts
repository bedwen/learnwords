interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Retrieves a cached item if it exists and has not expired.
 * @param key Cache key identifier
 * @param maxAgeMs Maximum allowed age in milliseconds (default: 60,000ms / 1 minute)
 */
export function getCached<T>(key: string, maxAgeMs = 60000): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > maxAgeMs) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
}

/**
 * Stores an item in the in-memory cache with the current timestamp.
 * @param key Cache key identifier
 * @param data Data payload to cache
 */
export function setCached<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Clears cached entries. If a prefix is provided, only keys starting with the prefix are cleared.
 * Otherwise, the entire cache is cleared.
 * @param prefix Optional key prefix to clear (e.g. 'dashboard', 'words', 'folders')
 */
export function clearCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
