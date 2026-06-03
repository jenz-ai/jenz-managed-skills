import { describe, it, expect } from 'vitest';
import type { Finding, Severity } from '@jenz/shared';
import { scoreRisk } from './score';

/** Minimal Finding factory — only severity matters to the gate. */
function f(severity: Severity): Finding {
  return {
    type: 'test',
    severity,
    file: 'skill.md',
    line: 1,
    quote: 'offending line',
    detector: 'regex',
  };
}

describe('scoreRisk (host-side gate)', () => {
  it('any critical finding → malicious, even when passes agree', () => {
    expect(scoreRisk([f('critical')], true)).toBe('malicious');
  });

  it('two high findings + agree → malicious', () => {
    expect(scoreRisk([f('high'), f('high')], true)).toBe('malicious');
  });

  it('one high finding + agree → suspicious', () => {
    expect(scoreRisk([f('high')], true)).toBe('suspicious');
  });

  it('one medium finding + agree → suspicious', () => {
    expect(scoreRisk([f('medium')], true)).toBe('suspicious');
  });

  it('passes disagree with only a low finding → suspicious', () => {
    expect(scoreRisk([f('low')], false)).toBe('suspicious');
  });

  it('passes disagree with zero findings → suspicious', () => {
    expect(scoreRisk([], false)).toBe('suspicious');
  });

  it('one low finding + agree → safe', () => {
    expect(scoreRisk([f('low')], true)).toBe('safe');
  });

  it('zero findings + agree → safe', () => {
    expect(scoreRisk([], true)).toBe('safe');
  });
});
