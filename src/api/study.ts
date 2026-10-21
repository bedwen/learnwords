import { WordWithState, ReviewRating, StudyMode } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache, getCached, setCached } from './cache';
import { isMobileApp } from '../platform';

const API_BASE = '/api/study';

function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001';
}

export async function getStudyQueue(
  folderId?: string,
  mode: StudyMode = 'words',
  practiceAll = false
): Promise<WordWithState[]> {
  const cacheKey = `study_queue_${folderId || 'all'}_${mode}`;
  if (!practiceAll) {
    const cached = getCached<WordWithState[]>(cacheKey);
    if (cached) return cached;
  }

  let queue: WordWithState[];
  if (isMobileApp()) {
    queue = practiceAll
      ? await localRepository.getStudyQueue(50, folderId, mode, true)
      : await localRepository.getStudyQueue(50, folderId, mode);
  } else {
    const url = new URL(`${API_BASE}/queue`, getOrigin());
    if (folderId) {
      url.searchParams.append('folderId', folderId);
    }
    if (mode) {
      url.searchParams.append('mode', mode);
    }
    if (practiceAll) {
      url.searchParams.append('practiceAll', 'true');
    }
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to fetch study queue');
    queue = await res.json();
  }

  if (!practiceAll) {
    setCached(cacheKey, queue);
  }
  return queue;
}

export async function submitReview(
  wordId: string,
  rating: ReviewRating,
  mode?: StudyMode
): Promise<WordWithState> {
  let result: WordWithState;
  if (isMobileApp()) {
    result =
      mode === 'sentences'
        ? await localRepository.processReview(wordId, rating, 'sentences')
        : await localRepository.processReview(wordId, rating);
  } else {
    const payload = mode === 'sentences' ? { wordId, rating, mode } : { wordId, rating };
    const res = await fetch(`${API_BASE}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to submit review');
    result = await res.json();
  }
  clearCache('home');
  clearCache('dashboard');
  clearCache('detailed_stats');
  clearCache('study_queue');
  return result;
}
