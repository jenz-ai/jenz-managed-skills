import { describe, it, expect } from 'vitest';
import { Risk, Severity, Detector, SkillSource } from '@prisma/client';

// Frozen Contract 1 (packages/shared/types.ts). Prisma enums MUST match these unions
// 1:1 — same members, no more, no less. This test is the guard against drift.
const EXPECTED = {
  Risk: ['pending', 'safe', 'suspicious', 'malicious'],
  Severity: ['critical', 'high', 'medium', 'low'],
  Detector: ['regex', 'llm'],
  SkillSource: ['github', 'upload', 'mcp', 'inline'],
} as const;

describe('Prisma enums mirror @jenz/shared unions 1:1', () => {
  it('Risk', () => {
    expect(Object.values(Risk).sort()).toEqual([...EXPECTED.Risk].sort());
  });
  it('Severity', () => {
    expect(Object.values(Severity).sort()).toEqual([...EXPECTED.Severity].sort());
  });
  it('Detector', () => {
    expect(Object.values(Detector).sort()).toEqual([...EXPECTED.Detector].sort());
  });
  it('SkillSource', () => {
    expect(Object.values(SkillSource).sort()).toEqual([...EXPECTED.SkillSource].sort());
  });
});
