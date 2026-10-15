import { ExportData, CsvImportResult } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';

export type { ExportData, CsvImportResult };

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
