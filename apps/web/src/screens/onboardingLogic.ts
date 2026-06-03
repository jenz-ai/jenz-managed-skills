// Pure logic for the Onboarding wizard (SPEC §6). Extracted from
// skills-onboarding.jsx so the wizard's branching (steps array), the folder
// SKILL.md scan / skill-name derivation, the GitHub repo-label parse, and the
// staged `total` count are unit-testable without rendering React.

export type StepId = "name" | "import" | "mcp" | "review";
export type McpPlacement = "inline" | "step";

export interface StagedSkill {
  id: string;
  name: string;
}
export interface StagedGroup {
  id: string;
  kind: "upload" | "github" | "mcp";
  label: string;
  sub: string;
  skills: StagedSkill[];
  agent?: string;
}

// Steps depend only on where MCP lives: its own step, or inline in import.
// (skills-onboarding.jsx line 18.)
export function onboardingSteps(mcpPlacement: McpPlacement): StepId[] {
  return mcpPlacement === "step"
    ? ["name", "import", "mcp", "review"]
    : ["name", "import", "review"];
}

// Sum of staged skills across all sources — drives the review/CTA copy.
export function totalSkills(groups: StagedGroup[]): number {
  return groups.reduce((a, g) => a + g.skills.length, 0);
}

// Parse a GitHub repo URL/slug into an "org/repo" label. Falls back to the
// host-stripped string when there aren't two path segments.
// (skills-onboarding.jsx addRepo, lines 69–70.)
export function parseRepoLabel(url: string): string {
  const parts = url
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  return parts.length >= 2
    ? parts[0] + "/" + parts[1]
    : url.replace(/^https?:\/\//, "");
}

// Scan an uploaded folder's relative paths for SKILL.md files and derive the
// containing directory name of each (its skill name), de-duplicated and in
// first-seen order. (skills-onboarding.jsx onFolder, lines 50–59.)
export function scanSkillDirs(paths: string[], root: string): string[] {
  const names: string[] = [];
  for (const p of paths) {
    if (/(^|\/)SKILL\.md$/i.test(p)) {
      const segs = p.split("/");
      const dir = segs.length >= 2 ? segs[segs.length - 2] : root;
      if (!names.includes(dir)) names.push(dir);
    }
  }
  return names;
}
