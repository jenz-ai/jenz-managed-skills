import { api, type Source, type Verdict } from '../api.js';

/** Import = fetch + audit in one call (the API auto-audits on import). Returns the verdict (never files). */
export const submitSkill = (source: Source): Promise<Verdict> => api.import(source);
