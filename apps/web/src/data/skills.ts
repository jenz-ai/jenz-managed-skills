// Source display names — maps a skill's origin (SkillSource) to a human label.
// The skill data itself is loaded live from the audit API (lib/api.ts +
// lib/adapt.ts); this is the one small static lookup the UI still needs. The
// former mock dataset (SKILLS / CATEGORIES / AUDIT_ORDER / SCAN_LABELS) was
// removed when the app moved to real data.
import type { SkillSource } from "../state/types";

export const SOURCE_LABEL: Record<SkillSource, string> = {
  claude: "Claude Code",
  codex: "Codex",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  cursor: "Cursor",
};
