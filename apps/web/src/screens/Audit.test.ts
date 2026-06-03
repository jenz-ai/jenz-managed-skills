import { describe, expect, it } from "vitest";
import {
  dwellForRisk,
  isResolved,
  resolvedCount,
  deriveCounts,
  derivePct,
  threatCount,
  findingFor,
  type RowStatus,
} from "./Audit";
import { SKILLS, AUDIT_ORDER } from "../data/skills";
import type { Skill } from "../state/types";

// These pin the streaming state machine's pure logic — the derivations the
// audit moment renders (counts, pct, threats) and the row-level helpers
// (dwell timing, resolved test, finding fallback). The wall-clock timers
// themselves aren't tested; only the functions that feed them.

describe("dwellForRisk", () => {
  it("gives safe rows the short 640ms dwell", () => {
    expect(dwellForRisk("safe")).toBe(640);
  });

  it("gives threats the longer 1250ms dwell (so the flash lands)", () => {
    expect(dwellForRisk("suspicious")).toBe(1250);
    expect(dwellForRisk("malicious")).toBe(1250);
  });
});

describe("isResolved / resolvedCount", () => {
  it("treats only settled verdicts as resolved", () => {
    expect(isResolved("safe")).toBe(true);
    expect(isResolved("suspicious")).toBe(true);
    expect(isResolved("malicious")).toBe(true);
    expect(isResolved("queued")).toBe(false);
    expect(isResolved("scanning")).toBe(false);
  });

  it("counts resolved rows in a mixed list", () => {
    const statuses: RowStatus[] = ["safe", "scanning", "queued", "malicious", "suspicious"];
    expect(resolvedCount(statuses)).toBe(3);
  });
});

describe("deriveCounts", () => {
  it("tallies safe / suspicious / malicious independently", () => {
    const statuses: RowStatus[] = ["safe", "safe", "suspicious", "malicious", "queued", "scanning"];
    expect(deriveCounts(statuses)).toEqual({ safe: 2, suspicious: 1, malicious: 1 });
  });

  it("for the final audit state matches the fixture: 10 safe, 1+1 threats", () => {
    const finalStatuses = AUDIT_ORDER.map(
      (id) => SKILLS.find((s) => s.id === id)!.risk,
    ) as RowStatus[];
    const counts = deriveCounts(finalStatuses);
    expect(counts).toEqual({ safe: 10, suspicious: 1, malicious: 1 });
  });
});

describe("derivePct", () => {
  it("rounds resolved/total to a whole percent", () => {
    expect(derivePct(0, 12)).toBe(0);
    expect(derivePct(6, 12)).toBe(50);
    expect(derivePct(12, 12)).toBe(100);
    expect(derivePct(1, 12)).toBe(8); // 8.33 -> 8
    expect(derivePct(5, 12)).toBe(42); // 41.66 -> 42
  });

  it("is safe against an empty batch", () => {
    expect(derivePct(0, 0)).toBe(0);
  });
});

describe("threatCount", () => {
  it("sums suspicious + malicious (always 2 in the demo)", () => {
    expect(threatCount({ suspicious: 1, malicious: 1 })).toBe(2);
    expect(threatCount({ suspicious: 0, malicious: 0 })).toBe(0);
  });
});

describe("findingFor", () => {
  it("prefers the curated headline when present (malicious row)", () => {
    const malicious = SKILLS.find((s) => s.risk === "malicious")!;
    expect(malicious.headline).toBeTruthy();
    expect(findingFor(malicious)).toBe(malicious.headline);
  });

  it("falls back to the first finding's type when no headline (suspicious row)", () => {
    const suspicious = SKILLS.find((s) => s.risk === "suspicious")!;
    expect(suspicious.headline).toBeUndefined();
    expect(findingFor(suspicious)).toBe(suspicious.findings[0].type);
  });

  it("is undefined for a clean safe skill (no headline, no findings)", () => {
    const safe = SKILLS.find((s) => s.risk === "safe")!;
    expect(findingFor(safe)).toBeUndefined();
  });

  it("handles a synthetic skill with neither headline nor findings", () => {
    const bare = { headline: undefined, findings: [] } as unknown as Skill;
    expect(findingFor(bare)).toBeUndefined();
  });
});
