// Pure helper + presentational component for OWASP/MITRE taxonomy chips.
// Rendered per-finding in SkillDetail when taxonomy data is available.
import type { Taxonomy } from "@jenz/shared";

export interface TaxonomyChip {
  label: string; // e.g. "OWASP LLM", "MITRE ATLAS"
  value: string; // e.g. "LLM01", "AML.T0051"
}

/**
 * Returns a flat array of chips for a given finding type from the taxonomy map.
 * Only includes entries whose arrays are non-empty.
 * Returns [] if taxonomy is absent or the finding type has no entry.
 */
export function getTaxonomyChips(
  findingType: string,
  taxonomy: Record<string, Taxonomy> | undefined,
): TaxonomyChip[] {
  if (!taxonomy) return [];
  const entry = taxonomy[findingType];
  if (!entry) return [];

  const chips: TaxonomyChip[] = [];
  for (const v of entry.owaspLlm) {
    chips.push({ label: "OWASP LLM", value: v });
  }
  for (const v of entry.owaspAgentic) {
    chips.push({ label: "OWASP Agentic", value: v });
  }
  for (const v of entry.owaspSkills) {
    chips.push({ label: "OWASP Skills", value: v });
  }
  for (const v of entry.mitreAtlas) {
    chips.push({ label: "MITRE ATLAS", value: v });
  }
  return chips;
}

/** Renders taxonomy chips for a single finding type. Renders nothing if no chips. */
export function TaxonomyBadges({
  findingType,
  taxonomy,
}: {
  findingType: string;
  taxonomy: Record<string, Taxonomy> | undefined;
}) {
  const chips = getTaxonomyChips(findingType, taxonomy);
  if (chips.length === 0) return null;
  return (
    <div className="jsd-taxonomy">
      {chips.map((c, i) => (
        <span key={i} className="jsd-tax-chip">
          <span className="jtc-label">{c.label}</span>
          <span className="jtc-value">{c.value}</span>
        </span>
      ))}
    </div>
  );
}
