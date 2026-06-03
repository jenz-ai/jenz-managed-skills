/**
 * Eval corpus — the aggregator.
 *
 * Pulls every labelled attack-family file plus the benign control set into one
 * flat `ALL_CASES` array (the runner's input) and a `CASES_BY_CATEGORY` view
 * (handy for slicing reports). Each `corpus/<category>.ts` file is owned by a
 * different eval agent but all build to the FROZEN `EvalCase[]` seam in
 * `../types`, so this file only ever imports their named arrays — never their
 * contents. The lone runtime invariant we enforce here is **unique ids**: a
 * duplicate id would silently double-count one case and skew the metrics, so we
 * fail-fast at module load.
 */

import type { EvalCase, EvalCategory } from '../types';

import { directInjectionCases } from './direct-injection';
import { indirectInjectionCases } from './indirect-injection';
import { toolPoisoningCases } from './tool-poisoning';
import { exfiltrationCases } from './exfiltration';
import { destructiveCases } from './destructive';
import { obfuscationCases } from './obfuscation';
import { benignCases } from './benign';

/** Every eval case, attacks + benign control, in one flat list. */
export const ALL_CASES: readonly EvalCase[] = Object.freeze([
  ...directInjectionCases,
  ...indirectInjectionCases,
  ...toolPoisoningCases,
  ...exfiltrationCases,
  ...destructiveCases,
  ...obfuscationCases,
  ...benignCases,
]);

/** The same cases bucketed by category — attack families + `benign`. */
export const CASES_BY_CATEGORY: Readonly<Record<EvalCategory, readonly EvalCase[]>> =
  Object.freeze({
    'direct-injection': directInjectionCases,
    'indirect-injection': indirectInjectionCases,
    'tool-poisoning': toolPoisoningCases,
    exfiltration: exfiltrationCases,
    destructive: destructiveCases,
    obfuscation: obfuscationCases,
    benign: benignCases,
  });

/** Fail-fast: ids must be globally unique or metrics double-count. Runs once at
 *  module load (cheap; the corpus is small). */
function assertUniqueIds(cases: readonly EvalCase[]): void {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const c of cases) {
    if (seen.has(c.id)) dups.push(c.id);
    seen.add(c.id);
  }
  if (dups.length > 0) {
    throw new Error(
      `eval corpus: duplicate case id(s): ${[...new Set(dups)].join(', ')}. ` +
        'Each EvalCase.id must be globally unique across corpus files.',
    );
  }
}

assertUniqueIds(ALL_CASES);
