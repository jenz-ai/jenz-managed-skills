import { api, type Source, type Verdict } from '../api.js';

/** Import then audit — chained. Returns the verdict (never files). */
export async function submitSkill(source: Source): Promise<Verdict> {
  const { id } = await api.import(source);
  return api.audit(id);
}
