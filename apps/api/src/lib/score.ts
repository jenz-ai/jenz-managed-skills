import type { Finding, Risk } from '@jenz/shared';

/** The gate. Model output is advisory; THIS computes the trusted verdict.
 *  @param passesAgree true iff both LLM passes returned the same risk label.
 *  Policy (fail-closed): malicious ← any critical OR >=2 high;
 *  suspicious ← passes disagree OR any high OR any medium; safe ← none + agree. */
export function scoreRisk(findings: Finding[], passesAgree: boolean): Risk {
  if (findings.some(f => f.severity === 'critical')) return 'malicious';
  const highCount = findings.filter(f => f.severity === 'high').length;
  if (highCount >= 2) return 'malicious';
  if (!passesAgree) return 'suspicious';
  if (highCount >= 1) return 'suspicious';
  if (findings.some(f => f.severity === 'medium')) return 'suspicious';
  return 'safe';
}
