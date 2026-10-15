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

