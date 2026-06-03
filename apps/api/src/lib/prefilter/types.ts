/**
 * Shared rule contract for the Layer-1 prefilter's pluggable detector modules.
 *
 * Each detector module (`override.ts`, `obfusc.ts`, `exfil.ts`) exports a
 * `RegexRule[]`. The prefilter composition root (`../prefilter.ts`) runs every
 * rule against every line of every file and emits a `Finding` (detector:'regex')
 * for each hit. Rules are INDEPENDENT and additive — a rule fires purely on its
 * own match, so adding a rule can never make a previously-clean line flag unless
 * that rule itself matches it. This is what keeps the false-positive boundary
 * composable across modules built in parallel.
 *
 * Severity discipline (the host's LOCKED `scoreRisk()` turns ANY `medium` into
 * `suspicious` and ANY `critical` into `malicious`): pick severities that hold
 * the benign fixtures clean. Reserve `critical` for unambiguous compromise.
 */

import type { Severity } from '@jenz/shared';

/** A per-line match: a RegExp (the common case) or a predicate for logic a
 *  single expression can't express (e.g. homoglyph / mixed-script scans). */
export type LineMatcher = RegExp | ((line: string) => boolean);

/** One deterministic detector rule. `type` MUST be an existing finding type in
 *  `@jenz/shared`'s taxonomy — never invent a new shape (ask L1 in comms first). */
export interface RegexRule {
  type: string;
  severity: Severity;
  match: LineMatcher;
}

/** Evaluate a rule against a single line. Resets a global RegExp's lastIndex so
 *  stateful `g`-flag regexes can't desync across lines (prefer non-global). */
export function ruleHits(rule: RegexRule, line: string): boolean {
  const m = rule.match;
  if (typeof m === 'function') return m(line);
  if (m.global) m.lastIndex = 0;
  return m.test(line);
}
