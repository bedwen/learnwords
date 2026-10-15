import { WordWithState, ReviewRating } from '../types';
import { localRepository } from '../storage/localRepository';
import { clearCache } from './cache';

export async function getStudyQueue(folderId?: string): Promise<WordWithState[]> {
  return localRepository.getStudyQueue(50, folderId);
}

export async function submitReview(wordId: string, rating: ReviewRating): Promise<WordWithState> {
  const result = await localRepository.processReview(wordId, rating);
  clearCache('home');
  clearCache('dashboard');
  clearCache('detailed_stats');
  return result;
}
