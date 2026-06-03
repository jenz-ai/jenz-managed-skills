// Core domain + navigation types for the Jenz Skills app.

export type Risk = "safe" | "suspicious" | "malicious" | "scanning" | "queued";
export type Severity = "high" | "medium" | "low";
export type SkillSource = "claude" | "codex" | "openclaw" | "hermes" | "cursor";

// A line in a SKILL.md / code snippet: numbered, optionally highlighted,
// and lightly typed so the viewer can color headings/comments/injection.
export interface MdLine {
  n: number;
  text: string;
  hot?: boolean;
  kind?: "com" | "h" | "inj" | null;
}

export interface Finding {
  type: string;
  sev: Severity;
  file: string;
  line: number;
  snippet: MdLine[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  source: SkillSource;
  risk: Risk;
  desc: string;
  findings: Finding[];
  skillMd: MdLine[];
  files: number;
  headline?: string;
  reported?: boolean;
  overridden?: boolean;
}

// screen ∈ {onboarding, app}; view ∈ the six panes the main area can show.
export type Screen = "onboarding" | "app";
export type View =
  | "audits"
  | "audit"
  | "library"
  | "quarantine"
  | "detail"
  | "settings";
