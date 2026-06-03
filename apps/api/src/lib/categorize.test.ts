import { describe, it, expect } from 'vitest';
import { normalizeCategory, DEFAULT_CATEGORY } from './categorize';

describe('normalizeCategory', () => {
  it('falls back for non-strings and empty input', () => {
    expect(normalizeCategory(undefined)).toBe(DEFAULT_CATEGORY);
    expect(normalizeCategory(null)).toBe(DEFAULT_CATEGORY);
    expect(normalizeCategory(42)).toBe(DEFAULT_CATEGORY);
    expect(normalizeCategory('   ')).toBe(DEFAULT_CATEGORY);
  });

  it('rejects risk words masquerading as folders', () => {
    for (const w of ['safe', 'Safe', 'SUSPICIOUS', 'malicious', 'quarantine']) {
      expect(normalizeCategory(w)).toBe(DEFAULT_CATEGORY);
    }
  });

  it('trims surrounding quotes/whitespace and collapses spaces', () => {
    expect(normalizeCategory('  "Git"  ')).toBe('Git');
    expect(normalizeCategory('Code   Quality')).toBe('Code Quality');
  });

  it('caps over-long output', () => {
    const long = 'A'.repeat(50);
    expect(normalizeCategory(long).length).toBeLessThanOrEqual(24);
  });

  it('snaps case-insensitively to an existing folder (no near-duplicates)', () => {
    expect(normalizeCategory('git', ['Git', 'Docs'])).toBe('Git');
    expect(normalizeCategory('DOCS', ['Git', 'Docs'])).toBe('Docs');
  });

  it('passes through a new topical folder when none match', () => {
    expect(normalizeCategory('Deployment', ['Git', 'Docs'])).toBe('Deployment');
  });
});
