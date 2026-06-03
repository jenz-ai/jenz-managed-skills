import type { RawSkill, AuditedSkill, Finding, Severity } from '@jenz/shared';
import { prefilter } from './prefilter';
import { scoreRisk } from './score';
import { runAuditPass, type ModelFinding, type ModelAudit } from './openrouter';

/**
 * The audit engine — replaces the stub. Pure-ish orchestrator (no DB, no HTTP
 * framework): runs the L1 regex prefilter and, when a model is configured, two
 * tool-less semantic passes, then lets the HOST compute the verdict.
 *
 *   prefilter (regex) ─┐
 *   model pass A ──────┼─ merge + dedupe ─→ scoreRisk(findings, passesAgree) ─→ Risk
 *   model pass B ──────┘
 *
 * The model's `risk` is advisory only; `scoreRisk()` decides. Fail-closed:
 *  - No OPENROUTER_API_KEY → regex-only dev mode (documented degradation).
 *  - Key set but a pass throws → we cannot certify 'safe' → passes "disagree".
 */
export async function auditSkill(
  raw: RawSkill,
  onProgress?: (msg: string) => void,
): Promise<AuditedSkill> {
  onProgress?.('prefilter: scanning skill bytes');
  const regexFindings = prefilter(raw);

  let modelFindings: Finding[] = [];
  let passesAgree = true; // regex-only baseline: nothing to disagree with

  if (process.env.OPENROUTER_API_KEY) {
    onProgress?.('semantic audit: 2 tool-less passes');
    const temperature = Number(process.env.AUDIT_TEMPERATURE) || 0.4;
    const [passA, passB] = await Promise.all([
      tryPass(raw, temperature),
      tryPass(raw, temperature),
    ]);

    if (passA && passB) {
      passesAgree = passA.risk === passB.risk;
      modelFindings = [...passA.findings, ...passB.findings].map(toFinding);
    } else {
      // A pass failed → fail-closed: never let a model outage certify 'safe'.
      onProgress?.('semantic audit incomplete; fail-closed');
      passesAgree = false;
    }
  } else {
    onProgress?.('regex-only mode (no OPENROUTER_API_KEY configured)');
  }

  const findings = dedupe([...regexFindings, ...modelFindings]);
  const risk = scoreRisk(findings, passesAgree);
  onProgress?.(`verdict: ${risk} (${findings.length} finding(s))`);

  return {
    slug: raw.slug,
    name: raw.name,
    risk,
    findings,
    description: describe(risk, findings),
    category: categorize(risk, findings),
  };
}

/** Run one model pass, swallowing rejection to null so a single failure can
 *  never leak an unhandled rejection — the caller fails closed on a null. */
async function tryPass(raw: RawSkill, temperature: number): Promise<ModelAudit | null> {
  try {
    return await runAuditPass(raw, { temperature });
  } catch {
    return null;
  }
}

/** Model evidence → a host Finding (tagged as LLM-sourced). */
function toFinding(m: ModelFinding): Finding {
  return {
    type: m.type,
    severity: m.severity,
    file: m.file,
    line: m.line,
    quote: m.quote,
    detector: 'llm',
  };
}

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

/** Union findings, dedupe by (type, file, line, quote-prefix), keep highest severity. */
function dedupe(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.type}|${f.file}|${f.line}|${f.quote.slice(0, 40)}`;
    const existing = byKey.get(key);
    if (!existing || SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) {
      byKey.set(key, f);
    }
  }
  return [...byKey.values()];
}

function describe(risk: AuditedSkill['risk'], findings: Finding[]): string {
  if (risk === 'safe') return 'No security findings.';
  const types = [...new Set(findings.map((f) => f.type))].slice(0, 4).join(', ');
  return `${findings.length} finding(s): ${types}`;
}

function categorize(risk: AuditedSkill['risk'], findings: Finding[]): string {
  if (risk === 'safe') return 'safe';
  const worst = [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
  return worst?.type ?? 'flagged';
}
