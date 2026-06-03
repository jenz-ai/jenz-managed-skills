import { describe, expect, it } from "vitest";
import {
  toApiSource,
  sourceLabel,
  initialRowState,
  applyRowEvent,
  rowStatuses,
  type ImportSource,
  type RowState,
} from "./auditStream";
import type { AuditedSkill } from "@jenz/shared";

// ---- toApiSource ------------------------------------------------------------

describe("toApiSource", () => {
  it("maps github kind → type:github, carrying url", () => {
    const src: ImportSource = { kind: "github", url: "https://github.com/org/skills", label: "org/skills" };
    expect(toApiSource(src)).toEqual({ type: "github", url: "https://github.com/org/skills" });
  });

  it("maps inline kind → type:inline, carrying name + files", () => {
    const src: ImportSource = {
      kind: "inline",
      name: "my-skill",
      files: [{ path: "SKILL.md", content: "# my-skill" }],
    };
    expect(toApiSource(src)).toEqual({
      type: "inline",
      name: "my-skill",
      files: [{ path: "SKILL.md", content: "# my-skill" }],
    });
  });

  it("strips label from github source (not in API shape)", () => {
    const src: ImportSource = { kind: "github", url: "https://github.com/a/b", label: "a/b" };
    const result = toApiSource(src);
    expect(result).not.toHaveProperty("label");
  });

  it("strips kind from inline source", () => {
    const src: ImportSource = { kind: "inline", name: "x", files: [] };
    const result = toApiSource(src);
    expect(result).not.toHaveProperty("kind");
  });
});

// ---- sourceLabel ------------------------------------------------------------

describe("sourceLabel", () => {
  it("returns label for github sources", () => {
    const src: ImportSource = { kind: "github", url: "u", label: "org/repo" };
    expect(sourceLabel(src)).toBe("org/repo");
  });

  it("returns name for inline sources", () => {
    const src: ImportSource = { kind: "inline", name: "my-skill", files: [] };
    expect(sourceLabel(src)).toBe("my-skill");
  });
});

// ---- initialRowState --------------------------------------------------------

describe("initialRowState", () => {
  it("starts queued with no verdict or error", () => {
    const s = initialRowState();
    expect(s.status).toBe("queued");
    expect(s.verdict).toBeNull();
    expect(s.error).toBeNull();
  });
});

// ---- applyRowEvent ----------------------------------------------------------

const makeVerdict = (risk: AuditedSkill["risk"]): AuditedSkill & { id: string } => ({
  id: "v1",
  slug: "my-skill",
  name: "my-skill",
  risk,
  findings: [],
});

describe("applyRowEvent", () => {
  it("scan-start → scanning", () => {
    const s = applyRowEvent(initialRowState(), { kind: "scan-start" });
    expect(s.status).toBe("scanning");
  });

  it("progress → scanning + updates scan label", () => {
    const s = applyRowEvent(initialRowState(), { kind: "progress", msg: "analysing content…" });
    expect(s.status).toBe("scanning");
    expect(s.scanLabel).toBe("analysing content…");
  });

  it("progress with no msg falls back to default label", () => {
    const s = applyRowEvent(initialRowState(), { kind: "progress" });
    expect(s.scanLabel).toBe("scanning…");
  });

  it("verdict:safe → safe + stores verdict", () => {
    const v = makeVerdict("safe");
    const s = applyRowEvent(initialRowState(), { kind: "verdict", verdict: v });
    expect(s.status).toBe("safe");
    expect(s.verdict).toBe(v);
    expect(s.error).toBeNull();
  });

  it("verdict:suspicious → suspicious", () => {
    const v = makeVerdict("suspicious");
    const s = applyRowEvent(initialRowState(), { kind: "verdict", verdict: v });
    expect(s.status).toBe("suspicious");
  });

  it("verdict:malicious → malicious", () => {
    const v = makeVerdict("malicious");
    const s = applyRowEvent(initialRowState(), { kind: "verdict", verdict: v });
    expect(s.status).toBe("malicious");
  });

  it("verdict:pending → suspicious (fail-closed for in-progress)", () => {
    const v = makeVerdict("pending");
    const s = applyRowEvent(initialRowState(), { kind: "verdict", verdict: v });
    expect(s.status).toBe("suspicious");
  });

  it("error → malicious (fail-closed), stores error msg", () => {
    const s = applyRowEvent(initialRowState(), { kind: "error", error: "timeout" });
    expect(s.status).toBe("malicious");
    expect(s.error).toBe("timeout");
    expect(s.verdict).toBeNull();
  });

  it("error with no msg → malicious with 'unknown error'", () => {
    const s = applyRowEvent(initialRowState(), { kind: "error" });
    expect(s.status).toBe("malicious");
    expect(s.error).toBe("unknown error");
  });

  it("does not mutate the input state", () => {
    const orig = initialRowState();
    const copy: RowState = { ...orig };
    applyRowEvent(orig, { kind: "scan-start" });
    expect(orig).toEqual(copy);
  });

  it("can be chained: queued → scanning → safe", () => {
    const v = makeVerdict("safe");
    let s = applyRowEvent(initialRowState(), { kind: "scan-start" });
    s = applyRowEvent(s, { kind: "progress", msg: "extracting…" });
    s = applyRowEvent(s, { kind: "verdict", verdict: v });
    expect(s.status).toBe("safe");
    expect(s.verdict).toBe(v);
  });
});

// ---- rowStatuses ------------------------------------------------------------

describe("rowStatuses", () => {
  it("extracts the status field from each RowState", () => {
    const rows = [
      initialRowState(),
      applyRowEvent(initialRowState(), { kind: "scan-start" }),
      applyRowEvent(initialRowState(), { kind: "verdict", verdict: makeVerdict("safe") }),
    ];
    expect(rowStatuses(rows)).toEqual(["queued", "scanning", "safe"]);
  });
});
