// Unit tests for the Onboarding wizard pure logic (SPEC §6).
import { describe, expect, it } from "vitest";
import {
  onboardingSteps,
  parseRepoLabel,
  scanSkillDirs,
  totalSkills,
  buildInlineSources,
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
  it("treats a branch-only tree URL as the repo root (no subdir leaf)", () => {
    expect(parseRepoLabel("github.com/org/skills/tree/main")).toBe("org/skills");
  });
  it("falls back to the host-stripped string when under two segments", () => {
    expect(parseRepoLabel("https://example.com/only")).toBe("example.com/only");
  });

  // Subdir-aware labels: the demo imports two SUBDIRS of the same repo, which
  // must NOT collapse to one label (the dedup keys off the label).
  it("appends the subdir leaf for a tree subdir URL", () => {
    expect(parseRepoLabel("https://github.com/jenz-ai/agent-skills/tree/main/skills/changelog-genie"))
      .toBe("jenz-ai/agent-skills/changelog-genie");
  });
  it("appends the subdir leaf for a blob subdir URL", () => {
    expect(parseRepoLabel("github.com/jenz-ai/agent-skills/blob/main/skills/deploy-preview"))
      .toBe("jenz-ai/agent-skills/deploy-preview");
  });
  it("gives two subdirs of the same repo DISTINCT labels (no false dedup)", () => {
    const a = parseRepoLabel("github.com/jenz-ai/agent-skills/tree/main/skills/changelog-genie");
    const b = parseRepoLabel("github.com/jenz-ai/agent-skills/tree/main/skills/deploy-preview");
    expect(a).not.toBe(b);
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

// ---- buildInlineSources -----------------------------------------------------

describe("buildInlineSources", () => {
  const entry = (path: string, content = "# content") => ({ path, content });

  it("returns empty array when no SKILL.md is present", () => {
    const entries = [entry("skills/alpha/README.md"), entry("skills/alpha/run.sh")];
    expect(buildInlineSources(entries)).toEqual([]);
  });

  it("produces one ImportSource per skill dir", () => {
    const entries = [
      entry("skills/alpha/SKILL.md"),
      entry("skills/alpha/run.sh"),
      entry("skills/beta/SKILL.md"),
      entry("skills/beta/docs/notes.md"),
    ];
    const sources = buildInlineSources(entries);
    expect(sources).toHaveLength(2);
    const names = sources.map((s) => s.name).sort();
    expect(names).toEqual(["alpha", "beta"]);
  });

  it("each source kind is 'inline'", () => {
    const entries = [entry("skills/alpha/SKILL.md"), entry("skills/alpha/run.sh")];
    const sources = buildInlineSources(entries);
    expect(sources.every((s) => s.kind === "inline")).toBe(true);
  });

  it("assigns skill name from the dir containing SKILL.md", () => {
    const entries = [
      entry("root/my-skill/SKILL.md"),
      entry("root/my-skill/script.sh"),
    ];
    const sources = buildInlineSources(entries);
    expect(sources[0].name).toBe("my-skill");
  });

  it("includes only files under the skill dir", () => {
    const entries = [
      entry("skills/alpha/SKILL.md", "# alpha"),
      entry("skills/alpha/run.sh", "#!/bin/sh"),
      entry("skills/beta/SKILL.md", "# beta"),
      entry("skills/beta/prompt.md", "## prompt"),
      entry("unrelated/thing.md", "x"),
    ];
    const sources = buildInlineSources(entries);
    const alpha = sources.find((s) => s.name === "alpha")!;
    const beta = sources.find((s) => s.name === "beta")!;
    expect(alpha.files.map((f) => f.path).sort()).toEqual([
      "skills/alpha/SKILL.md",
      "skills/alpha/run.sh",
    ].sort());
    expect(beta.files.map((f) => f.path).sort()).toEqual([
      "skills/beta/SKILL.md",
      "skills/beta/prompt.md",
    ].sort());
  });

  it("file contents are preserved", () => {
    const entries = [
      entry("skills/alpha/SKILL.md", "# my skill description"),
      entry("skills/alpha/run.sh", "echo hello"),
    ];
    const sources = buildInlineSources(entries);
    const skillMd = sources[0].files.find((f) => f.path === "skills/alpha/SKILL.md")!;
    expect(skillMd.content).toBe("# my skill description");
  });

  it("skips files whose content exceeds 256KB", () => {
    const big = "x".repeat(256 * 1024 + 1);
    const entries = [
      entry("skills/alpha/SKILL.md", "# alpha"),
      { path: "skills/alpha/big.bin", content: big },
    ];
    const sources = buildInlineSources(entries);
    const paths = sources[0].files.map((f) => f.path);
    expect(paths).not.toContain("skills/alpha/big.bin");
    expect(paths).toContain("skills/alpha/SKILL.md");
  });

  it("skips files that look binary (contain null byte)", () => {
    const binary = "some\x00binary\x00content";
    const entries = [
      entry("skills/alpha/SKILL.md", "# alpha"),
      { path: "skills/alpha/lib.so", content: binary },
    ];
    const sources = buildInlineSources(entries);
    const paths = sources[0].files.map((f) => f.path);
    expect(paths).not.toContain("skills/alpha/lib.so");
  });

  it("handles nested paths: file in a subdirectory of the skill dir is included", () => {
    const entries = [
      entry("skills/alpha/SKILL.md"),
      entry("skills/alpha/scripts/run.sh"),
      entry("skills/alpha/docs/README.md"),
    ];
    const sources = buildInlineSources(entries);
    const paths = sources[0].files.map((f) => f.path).sort();
    expect(paths).toEqual([
      "skills/alpha/SKILL.md",
      "skills/alpha/docs/README.md",
      "skills/alpha/scripts/run.sh",
    ].sort());
  });

  it("handles a SKILL.md at the root level (no parent dir) using 'skill' as name", () => {
    const entries = [
      entry("SKILL.md", "# root skill"),
      entry("run.sh", "echo hi"),
    ];
    const sources = buildInlineSources(entries);
    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe("skill");
  });

  it("does not include files from outside any skill dir", () => {
    const entries = [
      entry("skills/alpha/SKILL.md"),
      entry("other/unrelated.md"),
    ];
    const sources = buildInlineSources(entries);
    const allPaths = sources.flatMap((s) => s.files.map((f) => f.path));
    expect(allPaths).not.toContain("other/unrelated.md");
  });

  it("multiple skills: de-duped correctly, no cross-contamination", () => {
    const entries = [
      entry("pack/skill-a/SKILL.md", "# a"),
      entry("pack/skill-a/a.sh", "# a script"),
      entry("pack/skill-b/SKILL.md", "# b"),
      entry("pack/skill-b/b.sh", "# b script"),
    ];
    const sources = buildInlineSources(entries);
    expect(sources).toHaveLength(2);
    const a = sources.find((s) => s.name === "skill-a")!;
    const b = sources.find((s) => s.name === "skill-b")!;
    expect(a.files.every((f) => f.path.startsWith("pack/skill-a/"))).toBe(true);
    expect(b.files.every((f) => f.path.startsWith("pack/skill-b/"))).toBe(true);
  });
});
