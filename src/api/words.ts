import { CEFRLevel, CreateWordDto, UpdateWordDto, WordWithState } from '../types';
import { clearCache } from './cache';

const API_BASE = '/api/words';

export async function getWords(params?: {
  search?: string;
  level?: string;
  status?: string;
  sortBy?: string;
  order?: string;
  folderId?: string;
}): Promise<WordWithState[]> {
  const url = new URL(API_BASE, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch words');
  return res.json();
}

export async function getWordById(id: string): Promise<WordWithState> {
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error('Failed to fetch word');
  return res.json();
}

export async function createWord(data: CreateWordDto): Promise<WordWithState> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create word');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
  return res.json();
}

export async function updateWord(id: string, data: UpdateWordDto): Promise<WordWithState> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update word');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
  return res.json();
}

export async function deleteWord(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete word');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
}

export async function removeWordFromFolder(wordId: string, folderId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${wordId}/folders/${folderId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove word from folder');
  clearCache('words');
  clearCache('folders');
}

async function postBatch<T>(path: string, body: unknown, fallbackError: string): Promise<T> {
  const res = await fetch(`${API_BASE}/batch/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || fallbackError);
  }
  return res.json();
}

export async function batchUpdateCefr(
  wordIds: string[],
  level: CEFRLevel
): Promise<{ success: boolean; count: number }> {
  const result = await postBatch<{ success: boolean; count: number }>(
    'cefr',
    { wordIds, level },
    'Failed to update CEFR level'
  );
  clearCache('words');
  clearCache('dashboard');
  return result;
}

export async function batchDeleteWords(wordIds: string[]): Promise<{ success: boolean; count: number }> {
  const result = await postBatch<{ success: boolean; count: number }>(
    'delete',
    { wordIds },
    'Failed to delete words'
  );
  clearCache('words');
  clearCache('folders');
  clearCache('dashboard');
  return result;
}

export async function batchUpdateFolder(
  wordIds: string[],
  folderId: string,
  action: 'add' | 'remove'
): Promise<{ success: boolean }> {
  const result = await postBatch<{ success: boolean }>(
    'folder',
    { wordIds, folderId, action },
    action === 'add' ? 'Failed to add words to folder' : 'Failed to remove words from folder'
  );
  clearCache('words');
  clearCache('folders');
  return result;
}
