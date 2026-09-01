import { DashboardSummary, DetailedStats } from '../types';

const API_BASE = '/api/dashboard';

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const url = new URL(`${API_BASE}/summary`, window.location.origin);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch dashboard summary');
  return res.json();
}

export async function getDetailedStats(): Promise<DetailedStats> {
  const url = new URL(`${API_BASE}/detailed`, window.location.origin);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch detailed stats');
  return res.json();
}
