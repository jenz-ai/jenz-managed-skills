import type { AuditedSkill, Risk } from '@jenz/shared';
import type { Source } from './schemas.js';

const base = () => process.env.JENZ_API ?? 'http://localhost:8787/api';
const headers = () => ({
  'x-jenz-workspace': process.env.JENZ_WORKSPACE ?? 'demo',
  'Content-Type': 'application/json',
});

export type { Source };
export type Verdict = AuditedSkill & { id: string };
export interface ImportResult { id: string; name: string; }
export interface ListItem {
  id: string; name: string; risk: Risk;
  category: string; description: string; findingsCount: number;
}
export interface ListResult { skills: ListItem[]; }
export interface FilesResponse {
  status: number;
  body: {
    name?: string;
    files?: { path: string; content: string }[];
    error?: string; risk?: Risk; reason?: string;
  };
}

export const api = {
  import: (source: Source): Promise<ImportResult> =>
    fetch(`${base()}/skills/import`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ source }),
    }).then((r) => r.json() as Promise<ImportResult>),

  audit: (id: string): Promise<Verdict> =>
    fetch(`${base()}/skills/${id}/audit`, { method: 'POST', headers: headers() })
      .then((r) => r.json() as Promise<Verdict>),

  list: (query = ''): Promise<ListResult> =>
    fetch(`${base()}/skills${query}`, { headers: headers() })
      .then((r) => r.json() as Promise<ListResult>),

  get: (id: string): Promise<Verdict> =>
    fetch(`${base()}/skills/${id}`, { headers: headers() })
      .then((r) => r.json() as Promise<Verdict>),

  files: async (id: string): Promise<FilesResponse> => {
    const r = await fetch(`${base()}/skills/${id}/files`, { headers: headers() });
    return { status: r.status, body: await r.json() };
  },
};
