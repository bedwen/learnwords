import { CEFRLevel, CreateWordDto, UpdateWordDto, WordWithState } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';
import { isMobileApp } from '../platform';

const API_BASE = '/api/words';

function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001';
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

export async function getWords(params?: {
  search?: string;
  level?: string;
  status?: string;
  sortBy?: string;
  order?: string;
  folderId?: string;
}): Promise<WordWithState[]> {
  if (isMobileApp()) {
    return localRepository.getWords(params as any);
  }
  const url = new URL(API_BASE, getOrigin());
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
  if (isMobileApp()) {
    const word = await localRepository.getWordById(id);
    if (!word) throw new Error('Failed to fetch word');
    return word;
  }
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error('Failed to fetch word');
  return res.json();
}

export async function createWord(data: CreateWordDto): Promise<WordWithState> {
  let word: WordWithState;
  if (isMobileApp()) {
    word = await localRepository.createWord(data);
  } else {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create word');
    word = await res.json();
  }
  clearCache('home');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
  return word;
}

export async function updateWord(id: string, data: UpdateWordDto): Promise<WordWithState> {
  let word: WordWithState;
  if (isMobileApp()) {
    const updated = await localRepository.updateWord(id, data);
    if (!updated) throw new Error('Failed to update word');
    word = updated;
  } else {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update word');
    word = await res.json();
  }
  clearCache('home');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
  return word;
}

export async function deleteWord(id: string): Promise<void> {
  if (isMobileApp()) {
    const deleted = await localRepository.deleteWord(id);
    if (!deleted) throw new Error('Failed to delete word');
  } else {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete word');
  }
  clearCache('home');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
}

export async function removeWordFromFolder(wordId: string, folderId: string): Promise<void> {
  if (isMobileApp()) {
    await localRepository.removeWordFromFolder(wordId, folderId);
  } else {
    const res = await fetch(`${API_BASE}/${wordId}/folders/${folderId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove word from folder');
  }
  clearCache('words');
  clearCache('folders');
}

export async function batchUpdateCefr(
  wordIds: string[],
  level: CEFRLevel
): Promise<{ success: boolean; count: number }> {
  let result: { success: boolean; count: number };
  if (isMobileApp()) {
    const count = await localRepository.batchUpdateCefr(wordIds, level);
    result = { success: true, count };
  } else {
    result = await postBatch<{ success: boolean; count: number }>(
      'cefr',
      { wordIds, level },
      'Failed to update CEFR level'
    );
  }
  clearCache('words');
  clearCache('home');
  clearCache('dashboard');
  return result;
}

export async function batchDeleteWords(wordIds: string[]): Promise<{ success: boolean; count: number }> {
  let result: { success: boolean; count: number };
  if (isMobileApp()) {
    const count = await localRepository.batchDeleteWords(wordIds);
    result = { success: true, count };
  } else {
    result = await postBatch<{ success: boolean; count: number }>(
      'delete',
      { wordIds },
      'Failed to delete words'
    );
  }
  clearCache('words');
  clearCache('folders');
  clearCache('home');
  clearCache('dashboard');
  return result;
}

export async function batchUpdateFolder(
  wordIds: string[],
  folderId: string,
  action: 'add' | 'remove'
): Promise<{ success: boolean }> {
  let result: { success: boolean };
  if (isMobileApp()) {
    await localRepository.batchUpdateFolder(wordIds, folderId, action);
    result = { success: true };
  } else {
    result = await postBatch<{ success: boolean }>(
      'folder',
      { wordIds, folderId, action },
      action === 'add' ? 'Failed to add words to folder' : 'Failed to remove words from folder'
    );
  }
  clearCache('words');
  clearCache('folders');
  return result;
}
