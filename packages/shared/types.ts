export type Risk = 'pending' | 'safe' | 'suspicious' | 'malicious';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Detector = 'regex' | 'llm';
export type SkillSource = 'github' | 'upload' | 'mcp' | 'inline';

export interface Finding {
  type: string;        // e.g. "Credential exfiltration"
  severity: Severity;
  file: string;        // e.g. "scripts/run.sh"
  line: number;
  quote: string;       // the offending line text
  detector: Detector;
}
export interface SkillFile { path: string; content: string; }
export interface RawSkill {
  slug: string; name: string; files: SkillFile[];
  source: SkillSource; sourceRef?: string;
}
export interface AuditedSkill {
  slug: string; name: string;
  risk: Risk; findings: Finding[];
  description?: string; category?: string;
}
