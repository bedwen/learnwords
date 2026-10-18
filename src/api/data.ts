import { ExportData, CsvImportResult, SyncBundle, SyncMergeResult } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';
import { isMobileApp } from '../platform';
import { normalizePeerUrl } from '../sync/autoSync';

export type { ExportData, CsvImportResult, SyncBundle, SyncMergeResult };

const API_BASE = '/api/data';
const SYNC_REQUEST_TIMEOUT_MS = 15_000;

function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001';
}

function dispatchSyncedEvent(result: SyncMergeResult): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('learnwords:synced', { detail: result }));
  }
}

export async function exportData(): Promise<ExportData> {
  if (isMobileApp()) {
    return localRepository.exportData();
  }
  const url = new URL(`${API_BASE}/export`, getOrigin());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to export data');
  return res.json();
}

export async function importData(data: ExportData): Promise<void> {
  if (isMobileApp()) {
    await localRepository.restoreData(data);
    clearCache();
    return;
  }
  const url = new URL(`${API_BASE}/import`, getOrigin());
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Confirm-Replace': 'true',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to import data');
  }
  clearCache();
}

export async function importWordsCsv(file: File): Promise<CsvImportResult> {
  if (isMobileApp()) {
    const text = await file.text();
    const result = await localRepository.importWordsCsv(text);
    if (result.success) {
      clearCache();
    }
    return result;
  }
  const url = new URL(`${API_BASE}/import-words`, getOrigin());
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(url.toString(), {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (errorData.errors && errorData.errors.length > 0) {
      throw new Error(errorData.errors.join('\n'));
    }
    throw new Error(errorData.error || 'Failed to import CSV');
  }

  clearCache();
  return res.json();
}

export async function exportWordsCsv(folderId?: string): Promise<{ blob: Blob; filename: string }> {
  if (isMobileApp()) {
    const csvContent = await localRepository.exportWordsCsv(folderId);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `learnwords-words-${new Date().toISOString().split('T')[0]}.csv`;
    return { blob, filename };
  }
  let urlStr = `${API_BASE}/export-words`;
  if (folderId) {
    urlStr += `?folderId=${encodeURIComponent(folderId)}`;
  }
  const url = new URL(urlStr, getOrigin());
  const res = await fetch(url.toString());

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to export CSV');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="(.+)"/);
  const filename = filenameMatch?.[1] ?? `learnwords-words-${new Date().toISOString().split('T')[0]}.csv`;

  return { blob, filename };
}

export async function exportSyncBundle(): Promise<{ blob: Blob; filename: string }> {
  if (isMobileApp()) {
    const bundle = await localRepository.exportSyncBundle();
    const jsonContent = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const filename = `learnwords-sync-bundle-${new Date().toISOString().split('T')[0]}.json`;
    return { blob, filename };
  }
  const url = new URL('/api/sync/bundle', getOrigin());
  const res = await fetch(url.toString());
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to export sync bundle from server');
  }
  const bundle = await res.json();
  const jsonContent = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const filename = `learnwords-sync-bundle-${new Date().toISOString().split('T')[0]}.json`;
  return { blob, filename };
}

export async function importSyncBundle(file: File): Promise<SyncMergeResult> {
  const text = await file.text();
  const bundle = JSON.parse(text) as SyncBundle;

  if (isMobileApp()) {
    const result = await localRepository.mergeSyncBundle(bundle);
    if (result.success) {
      clearCache();
      dispatchSyncedEvent(result);
    }
    return result;
  }

  const url = new URL('/api/sync', getOrigin());
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bundle }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to merge sync bundle');
  }

  const data = await res.json();
  clearCache();
  dispatchSyncedEvent(data.result);
  return data.result;
}

export async function syncWithLanPeer(
  peerUrl?: string
): Promise<{ success: boolean; result: SyncMergeResult; summary: string }> {
  let normalizedUrl = normalizePeerUrl(peerUrl);
  if (!normalizedUrl && !isMobileApp()) {
    normalizedUrl = normalizePeerUrl(getOrigin());
  }
  if (!normalizedUrl) {
    throw new Error("Please enter your computer's LAN IP address (e.g. 192.168.1.100:3001).");
  }

  if (isMobileApp()) {
    const localBundle = await localRepository.exportSyncBundle();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${normalizedUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bundle: localBundle }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || `LAN Sync failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.serverBundle) {
      throw new Error('Peer did not return a server bundle');
    }

    const localMergeResult = await localRepository.mergeSyncBundle(data.serverBundle);
    clearCache();

    const combinedResult: SyncMergeResult = {
      success: true,
      wordsAdded: (data.result?.wordsAdded || 0) + localMergeResult.wordsAdded,
      wordsUpdated: (data.result?.wordsUpdated || 0) + localMergeResult.wordsUpdated,
      wordsDeleted: (data.result?.wordsDeleted || 0) + localMergeResult.wordsDeleted,
      foldersAdded: (data.result?.foldersAdded || 0) + localMergeResult.foldersAdded,
      foldersUpdated: (data.result?.foldersUpdated || 0) + localMergeResult.foldersUpdated,
      foldersDeleted: (data.result?.foldersDeleted || 0) + localMergeResult.foldersDeleted,
      reviewsMerged: (data.result?.reviewsMerged || 0) + localMergeResult.reviewsMerged,
    };

    dispatchSyncedEvent(combinedResult);

    const parts: string[] = [];
    if (combinedResult.wordsAdded > 0) parts.push(`+${combinedResult.wordsAdded} words`);
    if (combinedResult.wordsUpdated > 0) parts.push(`${combinedResult.wordsUpdated} updated`);
    if (combinedResult.wordsDeleted > 0) parts.push(`${combinedResult.wordsDeleted} deleted`);
    if (combinedResult.foldersAdded > 0) parts.push(`+${combinedResult.foldersAdded} folders`);
    if (combinedResult.reviewsMerged > 0) parts.push(`+${combinedResult.reviewsMerged} reviews`);

    const summary = parts.length > 0 ? parts.join(', ') : 'All data up to date';

    return {
      success: true,
      result: combinedResult,
      summary,
    };
  }

  // Desktop mode: fetch local server bundle, send to peer, then merge peer's serverBundle into local server
  const localRes = await fetch(new URL('/api/sync/bundle', getOrigin()).toString());
  if (!localRes.ok) {
    const errorBody = await localRes.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Failed to export local server bundle');
  }
  const localBundle = await localRes.json();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${normalizedUrl}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bundle: localBundle }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `LAN Sync failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data.serverBundle) {
    throw new Error('Peer did not return a server bundle');
  }

  const localMergeRes = await fetch(new URL('/api/sync', getOrigin()).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bundle: data.serverBundle }),
  });

  if (!localMergeRes.ok) {
    const errorBody = await localMergeRes.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Failed to merge peer bundle into local server');
  }

  const localMergeData = await localMergeRes.json();
  const localMergeResult: SyncMergeResult = localMergeData.result || {
    success: true,
    wordsAdded: 0,
    wordsUpdated: 0,
    wordsDeleted: 0,
    foldersAdded: 0,
    foldersUpdated: 0,
    foldersDeleted: 0,
    reviewsMerged: 0,
  };
  clearCache();

  const combinedResult: SyncMergeResult = {
    success: true,
    wordsAdded: (data.result?.wordsAdded || 0) + localMergeResult.wordsAdded,
    wordsUpdated: (data.result?.wordsUpdated || 0) + localMergeResult.wordsUpdated,
    wordsDeleted: (data.result?.wordsDeleted || 0) + localMergeResult.wordsDeleted,
    foldersAdded: (data.result?.foldersAdded || 0) + localMergeResult.foldersAdded,
    foldersUpdated: (data.result?.foldersUpdated || 0) + localMergeResult.foldersUpdated,
    foldersDeleted: (data.result?.foldersDeleted || 0) + localMergeResult.foldersDeleted,
    reviewsMerged: (data.result?.reviewsMerged || 0) + localMergeResult.reviewsMerged,
  };

  dispatchSyncedEvent(combinedResult);

  const parts: string[] = [];
  if (combinedResult.wordsAdded > 0) parts.push(`+${combinedResult.wordsAdded} words`);
  if (combinedResult.wordsUpdated > 0) parts.push(`${combinedResult.wordsUpdated} updated`);
  if (combinedResult.wordsDeleted > 0) parts.push(`${combinedResult.wordsDeleted} deleted`);
  if (combinedResult.foldersAdded > 0) parts.push(`+${combinedResult.foldersAdded} folders`);
  if (combinedResult.reviewsMerged > 0) parts.push(`+${combinedResult.reviewsMerged} reviews`);

  const summary = parts.length > 0 ? parts.join(', ') : 'All data up to date';

  return {
    success: true,
    result: combinedResult,
    summary,
  };
}
