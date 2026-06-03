// Unit tests for the AuditHome headline stats, derived from the live skill
// list (GET /skills) — replaces the old AUDIT_HISTORY-based aggregates.
import { describe, expect, it } from "vitest";
import { auditHomeStats } from "./auditStats";
import type { Skill } from "../state/types";

const mk = (id: string, risk: Skill["risk"]): Skill => ({
  id, name: id, category: "Imported", source: "claude", risk,
  desc: "", findings: [], skillMd: [], files: 1,
});

describe("auditHomeStats", () => {
  it("counts audited, safe, and threats from the live list", () => {
    const skills = [
      mk("a", "safe"), mk("b", "safe"),
      mk("c", "suspicious"),
      mk("d", "malicious"), mk("e", "malicious"),
    ];
    expect(auditHomeStats(skills)).toEqual({ audited: 5, safe: 2, threats: 3 });
  });

  it("treats every loaded skill as audited (total count)", () => {
    const skills = [mk("a", "safe"), mk("b", "malicious")];
    expect(auditHomeStats(skills).audited).toBe(2);
  });

  it("counts suspicious and malicious together as threats", () => {
    expect(auditHomeStats([mk("a", "suspicious"), mk("b", "malicious")]).threats).toBe(2);
  });

  it("returns all zeros for an empty workspace", () => {
    expect(auditHomeStats([])).toEqual({ audited: 0, safe: 0, threats: 0 });
  });

  it("does not count safe skills as threats, or threats as safe", () => {
    const stats = auditHomeStats([mk("a", "safe"), mk("b", "suspicious")]);
    expect(stats.safe).toBe(1);
    expect(stats.threats).toBe(1);
  });
});
