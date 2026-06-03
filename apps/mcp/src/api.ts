import type { AuditedSkill, Risk } from '@jenz/shared';
import type { Source } from './schemas.js';

const base = () => (process.env.JENZ_API ?? 'http://localhost:8787/api').replace(/\/$/, '');
const headers = () => ({
  'x-jenz-workspace': process.env.JENZ_WORKSPACE ?? 'demo',
  'Content-Type': 'application/json',
});

// Throw on non-2xx so the tool layer's try/catch surfaces a real error instead of
// silently casting an error body to a success type. NOTE: files() does NOT use this —
// it needs the 403 status intact (that's the gate).
const ok = (r: Response): Response => {
  if (!r.ok) throw new Error(`jenz API ${r.status} ${r.statusText} @ ${r.url}`);
  return r;
};

export type { Source };
export type Verdict = AuditedSkill & { id: string };
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
  // The API auto-audits on import and returns the full verdict (AuditedSkill + id) in one call.
  import: (source: Source): Promise<Verdict> =>
    fetch(`${base()}/skills/import`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ source }),
    }).then(ok).then((r) => r.json() as Promise<Verdict>),

  list: (query = ''): Promise<ListResult> =>
    fetch(`${base()}/skills${query}`, { headers: headers() })
      .then(ok).then((r) => r.json() as Promise<ListResult>),

  get: (id: string): Promise<Verdict> =>
    fetch(`${base()}/skills/${id}`, { headers: headers() })
      .then(ok).then((r) => r.json() as Promise<Verdict>),

  files: async (id: string): Promise<FilesResponse> => {
    const r = await fetch(`${base()}/skills/${id}/files`, { headers: headers() });
    return { status: r.status, body: await r.json() };
  },
};
