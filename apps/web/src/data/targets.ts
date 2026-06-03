// Install targets — the canonical-form destinations a vetted skill can be
// written to. Ported verbatim from skills-shared.jsx TARGETS / TARGET_BY_ID.
export interface Target {
  id: string;
  name: string;
  path: string;
  badge: string;
  hue: number;
}

export const TARGETS: Target[] = [
  { id: "claude", name: "Claude Code", path: "~/.claude/skills", badge: "CC", hue: 35 },
  { id: "codex", name: "Codex", path: "~/.codex/skills", badge: "Cx", hue: 145 },
  { id: "openclaw", name: "OpenClaw", path: "~/.openclaw/skills", badge: "OC", hue: 295 },
  { id: "hermes", name: "Hermes", path: "~/.hermes/skills", badge: "He", hue: 230 },
];

export const TARGET_BY_ID: Record<string, Target> = Object.fromEntries(
  TARGETS.map((t) => [t.id, t]),
);
