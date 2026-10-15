import { HomeSummary, DetailedStats } from '../types';
import { localRepository } from '../storage/localRepository';

export async function getHomeSummary(): Promise<HomeSummary> {
  return localRepository.getHomeSummary();
}

export async function getDetailedStats(): Promise<DetailedStats> {
  return localRepository.getDetailedStats();
}

// Backwards compatibility alias
export const getDashboardSummary = getHomeSummary;
