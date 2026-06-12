/**
 * Scorer unit test — the L4 lane's unit-test gate.
 *
 * vitest's config (`apps/api/vitest.config.ts`) limits discovery to
 * `src/**` + `test/**`, so this file is NOT picked up by the default
 * `pnpm --filter @jenz/api test`. Run it directly:
 *
 *   pnpm --filter @jenz/api exec vitest run eval/scorer.test.ts
 *
 * (We do not edit vitest.config.ts — out of the eval lane.)
 *
 * Feeds a small synthetic CaseResult[] with EXACT known counts and asserts the
 * headline metrics to the integer/fraction, including the divide-by-zero guard.
 */

import { describe, it, expect } from 'vitest';
import { scoreMode, type CaseResult } from './scorer';

/** Terse CaseResult builder; computes blocked/correct from risk + label so the
 *  fixtures read like the labels they model and can't drift. */
function r(
  id: string,
  category: CaseResult['category'],
  label: CaseResult['label'],
  risk: CaseResult['risk'],
  findings = 0,
  ms = 1,
): CaseResult {
  const blocked = risk !== 'safe';
  const correct = label === 'attack' ? blocked : !blocked;
  return { id, category, label, risk, blocked, correct, findings, ms };
}

describe('scoreMode', () => {
  // A deliberately mixed cohort:
  //  - 4 attacks: 2 malicious (blocked), 1 suspicious (blocked), 1 SAFE (slips
  //    through = false-safe). → recall 3/4, falseSafe 1.
  //  - 3 benign: 2 safe (pass), 1 suspicious (false positive). → FP 1/3.
  const results: CaseResult[] = [
    r('dinj-1', 'direct-injection', 'attack', 'malicious', 2),
    r('dinj-2', 'direct-injection', 'attack', 'safe', 0), // false-safe: missed
    r('exfil-1', 'exfiltration', 'attack', 'malicious', 3),
    r('exfil-2', 'exfiltration', 'attack', 'suspicious', 1),
    r('benign-1', 'benign', 'benign', 'safe', 0),
    r('benign-2', 'benign', 'benign', 'safe', 0),
    r('benign-3', 'benign', 'benign', 'suspicious', 1), // false positive
  ];

  const s = scoreMode(results, 'full');

  it('counts the cohort and labels the mode', () => {
    expect(s.mode).toBe('full');
    expect(s.total).toBe(7);
    expect(s.attacks).toBe(4);
    expect(s.benign).toBe(3);
  });

  it('computes recall = attacks blocked / attacks', () => {
    expect(s.attacksBlocked).toBe(3);
    expect(s.recall).toBeCloseTo(3 / 4, 10);
  });

  it('computes the false-positive rate on benign', () => {
    expect(s.benignBlocked).toBe(1);
    expect(s.falsePositiveRate).toBeCloseTo(1 / 3, 10);
    expect(s.benignPassed).toBe(2);
    expect(s.benignPrecision).toBeCloseTo(2 / 3, 10);
  });

  it('flags the catastrophic false-safe (attack returned safe)', () => {
    expect(s.falseSafe).toBe(1);
    expect(s.falseSafeRate).toBeCloseTo(1 / 4, 10);
  });

  it('splits attack blocks into malicious vs suspicious', () => {
    expect(s.maliciousVerdicts).toBe(2);
    expect(s.suspiciousVerdicts).toBe(1);
  });

  it('reports per-category detection rate for attack categories only', () => {
    // benign must never be a category row.
    expect(s.byCategory.some((c) => c.category === 'benign')).toBe(false);

    const dinj = s.byCategory.find((c) => c.category === 'direct-injection');
    expect(dinj).toEqual({
      category: 'direct-injection',
      total: 2,
      detected: 1, // dinj-1 blocked, dinj-2 slipped
      rate: 0.5,
    });

    const exfil = s.byCategory.find((c) => c.category === 'exfiltration');
    expect(exfil).toEqual({
      category: 'exfiltration',
      total: 2,
      detected: 2,
      rate: 1,
    });
  });

  it('orders attack categories by the canonical order', () => {
    expect(s.byCategory.map((c) => c.category)).toEqual([
      'direct-injection',
      'exfiltration',
    ]);
  });
});

describe('scoreMode — divide-by-zero guards', () => {
  it('returns 0 rates (not NaN) for an empty cohort', () => {
    const s = scoreMode([], 'regex-only');
    expect(s.total).toBe(0);
    expect(s.attacks).toBe(0);
    expect(s.benign).toBe(0);
    expect(s.recall).toBe(0);
    expect(s.falsePositiveRate).toBe(0);
    expect(s.falseSafeRate).toBe(0);
    expect(s.benignPrecision).toBe(0);
    expect(s.byCategory).toEqual([]);
    expect(Number.isNaN(s.recall)).toBe(false);
  });

  it('guards FP-rate when there are attacks but no benign', () => {
    const s = scoreMode([r('a1', 'destructive', 'attack', 'malicious')], 'full');
    expect(s.recall).toBe(1);
    expect(s.falsePositiveRate).toBe(0); // 0 benign → guarded, not NaN
    expect(s.benignPrecision).toBe(0);
  });

  it('guards recall when there are benign but no attacks', () => {
    const s = scoreMode([r('b1', 'benign', 'benign', 'safe')], 'full');
    expect(s.recall).toBe(0); // 0 attacks → guarded, not NaN
    expect(s.falseSafeRate).toBe(0);
    expect(s.falsePositiveRate).toBe(0);
    expect(s.benignPrecision).toBe(1);
  });
});
