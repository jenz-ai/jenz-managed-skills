// Unit tests for the Onboarding wizard pure logic (SPEC §6).
import { describe, expect, it } from "vitest";
import {
  onboardingSteps,
  parseRepoLabel,
  scanSkillDirs,
  totalSkills,
  type StagedGroup,
} from "./onboardingLogic";

describe("onboardingSteps", () => {
  it("returns welcome, name, import, mcp, review in order", () => {
    expect(onboardingSteps()).toEqual(["welcome", "name", "import", "mcp", "review"]);
  });
});

describe("totalSkills", () => {
  const mk = (n: number): StagedGroup => ({
    id: "g" + n,
    kind: "upload",
    label: "x",
    sub: "x/",
    skills: Array.from({ length: n }, (_, i) => ({ id: "s" + i, name: "n" + i })),
  });
  it("is 0 with no groups", () => {
    expect(totalSkills([])).toBe(0);
  });
  it("sums skills across groups", () => {
    expect(totalSkills([mk(2), mk(3), mk(0)])).toBe(5);
  });
});

describe("parseRepoLabel", () => {
  it("parses a full https github url to org/repo", () => {
    expect(parseRepoLabel("https://github.com/org/skills")).toBe("org/skills");
  });
  it("strips a trailing .git suffix", () => {
    expect(parseRepoLabel("https://github.com/org/skills.git")).toBe("org/skills");
  });
  it("parses a bare github.com slug", () => {
    expect(parseRepoLabel("github.com/acme/agent-skills")).toBe("acme/agent-skills");
  });
  it("ignores extra path segments beyond org/repo", () => {
    expect(parseRepoLabel("github.com/org/skills/tree/main")).toBe("org/skills");
  });
  it("falls back to the host-stripped string when under two segments", () => {
    expect(parseRepoLabel("https://example.com/only")).toBe("example.com/only");
  });
});

describe("scanSkillDirs", () => {
  it("derives the parent dir of each SKILL.md, de-duped in first-seen order", () => {
    const paths = [
      "skills/alpha/SKILL.md",
      "skills/alpha/refs/notes.md",
      "skills/beta/SKILL.md",
      "skills/alpha/SKILL.md",
    ];
    expect(scanSkillDirs(paths, "skills")).toEqual(["alpha", "beta"]);
  });
  it("matches SKILL.md case-insensitively", () => {
    expect(scanSkillDirs(["pack/gamma/skill.md"], "pack")).toEqual(["gamma"]);
  });
  it("ignores files that are not SKILL.md", () => {
    expect(scanSkillDirs(["pack/x/README.md", "pack/x/run.sh"], "pack")).toEqual([]);
  });
  it("falls back to root when SKILL.md sits at the top level", () => {
    expect(scanSkillDirs(["SKILL.md"], "myroot")).toEqual(["myroot"]);
  });
});
