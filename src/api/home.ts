import { HomeSummary, DetailedStats } from '../types';
import { localRepository } from '../storage/localRepository';
import { isMobileApp } from '../platform';

const API_BASE = '/api/home';

function getOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001';
}

export async function getHomeSummary(): Promise<HomeSummary> {
  if (isMobileApp()) {
    return localRepository.getHomeSummary();
  }
  const url = new URL(`${API_BASE}/summary`, getOrigin());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch home summary');
  return res.json();
}

export async function getDetailedStats(): Promise<DetailedStats> {
  if (isMobileApp()) {
    return localRepository.getDetailedStats();
  }
  const url = new URL(`${API_BASE}/detailed`, getOrigin());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch detailed stats');
  return res.json();
}

// Backwards compatibility alias
export const getDashboardSummary = getHomeSummary;
