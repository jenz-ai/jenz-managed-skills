// Install targets — the canonical-form destinations a vetted skill can be
// written to. Ported verbatim from skills-shared.jsx TARGETS / TARGET_BY_ID.
import type { IconName } from "../components/SIcon";

export interface Target {
  id: string;
  name: string;
  path: string;
  /** Brand logo glyph in the SIcon registry (shown in the install menu). */
  icon: Extract<IconName, "claude" | "openai" | "openclaw" | "hermes">;
  badge: string;
  hue: number;
}

export const TARGETS: Target[] = [
  { id: "claude", name: "Claude Code", path: "~/.claude/skills", icon: "claude", badge: "CC", hue: 35 },
  { id: "codex", name: "Codex", path: "~/.codex/skills", icon: "openai", badge: "Cx", hue: 145 },
  { id: "openclaw", name: "OpenClaw", path: "~/.openclaw/skills", icon: "openclaw", badge: "OC", hue: 295 },
  { id: "hermes", name: "Hermes", path: "~/.hermes/skills", icon: "hermes", badge: "He", hue: 230 },
];

export const TARGET_BY_ID: Record<string, Target> = Object.fromEntries(
  TARGETS.map((t) => [t.id, t]),
);
