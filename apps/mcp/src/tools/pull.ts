import { api } from '../api.js';

export type PullResult =
  | { ok: true; name: string; files: { path: string; content: string }[]; hint: string }
  | { ok: false; risk: 'pending' | 'suspicious' | 'malicious'; reason: string };

export async function pullSkill(id: string): Promise<PullResult> {
  const { status, body } = await api.files(id);
  if (status !== 200) {
    return {
      ok: false,
      risk: (body.risk ?? 'malicious') as 'pending' | 'suspicious' | 'malicious',
      reason: body.reason ?? body.error ?? 'blocked',
    };
  }
  return {
    ok: true,
    name: body.name!,
    files: body.files!,
    hint: 'Write these to ~/.claude/skills/<name>/ then re-run skill discovery.',
  };
}
