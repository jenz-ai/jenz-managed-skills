// Audit home — past audit runs + headline stats. Ported verbatim from
// skills-history.jsx (AUDIT_HISTORY + trigMeta).
export interface AuditRun {
  id: string;
  when: string;
  trigger: "mcp" | "upload" | "github" | "import";
  source: string;
  scanned: number;
  safe: number;
  suspicious: number;
  malicious: number;
}

export const AUDIT_HISTORY: AuditRun[] = [
  { id: "a1", when: "Today · 14:22", trigger: "mcp", source: "Claude Code", scanned: 4, safe: 4, suspicious: 0, malicious: 0 },
  { id: "a2", when: "Today · 09:10", trigger: "upload", source: "~/.codex/skills", scanned: 3, safe: 3, suspicious: 0, malicious: 0 },
  { id: "a3", when: "Yesterday · 17:48", trigger: "mcp", source: "OpenClaw", scanned: 6, safe: 5, suspicious: 1, malicious: 0 },
  { id: "a4", when: "Yesterday · 11:31", trigger: "github", source: "bicone/growth-skills", scanned: 5, safe: 5, suspicious: 0, malicious: 0 },
  { id: "a5", when: "2 days ago · 16:04", trigger: "upload", source: "meeting-notes-sync.zip", scanned: 1, safe: 0, suspicious: 0, malicious: 1 },
  { id: "a6", when: "3 days ago · 10:18", trigger: "import", source: "Initial import", scanned: 12, safe: 9, suspicious: 1, malicious: 2 },
];

export function trigMeta(t: AuditRun["trigger"]): { icon: string; label: string } {
  if (t === "mcp") return { icon: "terminal", label: "MCP push" };
  if (t === "upload") return { icon: "import", label: "Upload" };
  if (t === "github") return { icon: "git", label: "GitHub" };
  return { icon: "scan", label: "Import" };
}

// --- pure aggregation (tested) -------------------------------------------
// Threats caught in a single run = its suspicious + malicious findings.
export function runThreats(r: AuditRun): number {
  return r.suspicious + r.malicious;
}

// Headline stat: total skills scanned across every run.
export function totalScanned(runs: AuditRun[]): number {
  return runs.reduce((a, r) => a + r.scanned, 0);
}

// Headline stat: total threats caught (suspicious + malicious) across all runs.
export function totalThreats(runs: AuditRun[]): number {
  return runs.reduce((a, r) => a + runThreats(r), 0);
}
