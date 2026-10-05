import { WordWithState, ReviewRating } from '../types';
import { clearCache } from './cache';

const API_BASE = '/api/study';

export async function getStudyQueue(folderId?: string): Promise<WordWithState[]> {
  const url = new URL(`${API_BASE}/queue`, window.location.origin);
  if (folderId) {
    url.searchParams.append('folderId', folderId);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch study queue');
  return res.json();
}

export async function submitReview(wordId: string, rating: ReviewRating): Promise<WordWithState> {
  const res = await fetch(`${API_BASE}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wordId, rating }),
  });
  if (!res.ok) throw new Error('Failed to submit review');
  clearCache('dashboard');
  clearCache('detailed_stats');
  return res.json();
}
