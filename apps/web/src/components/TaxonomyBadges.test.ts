import { describe, expect, it } from "vitest";
import { getTaxonomyChips } from "./TaxonomyBadges";
import type { Taxonomy } from "@jenz/shared";

const fullEntry: Taxonomy = {
  owaspLlm: ["LLM01", "LLM06"],
  owaspAgentic: ["AG02"],
  owaspSkills: [],
  mitreAtlas: ["AML.T0051"],
};

describe("getTaxonomyChips", () => {
  it("returns [] when taxonomy is undefined", () => {
    expect(getTaxonomyChips("Prompt injection", undefined)).toEqual([]);
  });

  it("returns [] when finding type is absent from taxonomy", () => {
    expect(getTaxonomyChips("Unknown type", { other: fullEntry })).toEqual([]);
  });

  it("returns chips for all non-empty arrays in order: LLM → Agentic → Skills → ATLAS", () => {
    const chips = getTaxonomyChips("Prompt injection", { "Prompt injection": fullEntry });
    expect(chips).toEqual([
      { label: "OWASP LLM", value: "LLM01" },
      { label: "OWASP LLM", value: "LLM06" },
      { label: "OWASP Agentic", value: "AG02" },
      { label: "MITRE ATLAS", value: "AML.T0051" },
    ]);
  });

  it("skips empty arrays (owaspSkills is empty in fullEntry)", () => {
    const chips = getTaxonomyChips("Prompt injection", { "Prompt injection": fullEntry });
    expect(chips.some((c) => c.label === "OWASP Skills")).toBe(false);
  });

  it("returns [] when all arrays are empty", () => {
    const empty: Taxonomy = {
      owaspLlm: [],
      owaspAgentic: [],
      owaspSkills: [],
      mitreAtlas: [],
    };
    expect(getTaxonomyChips("X", { X: empty })).toEqual([]);
  });

  it("handles multiple finding types in the map independently", () => {
    const map = {
      "Type A": { owaspLlm: ["LLM01"], owaspAgentic: [], owaspSkills: [], mitreAtlas: [] },
      "Type B": { owaspLlm: [], owaspAgentic: [], owaspSkills: ["SK01"], mitreAtlas: [] },
    };
    expect(getTaxonomyChips("Type A", map)).toEqual([{ label: "OWASP LLM", value: "LLM01" }]);
    expect(getTaxonomyChips("Type B", map)).toEqual([{ label: "OWASP Skills", value: "SK01" }]);
  });
});
