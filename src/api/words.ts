import { CreateWordDto, UpdateWordDto, WordWithState } from '../types';

const API_BASE = '/api/words';

export async function getWords(params?: {
  search?: string;
  level?: string;
  status?: string;
  sortBy?: string;
  order?: string;
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

export async function createWord(data: CreateWordDto): Promise<WordWithState> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create word');
  return res.json();
}

export async function updateWord(id: string, data: UpdateWordDto): Promise<WordWithState> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update word');
  return res.json();
}

export async function deleteWord(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete word');
}
