// Jenz Skills — fixture dataset. The 12-skill audit batch + helpers are
// populated in Task #2 (verbatim from skills-data.jsx). Task #1 only needs
// CATEGORIES + SOURCE_LABEL to seed the shell; SKILLS starts empty and is
// filled in the next task.
import type { Skill, SkillSource } from "../state/types";

export const CATEGORIES = ["Research", "Ops", "Outbound", "Narrative", "Engineering"];

export const SOURCE_LABEL: Record<SkillSource, string> = {
  claude: "Claude Code",
  codex: "Codex",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  cursor: "Cursor",
};

export const SKILLS: Skill[] = [];
