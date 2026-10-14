import { HomeSummary, DetailedStats } from '../types';

const API_BASE = '/api/home';

export async function getHomeSummary(): Promise<HomeSummary> {
  const url = new URL(`${API_BASE}/summary`, window.location.origin);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch home summary');
  return res.json();
}

export async function getDetailedStats(): Promise<DetailedStats> {
  const url = new URL(`${API_BASE}/detailed`, window.location.origin);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch detailed stats');
  return res.json();
}

// Backwards compatibility alias
export const getDashboardSummary = getHomeSummary;
