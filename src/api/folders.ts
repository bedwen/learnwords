import { Folder, FolderListResponse } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';

export async function getFolders(): Promise<FolderListResponse> {
  return localRepository.getFolders();
}

export async function createFolder(data: { name: string; color: string }): Promise<Folder> {
  const folder = await localRepository.createFolder(data.name, data.color);
  clearCache('folders');
  clearCache('words');
  return folder;
}

export async function updateFolder(id: string, data: { name?: string; color?: string }): Promise<Folder> {
  const folder = await localRepository.updateFolder(id, data);
  if (!folder) throw new Error('Failed to update folder');
  clearCache('folders');
  clearCache('words');
  return folder;
}

export async function deleteFolder(id: string): Promise<void> {
  const deleted = await localRepository.deleteFolder(id);
  if (!deleted) throw new Error('Failed to delete folder');
  clearCache('folders');
  clearCache('words');
}
