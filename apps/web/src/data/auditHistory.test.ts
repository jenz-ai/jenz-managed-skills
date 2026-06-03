import { describe, expect, it } from "vitest";
import {
  AUDIT_HISTORY,
  runThreats,
  totalScanned,
  totalThreats,
  trigMeta,
} from "./auditHistory";

// The Audit Home headline tiles are computed from AUDIT_HISTORY at runtime
// (no separate stats object — SPEC §7). These pin the aggregation the
// screen renders: skills audited = Σ scanned, threats caught = Σ(susp+mal).
describe("AUDIT_HISTORY aggregation", () => {
  it("has 6 runs", () => {
    expect(AUDIT_HISTORY).toHaveLength(6);
  });

  it("totals 31 skills scanned across all runs", () => {
    // 4 + 3 + 6 + 5 + 1 + 12
    expect(totalScanned(AUDIT_HISTORY)).toBe(31);
  });

  it("totals 5 threats caught across all runs", () => {
    // a3:1 + a5:1 + a6:(1+2) = 5
    expect(totalThreats(AUDIT_HISTORY)).toBe(5);
  });

  it("computes per-run threats as suspicious + malicious", () => {
    expect(AUDIT_HISTORY.map(runThreats)).toEqual([0, 0, 1, 0, 1, 3]);
  });

  it("exposes the latest run first (last-run tile reads [0])", () => {
    expect(AUDIT_HISTORY[0].when).toBe("Today · 14:22");
  });
});

describe("trigMeta", () => {
  it("maps each trigger to its icon + label", () => {
    expect(trigMeta("mcp")).toEqual({ icon: "terminal", label: "MCP push" });
    expect(trigMeta("upload")).toEqual({ icon: "import", label: "Upload" });
    expect(trigMeta("github")).toEqual({ icon: "git", label: "GitHub" });
    expect(trigMeta("import")).toEqual({ icon: "scan", label: "Import" });
  });
});
