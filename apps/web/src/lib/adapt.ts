// Pure adapters: @jenz/shared types ↔ web-local Skill/Finding types.
// NO network, NO React — safe to import anywhere.
import type {
  AuditedSkill,
  Finding as SharedFinding,
  Risk as SharedRisk,
  Severity as SharedSeverity,
} from "@jenz/shared";
import type { Finding, MdLine, Risk, Severity, Skill } from "../state/types";
import type { ListItem } from "./api";

// ---- risk ------------------------------------------------------------------

/**
 * Maps the shared Risk to the web Risk.
 *
 * `pending` → `'suspicious'`: fail-closed display. An audit in progress has an
 * unknown final verdict, so we surface it as suspicious rather than safe to
 * avoid letting an unreviewed skill appear vetted.
 */
export function mapRisk(r: SharedRisk): Risk {
  if (r === "pending") return "suspicious";
  return r; // safe | suspicious | malicious are identical strings in both enums
}

// ---- severity --------------------------------------------------------------

/**
 * Maps shared Severity (4 tiers) to web Severity (3 tiers).
 *
 * `critical` → `'high'`: the web tier collapses critical and high into one
 * visual bucket — both render the same "high" badge.
 */
export function mapSeverity(sev: SharedSeverity): Severity {
  if (sev === "critical") return "high";
  return sev; // high | medium | low are identical
}

// ---- finding ---------------------------------------------------------------

/**
 * Maps a shared Finding to a web Finding.
 *
 * The `snippet` is a single MdLine containing the offending quote, tagged
 * `hot: true` and `kind: 'inj'` so the viewer highlights it inline. Full
 * context lines (surrounding code) are not available from the API response;
 * Lane 2/3 can enrich with `getSkillFiles` data if needed.
 */
export function mapFinding(f: SharedFinding): Finding {
  const line: MdLine = {
    n: f.line,
    text: f.quote,
    hot: true,
    kind: "inj",
  };
  return {
    type: f.type,
    sev: mapSeverity(f.severity),
    file: f.file,
    line: f.line,
    snippet: [line],
  };
}

// ---- auditedToSkill --------------------------------------------------------

/**
 * Converts a full AuditedSkill (from GET /skills/:id) to a web Skill.
 *
 * Defaults / drops (documented for Lane 2/3):
 * - `source`: always `'claude'` — the API does not return the originating
 *   agent tool. If the platform later exposes source, wire it here.
 * - `skillMd`: always `[]` — SKILL.md file content comes from the gate
 *   (`getSkillFiles`), not from the audit response. Lane 2/3 should call
 *   `getSkillFiles` and hydrate skillMd separately.
 * - `files`: always `1` — a placeholder count. Real file count comes from
 *   `getSkillFiles`; update the Skill after that call.
 * - `headline`: always `undefined` — not in AuditedSkill; the UI falls back
 *   to `findings[0].type` (see `topFinding` in Library.tsx).
 * - `category`: falls back to `''` (no folder) when absent. Quarantined skills
 *   carry no category (the host drops it — they live in Quarantine, not a
 *   folder); safe skills always get a real category from the categorizer.
 * - `desc`: falls back to `''` when absent.
 */
export function auditedToSkill(a: AuditedSkill & { id: string }): Skill {
  return {
    id: a.id,
    name: a.name,
    category: a.category ?? "", // absent ⟺ quarantined → no folder
    source: "claude",                    // API doesn't return source — default to claude
    risk: mapRisk(a.risk),
    desc: a.description ?? "",           // description is optional in AuditedSkill
    findings: a.findings.map(mapFinding),
    skillMd: [],                         // content comes from getSkillFiles, not here
    files: 1,                            // placeholder — hydrate after getSkillFiles
    headline: undefined,                 // not in AuditedSkill; UI falls back to findings[0].type
  };
}

// ---- listItemToSkill -------------------------------------------------------

/**
 * Converts a ListItem (from GET /skills) to a web Skill for list rendering.
 *
 * Defaults / drops (documented for Lane 2/3):
 * - `findings`: always `[]` — list summaries carry no finding detail, only
 *   `findingsCount`. The count is available on the ListItem if a screen needs
 *   it; it does not map to `Skill.findings`.
 * - `source`, `skillMd`, `files`, `headline`: same defaults as auditedToSkill.
 * - `category`: empty string when absent. Quarantined skills carry no category
 *   (they live in Quarantine, not a folder); safe skills always have one.
 */
export function listItemToSkill(li: ListItem): Skill {
  return {
    id: li.id,
    name: li.name,
    category: li.category ?? "", // absent ⟺ quarantined → no folder
    source: "claude",                     // API doesn't return source — default to claude
    risk: mapRisk(li.risk),
    desc: li.description,
    findings: [],                         // summaries carry no finding detail
    skillMd: [],                          // content comes from getSkillFiles, not here
    files: 1,                             // placeholder — hydrate after getSkillFiles
    headline: undefined,                  // not in list items
  };
}

// ---- groupByCategory -------------------------------------------------------

/**
 * Buckets an array of web Skills by category.
 * Skills whose category is already defaulted to 'Imported' (from the adapters
 * above) will land in the 'Imported' bucket.
 */
export function groupByCategory(skills: Skill[]): Record<string, Skill[]> {
  const out: Record<string, Skill[]> = {};
  for (const sk of skills) {
    const cat = sk.category || "Imported";
    if (!out[cat]) out[cat] = [];
    out[cat].push(sk);
  }
  return out;
}
