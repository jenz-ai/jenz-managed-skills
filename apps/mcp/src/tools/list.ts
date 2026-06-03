import { api, type ListResult } from '../api.js';

export function listManagedSkills(
  filter: { category?: string; risk?: string; query?: string },
): Promise<ListResult> {
  const q = new URLSearchParams();
  if (filter.category) q.set('category', filter.category);
  if (filter.risk) q.set('risk', filter.risk);
  if (filter.query) q.set('query', filter.query);
  const s = q.toString();
  return api.list(s ? `?${s}` : '');
}
