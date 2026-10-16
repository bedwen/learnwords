import { Folder, FolderListResponse } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';
import { isMobileApp } from '../platform';

const API_BASE = '/api/folders';

function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001';
}

export async function getFolders(): Promise<FolderListResponse> {
  if (isMobileApp()) {
    return localRepository.getFolders();
  }
  const url = new URL(API_BASE, getOrigin());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch folders');
  return res.json();
}

export async function createFolder(data: { name: string; color: string }): Promise<Folder> {
  let folder: Folder;
  if (isMobileApp()) {
    folder = await localRepository.createFolder(data.name, data.color);
  } else {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create folder');
    folder = await res.json();
  }
  clearCache('folders');
  clearCache('words');
  return folder;
}

export async function updateFolder(id: string, data: { name?: string; color?: string }): Promise<Folder> {
  let folder: Folder;
  if (isMobileApp()) {
    const updated = await localRepository.updateFolder(id, data);
    if (!updated) throw new Error('Failed to update folder');
    folder = updated;
  } else {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update folder');
    folder = await res.json();
  }
  clearCache('folders');
  clearCache('words');
  return folder;
}

export async function deleteFolder(id: string): Promise<void> {
  if (isMobileApp()) {
    const deleted = await localRepository.deleteFolder(id);
    if (!deleted) throw new Error('Failed to delete folder');
  } else {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete folder');
  }
  clearCache('folders');
  clearCache('words');
}
