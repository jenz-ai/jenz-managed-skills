import { api, ApiError, type ListItem } from '../api.js';

/** `available:false` means the backend doesn't mount a list route (e.g. the current live API). */
export interface ListOutcome { skills: ListItem[]; available: boolean; }

export async function listManagedSkills(
  filter: { category?: string; risk?: string; query?: string },
): Promise<ListOutcome> {
  const q = new URLSearchParams();
  if (filter.category) q.set('category', filter.category);
  if (filter.risk) q.set('risk', filter.risk);
  if (filter.query) q.set('query', filter.query);
  const s = q.toString();
  try {
    const res = await api.list(s ? `?${s}` : '');
    return { skills: res.skills, available: true };
  } catch (e) {
    // 404 = the list endpoint isn't mounted on this backend → degrade, don't error.
    if (e instanceof ApiError && e.status === 404) return { skills: [], available: false };
    throw e; // real failures still surface as a tool error
  }
}
