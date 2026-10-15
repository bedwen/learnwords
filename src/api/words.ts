import { CEFRLevel, CreateWordDto, UpdateWordDto, WordWithState } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';

export async function getWords(params?: {
  search?: string;
  level?: string;
  status?: string;
  sortBy?: string;
  order?: string;
  folderId?: string;
}): Promise<WordWithState[]> {
  return localRepository.getWords(params as any);
}

export async function getWordById(id: string): Promise<WordWithState> {
  const word = await localRepository.getWordById(id);
  if (!word) throw new Error('Failed to fetch word');
  return word;
}

export async function createWord(data: CreateWordDto): Promise<WordWithState> {
  const word = await localRepository.createWord(data);
  clearCache('home');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
  return word;
}

export async function updateWord(id: string, data: UpdateWordDto): Promise<WordWithState> {
  const word = await localRepository.updateWord(id, data);
  if (!word) throw new Error('Failed to update word');
  clearCache('home');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
  return word;
}

export async function deleteWord(id: string): Promise<void> {
  const deleted = await localRepository.deleteWord(id);
  if (!deleted) throw new Error('Failed to delete word');
  clearCache('home');
  clearCache('dashboard');
  clearCache('words');
  clearCache('folders');
}

export async function removeWordFromFolder(wordId: string, folderId: string): Promise<void> {
  await localRepository.removeWordFromFolder(wordId, folderId);
  clearCache('words');
  clearCache('folders');
}

export async function batchUpdateCefr(
  wordIds: string[],
  level: CEFRLevel
): Promise<{ success: boolean; count: number }> {
  const count = await localRepository.batchUpdateCefr(wordIds, level);
  clearCache('words');
  clearCache('home');
  clearCache('dashboard');
  return { success: true, count };
}

export async function batchDeleteWords(wordIds: string[]): Promise<{ success: boolean; count: number }> {
  const count = await localRepository.batchDeleteWords(wordIds);
  clearCache('words');
  clearCache('folders');
  clearCache('home');
  clearCache('dashboard');
  return { success: true, count };
}

export async function batchUpdateFolder(
  wordIds: string[],
  folderId: string,
  action: 'add' | 'remove'
): Promise<{ success: boolean }> {
  await localRepository.batchUpdateFolder(wordIds, folderId, action);
  clearCache('words');
  clearCache('folders');
  return { success: true };
}
