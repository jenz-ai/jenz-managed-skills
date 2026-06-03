import { api } from '../api.js';

export type PullResult =
  | { ok: true; files: { path: string; content: string }[]; hint: string }
  | { ok: false; risk: 'pending' | 'suspicious' | 'malicious'; reason: string };

const BLOCKED_RISKS = ['pending', 'suspicious', 'malicious'] as const;
type BlockedRisk = (typeof BLOCKED_RISKS)[number];
// Fail closed: any risk that isn't one of the three blocked values (including 'safe',
// undefined, or garbage from a misbehaving backend) collapses to 'malicious'. We never
// cast 'safe' into the blocked branch.
const blockedRisk = (r: unknown): BlockedRisk =>
  BLOCKED_RISKS.includes(r as BlockedRisk) ? (r as BlockedRisk) : 'malicious';

export async function pullSkill(id: string): Promise<PullResult> {
  const { status, body } = await api.files(id);
  if (status !== 200) {
    return {
      ok: false,
      risk: blockedRisk(body.risk),
      reason: body.reason ?? body.error ?? 'blocked',
    };
  }
  // 200 contract: the gate returns `{ files }` on a safe response (no top-level `name`).
  // Fail closed if a malformed 200 is missing files rather than returning files:undefined.
  if (!body.files) {
    throw new Error('malformed 200 from gate: missing files');
  }
  return {
    ok: true,
    files: body.files,
    hint: 'Write these to ~/.claude/skills/<name>/ then re-run skill discovery.',
  };
}
