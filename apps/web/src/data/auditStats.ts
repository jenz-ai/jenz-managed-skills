// AuditHome headline stats, derived from the live skill library (GET /skills).
// Every skill that reaches the workspace has already passed through the audit,
// so `audited` is just the total; `safe` are the ones in the library and
// `threats` are the quarantined (suspicious + malicious) ones.
import type { Skill } from "../state/types";

export interface AuditHomeStats {
  audited: number;
  safe: number;
  threats: number;
}

export function auditHomeStats(skills: Skill[]): AuditHomeStats {
  let safe = 0;
  let threats = 0;
  for (const s of skills) {
    if (s.risk === "safe") safe++;
    else if (s.risk === "suspicious" || s.risk === "malicious") threats++;
  }
  return { audited: skills.length, safe, threats };
}
