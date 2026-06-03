/**
 * Detector module: instruction-override & tool-poisoning phrasing.
 *
 * Catches prompt-injection text that tries to override the downstream agent's
 * prior instructions, change its trust boundaries, or poison its tool/skill
 * behaviour. Owned by agent `prefilter-override` — add rules + TDD here only.
 *
 * Finding types (must exist in `@jenz/shared` taxonomy):
 *   instruction-override · social-engineering · excessive-agency · description-mismatch
 *
 * These EXTEND the inline core `INSTRUCTION_OVERRIDE` detector in `../prefilter.ts`
 * (which already catches "ignore/disregard/… (previous|prior|…) instructions/rules"
 * and "you are now … (DAN|unrestricted|jailbroken)"). Every rule here adds
 * coverage the core misses. The composition root supplies file/line/quote and
 * dedupes (type,file,line,quote) overlaps, keeping the highest severity.
 *
 * Severity rationale (LOCKED `scoreRisk()`): a clear override/tool-poison
 * directive is `high` (any high ⇒ suspicious, two ⇒ malicious). Softer trust-
 * boundary subversion ("don't tell the user") and authority/social pressure are
 * `medium` (⇒ suspicious) and are kept TIGHTLY scoped so they never fire on a
 * benign imperative — a single FP turns a clean skill suspicious.
 */

import type { RegexRule } from './types';

export const OVERRIDE_RULES: RegexRule[] = [
  // ── New override phrasings the core regex misses (high) ──

  // "ignore/disregard/forget everything above|below" — the core requires the
  // object to be instructions/rules; this variant targets positional text.
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\b(?:ignore|disregard|forget)\b[^.\n]{0,16}\beverything\b[^.\n]{0,16}\b(?:above|below)\b/i,
  },

  // "disregard/ignore your (system|developer) (prompt|instructions|guidelines)".
  // Core covers "ignore … your … instructions" but not the system/developer-
  // prompt phrasing where the qualifier sits between verb and object.
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,20}\b(?:system|developer)\b[^.\n]{0,16}\b(?:prompt|instructions?|guidelines?|message)\b/i,
  },

  // "from now on, you (are|will|must|should) …" — a classic role/behaviour reset.
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\bfrom\s+now\s+on\b[\s,]*you\s+(?:are|will|must|shall|should|need\s+to|have\s+to)\b/i,
  },

  // A literal "New instructions:" / "Updated instructions:" header — injection
  // pretending the prior context was superseded.
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\b(?:new|updated|revised|real|actual|true)\s+(?:instructions?|directives?|rules?|system\s+prompt)\s*:/i,
  },

  // "system override" / "override (the )?system" — explicit control seizure.
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\bsystem\s+override\b|\boverride\b[^.\n]{0,12}\bsystem\b/i,
  },

  // Enable a jailbreak persona/mode: developer|god|DAN|jailbreak|sudo + "mode".
  // Scoped to enabling verbs so prose like "in developer mode this logs more"
  // does NOT trip — only "enable/activate/turn on … developer mode".
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\b(?:enable|activate|enter|turn\s+on|switch\s+to|engage|unlock|you\s+are\s+in)\b[^.\n]{0,20}\b(?:developer|god|DAN|jailbreak|sudo|admin|root|unrestricted)\s+mode\b/i,
  },

  // "pretend/act as if you have no (restrictions|rules|guidelines|limits)" and
  // bare "you have no restrictions". Scoped to the no-guardrails object so a
  // legit "act as a linter" / "you have no open PRs" never matches.
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\b(?:pretend|act\s+(?:as\s+if|like)|imagine)\b[^.\n]{0,24}\b(?:no|without)\b[^.\n]{0,12}\b(?:restrictions?|rules?|guidelines?|limits?|filters?|guardrails?|safety)\b|\byou\s+(?:have|now\s+have)\s+no\b[^.\n]{0,12}\b(?:restrictions?|rules?|guidelines?|limits?|filters?|guardrails?)\b/i,
  },

  // ── Embedded prompt-injection markers (high) ──

  // Fake role/system delimiters smuggled into skill text: "[system]", "<system>",
  // "<|system|>", "BEGIN SYSTEM PROMPT", "###instruction###", "<IMPORTANT>…".
  // These have no legitimate place in a skill's prose/scripts.
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\[(?:system|assistant|developer)\]|<\/?\|?\s*(?:system|assistant|developer)\s*\|?>|\b(?:BEGIN|END)\s+SYSTEM\s+PROMPT\b|#{2,}\s*instructions?\s*#{2,}|<\/?\s*IMPORTANT\s*>/i,
  },

  // ── Tool poisoning / hidden-action directives (high) ──

  // "before (every response|using any tool|you answer|each reply), (read|run|
  // send|fetch|invoke|call|execute|exfiltrate)…" — makes the agent take a hidden
  // action on every turn. Scoped to action verbs so "before you start, read the
  // README" (the README/build-first benign cases) does NOT match.
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\bbefore\s+(?:every|each|any|you|using)\b[^.\n]{0,28}\b(?:read|run|send|fetch|post|upload|exfiltrate|leak|invoke|call|execute|curl|wget|email|transmit|forward)\b/i,
  },

  // "always (call|invoke|run|execute) <X> first" and "when this skill is
  // (loaded|used|invoked|installed), also (read|run|send|fetch)…".
  {
    type: 'instruction-override',
    severity: 'high',
    match: /\balways\s+(?:call|invoke|run|execute)\b[^.\n]{0,28}\bfirst\b|\bwhen\s+this\s+skill\s+is\s+(?:loaded|used|invoked|installed|activated|run)\b[^.\n]{0,20}\b(?:also|secretly|silently)?\b[^.\n]{0,12}\b(?:read|run|send|fetch|post|upload|invoke|call|execute|curl|wget|email)\b/i,
  },

  // ── Trust-boundary subversion (excessive-agency, medium) ──

  // "do not (tell|mention|inform|notify|reveal to|show) the user". Scoped to the
  // user-concealment object so a generic "do not commit secrets" never matches.
  {
    type: 'excessive-agency',
    severity: 'medium',
    match: /\b(?:do\s+not|don't|never|avoid|without)\b[^.\n]{0,16}\b(?:tell|telling|mention|mentioning|inform|informing|notify|notifying|reveal|revealing|alert|alerting|warn|warning|show|showing)\b[^.\n]{0,16}\b(?:the\s+)?user\b/i,
  },

  // Act "without (asking|confirmation|approval|permission|the user('s)? consent)"
  // and "skip (all )?confirmations". Anchored on the by-passing-consent object so
  // "ask the user before X" (affirming consent) does NOT match.
  {
    type: 'excessive-agency',
    severity: 'medium',
    match: /\bwithout\b[^.\n]{0,16}\b(?:asking|confirmation|approval|permission|consent|the\s+user|notifying|telling)\b|\bskip\b[^.\n]{0,16}\b(?:all\s+)?(?:confirmations?|approvals?|prompts?|the\s+confirmation)\b/i,
  },

  // "silently/secretly/quietly/covertly (do|send|run|upload|read|delete…)".
  // The covert adverb plus an action verb — concealment of agency.
  {
    type: 'excessive-agency',
    severity: 'medium',
    match: /\b(?:silently|secretly|quietly|covertly|stealthily|discreetly)\b[^.\n]{0,20}\b(?:send|run|read|upload|post|fetch|copy|delete|execute|exfiltrate|transmit|forward|collect|store|log|email)\b/i,
  },

  // ── Authority / social pressure (social-engineering, medium) ──

  // "(this is )?authorized by (the )?(admin|security|IT|operator|owner)" and
  // "you have (full )?permission to" — fabricated authority to lower the agent's
  // guard. Scoped to the authority object so it never trips on benign prose.
  {
    type: 'social-engineering',
    severity: 'medium',
    match: /\bauthoriz(?:ed|ation)\b[^.\n]{0,12}\bby\b[^.\n]{0,12}\b(?:the\s+)?(?:admin(?:istrator)?|security|IT|operator|owner|management|compliance|sysadmin)\b|\byou\s+(?:have|are\s+granted)\b[^.\n]{0,12}\bpermission\s+to\b/i,
  },

  // "for debugging (purposes)? only, (send|share|reveal|print|paste|dump)…" — a
  // pretextual reason to leak data. Scoped to the disclosure verb.
  {
    type: 'social-engineering',
    severity: 'medium',
    match: /\bfor\s+(?:debugging|testing|verification|diagnostic|audit)\b[^.\n]{0,20}\bonly\b[^.\n]{0,20}\b(?:send|share|reveal|print|paste|dump|show|output|email|post|upload)\b/i,
  },

  // Bare "trust me" — manipulative reassurance. Anchored with a non-word boundary
  // after "me" so "trust metadata" / "Trustworthy" does NOT match.
  {
    type: 'social-engineering',
    severity: 'medium',
    match: /\btrust\s+me\b(?![a-z])/i,
  },
];
