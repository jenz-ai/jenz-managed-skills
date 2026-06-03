import { describe, it, expect } from 'vitest';
import type { Risk } from '@jenz/shared';
import { prefilter } from '../../lib/prefilter';
import { scoreRisk } from '../../lib/score';
import { redteamFixtures } from './index';

/**
 * Pins every red-team demo fixture to its expected HOST verdict, computed the
 * exact way the engine does in regex-only mode: `scoreRisk(prefilter(raw), true)`
 * (two healthy passes that add no contradicting evidence ⇒ `passesAgree=true`).
 *
 * This is the guarantee the fixtures are built on — "the deterministic Layer-1
 * regex prefilter ALONE yields expectedRisk" — so it holds even when the
 * open-weight model is slow/unavailable in prod. Hermetic: pure functions, no
 * network, no env, no DB. The LLM pass can only ADD findings, never downgrade,
 * so a green test here lower-bounds the live verdict at the right severity.
 */

/** The engine's regex-only verdict for a fixture (what `auditSkill` computes with no model key). */
function hostVerdict(raw: (typeof redteamFixtures)[number]['raw']): Risk {
  return scoreRisk(prefilter(raw), true);
}

describe('red-team demo fixtures', () => {
  it('exports exactly the 6 demo cases, benign control first', () => {
    expect(redteamFixtures).toHaveLength(6);
    expect(redteamFixtures[0].expectedRisk).toBe('safe');
    // Every theme the demo needs is covered.
    const risks = redteamFixtures.map((f) => f.expectedRisk).sort();
    expect(risks).toEqual(['malicious', 'malicious', 'malicious', 'safe', 'suspicious', 'suspicious']);
  });

  for (const fx of redteamFixtures) {
    describe(fx.label, () => {
      it(`is a well-formed RawSkill`, () => {
        expect(fx.raw.slug).toBeTruthy();
        expect(fx.raw.name).toBeTruthy();
        expect(fx.raw.files.length).toBeGreaterThan(0);
        for (const file of fx.raw.files) {
          expect(typeof file.path).toBe('string');
          expect(typeof file.content).toBe('string');
        }
      });

      it(`host scores it ${fx.expectedRisk} from regex evidence alone`, () => {
        expect(hostVerdict(fx.raw)).toBe(fx.expectedRisk);
      });
    });
  }

  // Targeted evidence assertions — guard against a fixture passing for the wrong reason
  // (e.g. a benign skill that accidentally trips a detector, or a malicious one whose
  // verdict comes from the wrong severity).
  const byLabel = (needle: string) =>
    redteamFixtures.find((f) => f.label.toLowerCase().includes(needle))!;

  it('benign control trips ZERO detectors (true negative, not a masked finding)', () => {
    const benign = redteamFixtures[0];
    expect(prefilter(benign.raw)).toHaveLength(0);
  });

  it('exfiltration is driven by a CRITICAL finding (not incidental highs)', () => {
    const findings = prefilter(byLabel('exfiltration').raw);
    expect(findings.some((f) => f.severity === 'critical')).toBe(true);
    expect(findings.some((f) => f.type === 'exfiltration')).toBe(true);
  });

  it('prompt injection is driven by ≥2 instruction-override HIGHs', () => {
    const findings = prefilter(byLabel('injection').raw);
    const overrides = findings.filter((f) => f.type === 'instruction-override' && f.severity === 'high');
    expect(overrides.length).toBeGreaterThanOrEqual(2);
  });

  it('borderline installer trips EXACTLY one high (so it floors at suspicious, not malicious)', () => {
    const findings = prefilter(byLabel('borderline').raw);
    expect(findings.filter((f) => f.severity === 'high')).toHaveLength(1);
    expect(findings.some((f) => f.severity === 'critical')).toBe(false);
  });

  it('tool-poisoning trips NO high/critical (a single medium ⇒ suspicious)', () => {
    const findings = prefilter(byLabel('tool poisoning').raw);
    expect(findings.some((f) => f.severity === 'high' || f.severity === 'critical')).toBe(false);
    expect(findings.some((f) => f.severity === 'medium')).toBe(true);
  });
});
