import type { RawSkill, AuditedSkill, Finding, Severity } from '@jenz/shared';
import { prefilter } from './prefilter';
import { scoreRisk } from './score';
import { runAuditPass, type ModelFinding, type ModelAudit } from './openrouter';

/** Injectable model-pass runner (default = runAuditPass) so tests can supply a
 *  plain throwing/stub function — no vi.fn, so vitest can't misreport a caught throw. */
export type ModelPassRunner = (
  raw: RawSkill,
  opts?: { temperature?: number; signal?: AbortSignal },
) => Promise<ModelAudit>;

/**
 * The audit engine — replaces the stub. Pure-ish orchestrator (no DB, no HTTP
 * framework): runs the L1 regex prefilter and, when a model is configured, two
 * tool-less semantic passes, then lets the HOST compute the verdict.
 *
 *   prefilter (regex) ─┐
 *   model pass A ──────┼─ merge + dedupe ─→ scoreRisk(findings, passesHealthy) ─→ Risk
 *   model pass B ──────┘
 *
 * "Model advises, host decides on EVIDENCE." The model's advisory `risk` label
 * never gates the verdict; only findings (+ pass health) do. Fail-closed:
 *  - No OPENROUTER_API_KEY → regex-only dev mode (documented degradation).
 *  - A pass throws/fails → cannot certify 'safe' → fail closed (never 'safe').
 *  - Two completed passes that find nothing → 'safe' even if their advisory
 *    labels differ (a label-only disagreement with zero evidence must not block).
 */
export async function auditSkill(
  raw: RawSkill,
  onProgress?: (msg: string) => void,
  runPass: ModelPassRunner = runAuditPass,
): Promise<AuditedSkill> {
  onProgress?.('prefilter: scanning skill bytes');
  const regexFindings = prefilter(raw);

  let modelFindings: Finding[] = [];
  // Confidence gate fed to scoreRisk: true → host may certify 'safe'; false →
  // never 'safe'. It reflects whether the semantic passes ran HEALTHILY — NOT
  // whether their advisory labels agree (see contract above).
  let passesHealthy = true; // regex-only baseline: no model to fail

  if (process.env.OPENROUTER_API_KEY) {
    onProgress?.('semantic audit: 2 tool-less passes');
    const temperature = Number(process.env.AUDIT_TEMPERATURE) || 0.4;
    const [passA, passB] = await Promise.all([
      tryPass(runPass, raw, temperature),
      tryPass(runPass, raw, temperature),
    ]);

    if (passA && passB) {
      // Both passes completed → trust the merged EVIDENCE, not advisory labels.
      modelFindings = [...passA.findings, ...passB.findings].map(toFinding);
    } else {
      // A pass failed → fail-closed: never let a model outage certify 'safe'.
      onProgress?.('semantic audit incomplete; fail-closed');
      passesHealthy = false;
    }
  } else {
    onProgress?.('regex-only mode (no OPENROUTER_API_KEY configured)');
  }

  const findings = dedupe([...regexFindings, ...modelFindings]);
  const risk = scoreRisk(findings, passesHealthy);
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

/** Run one model pass, swallowing failure to null so the caller can fail closed
 *  on a null without a single outage rejecting the whole audit. */
async function tryPass(
  run: ModelPassRunner,
  raw: RawSkill,
  temperature: number,
): Promise<ModelAudit | null> {
  try {
    return await run(raw, { temperature });
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
