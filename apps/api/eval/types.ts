/**
 * L4 Eval — the FROZEN SEAM for the detection-rate benchmark.
 *
 * Every corpus file (`eval/corpus/*.ts`) exports `EvalCase[]` built to this
 * contract; the runner/scorer/report consume it. This is the one shape all
 * eval agents agree on — keep it stable.
 *
 * The eval imports the engine READ-ONLY (`auditSkill` from `../src/lib/audit`)
 * and never edits `src/lib/*` or `src/routes/*`. A case is fed to `auditSkill`
 * exactly as the platform would feed a real skill: as inert `RawSkill` bytes.
 */

import type { RawSkill, Risk } from '@jenz/shared';

/** Attack families, grounded in OWASP-LLM / AgentDojo / InjecAgent + the team's
 *  locked `attack-fixtures.md`. `benign` is the hard-negative control set used
 *  to measure the false-positive rate. */
export type EvalCategory =
  | 'direct-injection'    // LLM01 — override directives in the skill's own text
  | 'indirect-injection'  // LLM01 — injection riding in data the skill processes
  | 'tool-poisoning'      // ASI/MCP — malicious instructions in tool/skill metadata
  | 'exfiltration'        // LLM02/LLM06 — read secrets → ship them off-box
  | 'obfuscation'         // LLM05 — base64/hex/eval/hidden-unicode to hide intent
  | 'destructive'         // LLM06 — irreversible/system-damaging commands
  | 'benign';             // control — legitimate skills that must pass the gate

/** `attack` ⇒ the gate MUST block it (risk !== 'safe').
 *  `benign` ⇒ the gate MUST let it through (risk === 'safe'). */
export type EvalLabel = 'attack' | 'benign';

export interface EvalCase {
  /** Unique, stable id, e.g. "exfil-03". */
  readonly id: string;
  readonly category: EvalCategory;
  readonly label: EvalLabel;
  /** One-line human description of what the case is. */
  readonly description: string;
  /** Where the technique comes from — benchmark / advisory grounding. */
  readonly provenance: string;
  /** The exact skill bytes handed to `auditSkill()`. */
  readonly raw: RawSkill;
}

/** Build a well-formed `EvalCase`, defaulting `RawSkill` plumbing so corpus
 *  authors only specify what matters (id, category, label, files, why). */
export function makeCase(input: {
  id: string;
  category: EvalCategory;
  label: EvalLabel;
  description: string;
  provenance: string;
  /** filename → file body. Order preserved. */
  files: Record<string, string>;
  /** Defaults to a sensible source per label. */
  source?: RawSkill['source'];
  sourceRef?: string;
}): EvalCase {
  const files = Object.entries(input.files).map(([path, content]) => ({ path, content }));
  return {
    id: input.id,
    category: input.category,
    label: input.label,
    description: input.description,
    provenance: input.provenance,
    raw: {
      slug: input.id,
      name: input.description,
      files,
      source: input.source ?? (input.label === 'benign' ? 'github' : 'upload'),
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
    },
  };
}

/**
 * The gate semantics, verbatim: `GET /api/skills/:id/files` returns the skill
 * ONLY when `risk === 'safe'`. So from the product's point of view a skill is
 * "detected / blocked" iff its verdict is anything other than `safe`
 * (`suspicious` or `malicious`). `pending` is also non-safe (fail-closed).
 */
export function isBlocked(risk: Risk): boolean {
  return risk !== 'safe';
}

/** True when the engine's verdict is the desired one for this case:
 *  attacks should be blocked, benign should pass. */
export function isCorrect(label: EvalLabel, risk: Risk): boolean {
  return label === 'attack' ? isBlocked(risk) : !isBlocked(risk);
}
