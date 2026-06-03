// Pure logic for the Onboarding wizard (SPEC §6). Extracted from
// skills-onboarding.jsx so the wizard's branching (steps array), the folder
// SKILL.md scan / skill-name derivation, the GitHub repo-label parse, and the
// staged `total` count are unit-testable without rendering React.
//
// Also exports ImportSource + buildInlineSources for Onboarding.tsx and App.tsx.
// ImportSource is the canonical UI type; auditStream.ts re-exports it from here.

export type StepId = "welcome" | "name" | "import" | "mcp" | "review";

// ---- ImportSource -----------------------------------------------------------

/**
 * A source the user chose to import, ready to stream-audit.
 * This is the canonical UI contract; App.tsx and Audit.tsx use this type.
 * `kind` is the UI field; the API uses `type` — use `toApiSource` (auditStream.ts) to convert.
 */
export type ImportSource =
  | { kind: "github"; url: string; label: string }
  | { kind: "inline"; name: string; files: { path: string; content: string }[] };

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

// MCP is always its own step; the wizard opens with a Welcome step.
export function onboardingSteps(): StepId[] {
  return ["welcome", "name", "import", "mcp", "review"];
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

// ---- buildInlineSources -----------------------------------------------------

const MAX_FILE_BYTES = 256 * 1024; // 256 KB — skip obviously large files
// Binary file detection: look for a null byte in the first few hundred bytes.
// Not perfect, but good enough to avoid posting binary blobs.
function looksLikeBinary(content: string): boolean {
  return content.slice(0, 512).includes("\0");
}

/**
 * Given a flat list of {path, content} file entries from an uploaded folder,
 * groups them by skill directory (the directory containing a `SKILL.md` file)
 * and produces one `ImportSource` per skill dir.
 *
 * Rules:
 * - A skill dir is identified by containing a `SKILL.md` file (case-insensitive).
 * - Files with no SKILL.md ancestor are silently ignored (no skill dir → not a skill).
 * - Files whose content exceeds MAX_FILE_BYTES or look binary are skipped with a
 *   console.warn (graceful — the skill still gets submitted with its remaining files).
 * - Returns an empty array when no SKILL.md is found in any path.
 *
 * Pure function — no File API calls (those happen in the component).
 */
export type InlineSource = Extract<ImportSource, { kind: "inline" }>;

export function buildInlineSources(
  fileEntries: { path: string; content: string }[],
): InlineSource[] {
  // Step 1: find all skill dirs (dirs containing SKILL.md)
  const skillDirs = new Set<string>();
  for (const { path } of fileEntries) {
    if (/(^|\/)SKILL\.md$/i.test(path)) {
      const segs = path.split("/");
      // The skill dir is the parent of SKILL.md.
      // For a top-level "SKILL.md" (no parent), use "." as the key.
      const dir = segs.length >= 2 ? segs.slice(0, segs.length - 1).join("/") : ".";
      skillDirs.add(dir);
    }
  }

  if (skillDirs.size === 0) return [];

  // Step 2: group every file under its skill dir
  const dirFiles = new Map<string, { path: string; content: string }[]>();
  for (const dir of skillDirs) dirFiles.set(dir, []);

  for (const entry of fileEntries) {
    // Skip oversized or binary files
    if (entry.content.length > MAX_FILE_BYTES) {
      console.warn(`[jenz] skipping oversized file (>${MAX_FILE_BYTES}B): ${entry.path}`);
      continue;
    }
    if (looksLikeBinary(entry.content)) {
      console.warn(`[jenz] skipping likely-binary file: ${entry.path}`);
      continue;
    }

    // Find the deepest skill dir this file lives under.
    // e.g. path = "skills/alpha/scripts/run.sh" → check "skills/alpha/scripts", "skills/alpha", "skills", ""
    const segs = entry.path.split("/");
    let matched: string | null = null;
    for (let i = segs.length - 1; i >= 0; i--) {
      const candidate = segs.slice(0, i).join("/") || ".";
      if (skillDirs.has(candidate)) {
        matched = candidate;
        break;
      }
    }
    if (matched !== null) {
      dirFiles.get(matched)!.push(entry);
    }
  }

  // Step 3: build one InlineSource per skill dir
  const sources: InlineSource[] = [];
  for (const [dir, files] of dirFiles) {
    // Skill name = the last path segment of the skill dir (or the whole dir if no slash)
    const name = dir === "." ? "skill" : dir.split("/").pop()!;
    sources.push({ kind: "inline", name, files });
  }
  return sources;
}
