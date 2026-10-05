export interface ExportData {
  schemaVersion: number;
  exportedAt: string;
  wordCount: number;
  data: {
    words: any[];
    learning_states: any[];
    review_history: any[];
    folders: any[];
    word_folders: any[];
  };
}

export interface CsvImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

const API_BASE = '/api/data';

export async function exportData(): Promise<ExportData> {
  const url = new URL(`${API_BASE}/export`, window.location.origin);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to export data');
  return res.json();
}

export async function importData(data: ExportData): Promise<void> {
  const url = new URL(`${API_BASE}/import`, window.location.origin);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Confirm-Replace': 'true'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to import data');
  }
}

export async function importWordsCsv(file: File): Promise<CsvImportResult> {
  const url = new URL(`${API_BASE}/import-words`, window.location.origin);
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
  
  return res.json();
}

export async function exportWordsCsv(folderId?: string): Promise<{ blob: Blob, filename: string }> {
  let urlStr = `${API_BASE}/export-words`;
  if (folderId) {
    urlStr += `?folderId=${encodeURIComponent(folderId)}`;
  }
  const url = new URL(urlStr, window.location.origin);
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
