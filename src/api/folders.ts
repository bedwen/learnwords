import { Folder, FolderListResponse } from '../types';
import { clearCache } from './cache';

const API_BASE = '/api/folders';

export async function getFolders(): Promise<FolderListResponse> {
  const url = new URL(API_BASE, window.location.origin);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch folders');
  return res.json();
}

export async function createFolder(data: { name: string; color: string }): Promise<Folder> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create folder');
  clearCache('folders');
  clearCache('words');
  return res.json();
}

export async function updateFolder(id: string, data: { name?: string; color?: string }): Promise<Folder> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update folder');
  clearCache('folders');
  clearCache('words');
  return res.json();
}

export async function deleteFolder(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete folder');
  clearCache('folders');
  clearCache('words');
}
