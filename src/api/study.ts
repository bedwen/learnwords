import { WordWithState, ReviewRating } from '../types';

const API_BASE = '/api/study';

export async function getStudyQueue(): Promise<WordWithState[]> {
  const url = new URL(`${API_BASE}/queue`, window.location.origin);
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
  return res.json();
}
