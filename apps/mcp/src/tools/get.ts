import { api, type Verdict } from '../api.js';

export const getSkill = (id: string): Promise<Verdict> => api.get(id);
