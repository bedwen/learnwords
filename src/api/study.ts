import { WordWithState, ReviewRating } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';
import { isMobileApp } from '../platform';

const API_BASE = '/api/study';

function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001';
}

export async function getStudyQueue(folderId?: string): Promise<WordWithState[]> {
  if (isMobileApp()) {
    return localRepository.getStudyQueue(50, folderId);
  }
  const url = new URL(`${API_BASE}/queue`, getOrigin());
  if (folderId) {
    url.searchParams.append('folderId', folderId);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch study queue');
  return res.json();
}

export async function submitReview(wordId: string, rating: ReviewRating): Promise<WordWithState> {
  let result: WordWithState;
  if (isMobileApp()) {
    result = await localRepository.processReview(wordId, rating);
  } else {
    const res = await fetch(`${API_BASE}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wordId, rating }),
    });
    if (!res.ok) throw new Error('Failed to submit review');
    result = await res.json();
  }
  clearCache('home');
  clearCache('dashboard');
  clearCache('detailed_stats');
  return result;
}
