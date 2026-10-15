import { ExportData, CsvImportResult, SyncBundle, SyncMergeResult } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';

export type { ExportData, CsvImportResult, SyncBundle, SyncMergeResult };

export async function exportData(): Promise<ExportData> {
  return localRepository.exportData();
}

export async function importData(data: ExportData): Promise<void> {
  await localRepository.restoreData(data);
  clearCache();
}

export async function importWordsCsv(file: File): Promise<CsvImportResult> {
  const text = await file.text();
  const result = await localRepository.importWordsCsv(text);
  if (result.success) {
    clearCache();
  }
  return result;
}

export async function exportWordsCsv(folderId?: string): Promise<{ blob: Blob; filename: string }> {
  const csvContent = await localRepository.exportWordsCsv(folderId);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = `learnwords-words-${new Date().toISOString().split('T')[0]}.csv`;
  return { blob, filename };
}

export async function exportSyncBundle(): Promise<{ blob: Blob; filename: string }> {
  const bundle = await localRepository.exportSyncBundle();
  const jsonContent = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const filename = `learnwords-sync-bundle-${new Date().toISOString().split('T')[0]}.json`;
  return { blob, filename };
}

export async function importSyncBundle(file: File): Promise<SyncMergeResult> {
  const text = await file.text();
  const bundle = JSON.parse(text) as SyncBundle;
  const result = await localRepository.mergeSyncBundle(bundle);
  if (result.success) {
    clearCache();
  }
  return result;
}

export async function syncWithLanPeer(
  peerUrl?: string
): Promise<{ success: boolean; result: SyncMergeResult; summary: string }> {
  let normalizedUrl = (peerUrl || '').trim();
  if (!normalizedUrl) {
    normalizedUrl = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001';
  }
  normalizedUrl = normalizedUrl.replace(/\/+$/, '');

  const localBundle = await localRepository.exportSyncBundle();

  const response = await fetch(`${normalizedUrl}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bundle: localBundle }),
  });

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


