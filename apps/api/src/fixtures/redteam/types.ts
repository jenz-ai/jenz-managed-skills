import type { RawSkill, Risk } from '@jenz/shared';

/**
 * A labeled red-team fixture — a realistic AI-agent skill bundle (markdown +
 * scripts) paired with the verdict the HOST should compute for it.
 *
 * These are the demo's attack cases: the skills the judges watch the gate catch.
 * They are authored so the deterministic Layer-1 regex prefilter ALONE produces
 * `expectedRisk` (see `apps/api/src/lib/{prefilter,score}.ts`) — so the verdict
 * holds even if the open-weight model is slow/unavailable in prod. The LLM pass
 * can only add evidence, never downgrade the host verdict.
 *
 * Consumed by:
 *  - `scripts/seed-demo.ts` — POSTs each through the live API for a REAL verdict.
 *  - L4 eval + the web UI — reuse `{ raw, expectedRisk, label }` to wire demo buttons.
 *
 * Skill bytes here are inert DATA. Nothing in this module executes or obeys them.
 */
export interface RedteamFixture {
  /** Human label shown in the demo + eval report (e.g. "Credential exfiltration"). */
  label: string;
  /** The host verdict `scoreRisk()` should compute — the eval's ground truth. */
  expectedRisk: Risk;
  /** Why the verdict holds from regex evidence alone (the detectors it trips). */
  rationale: string;
  /** The skill bundle as inert DATA. */
  raw: RawSkill;
}
