// Unit tests for the Library/Quarantine pure list logic (SPEC §5.3).
import { describe, expect, it } from "vitest";
import { filterSkills, topFinding } from "./Library";
import { SKILLS } from "../data/skills.fixtures";
import type { Skill } from "../state/types";

const byId = (id: string) => SKILLS.find((s) => s.id === id)!;

describe("filterSkills", () => {
  it("library mode shows only safe skills (none of the flagged ones)", () => {
    const list = filterSkills(SKILLS, "library", null);
    expect(list.length).toBe(10);
    expect(list.every((s) => s.risk === "safe")).toBe(true);
    expect(list.some((s) => s.id === "pdf-extract")).toBe(false);
    expect(list.some((s) => s.id === "meeting-notes-sync")).toBe(false);
  });

  it("library mode scopes to the active category", () => {
    const list = filterSkills(SKILLS, "library", "Research");
    expect(list.map((s) => s.id)).toEqual(["competitor-diff", "trend-scan", "changelog-watcher"]);
    expect(list.every((s) => s.category === "Research" && s.risk === "safe")).toBe(true);
  });

  it("library mode returns empty for a category with no safe skills", () => {
    expect(filterSkills(SKILLS, "library", "Nonexistent")).toEqual([]);
  });

  it("quarantine mode shows only non-safe skills", () => {
    const list = filterSkills(SKILLS, "quarantine", null);
    expect(list.map((s) => s.id).sort()).toEqual(["meeting-notes-sync", "pdf-extract"]);
    expect(list.every((s) => s.risk !== "safe")).toBe(true);
  });

  it("quarantine mode ignores the active category", () => {
    const list = filterSkills(SKILLS, "quarantine", "Research");
    expect(list.map((s) => s.id).sort()).toEqual(["meeting-notes-sync", "pdf-extract"]);
  });
});

describe("topFinding", () => {
  it("prefers an explicit headline (malicious skill)", () => {
    expect(topFinding(byId("meeting-notes-sync"))).toBe("credential exfiltration — line 14");
  });

  it("falls back to the first finding's type when there is no headline", () => {
    const pdf = byId("pdf-extract");
    expect(pdf.headline).toBeUndefined();
    expect(topFinding(pdf)).toBe(pdf.findings[0].type);
  });

  it("is undefined for a clean skill with no findings", () => {
    expect(topFinding(byId("pr-review"))).toBeUndefined();
  });

  it("uses headline even when findings are also present", () => {
    const sk: Skill = { ...byId("pdf-extract"), headline: "manual headline" };
    expect(topFinding(sk)).toBe("manual headline");
  });
});
