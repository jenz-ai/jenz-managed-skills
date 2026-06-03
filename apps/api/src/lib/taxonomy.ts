/**
 * Maps a finding `type` string to the standards IDs it implicates
 * (OWASP LLM Top 10, OWASP Agentic, OWASP Skills, MITRE ATLAS) for the
 * findings UI. Pure, deterministic, host-side — never reads model output.
 *
 * IDs are verified and used verbatim. Where no clean MITRE ATLAS leaf
 * exists (hidden-unicode, obfuscation), `mitreAtlas` is intentionally [].
 */

export interface Taxonomy {
  owaspLlm: string[];
  owaspAgentic: string[];
  owaspSkills: string[];
  mitreAtlas: string[];
}

/** Frozen, all-empty result for unknown/unmapped finding types. */
const EMPTY: Taxonomy = Object.freeze({
  owaspLlm: [],
  owaspAgentic: [],
  owaspSkills: [],
  mitreAtlas: [],
});

/** Crosswalk table, keyed by finding `type`. Read-only — never mutated. */
const TAXONOMY: Readonly<Record<string, Taxonomy>> = Object.freeze({
  'instruction-override': {
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI01', 'ASI06'],
    owaspSkills: ['AST01'],
    mitreAtlas: ['AML.T0051'],
  },
  'description-mismatch': {
    owaspLlm: ['LLM03'],
    owaspAgentic: ['ASI04'],
    owaspSkills: ['AST04'],
    mitreAtlas: ['AML.T0010.001'],
  },
  'social-engineering': {
    owaspLlm: ['LLM01', 'LLM02'],
    owaspAgentic: ['ASI03'],
    owaspSkills: ['AST04'],
    mitreAtlas: ['AML.T0052'],
  },
  'hidden-unicode': {
    owaspLlm: ['LLM01'],
    owaspAgentic: ['ASI06'],
    owaspSkills: ['AST08'],
    mitreAtlas: [],
  },
  obfuscation: {
    owaspLlm: ['LLM01', 'LLM03'],
    owaspAgentic: ['ASI04', 'ASI06'],
    owaspSkills: ['AST08'],
    mitreAtlas: [],
  },
  exfiltration: {
    owaspLlm: ['LLM02', 'LLM06'],
    owaspAgentic: ['ASI02', 'ASI03'],
    owaspSkills: ['AST01', 'AST03'],
    mitreAtlas: ['AML.T0025', 'AML.T0057'],
  },
  'credential-access': {
    owaspLlm: ['LLM02', 'LLM06'],
    owaspAgentic: ['ASI03'],
    owaspSkills: ['AST03'],
    mitreAtlas: ['AML.T0055', 'AML.T0037'],
  },
  'destructive-cmd': {
    owaspLlm: ['LLM05', 'LLM06'],
    owaspAgentic: ['ASI05'],
    owaspSkills: ['AST01', 'AST03'],
    mitreAtlas: ['AML.T0050', 'AML.T0011'],
  },
  'suspicious-download': {
    owaspLlm: ['LLM03', 'LLM05'],
    owaspAgentic: ['ASI04', 'ASI05'],
    owaspSkills: ['AST02'],
    mitreAtlas: ['AML.T0010.001', 'AML.T0050'],
  },
  'hardcoded-secret': {
    owaspLlm: ['LLM02'],
    owaspAgentic: ['ASI03'],
    owaspSkills: ['AST03'],
    mitreAtlas: ['AML.T0055'],
  },
  'excessive-agency': {
    owaspLlm: ['LLM06'],
    owaspAgentic: ['ASI02', 'ASI03'],
    owaspSkills: ['AST03'],
    mitreAtlas: ['AML.T0050', 'AML.T0011', 'AML.T0053'],
  },
  'logic-bomb': {
    owaspLlm: ['LLM05', 'LLM06'],
    owaspAgentic: ['ASI01', 'ASI05'],
    owaspSkills: ['AST01'],
    mitreAtlas: ['AML.T0050'],
  },
  'untrusted-fetch': {
    owaspLlm: ['LLM01', 'LLM03'],
    owaspAgentic: ['ASI04', 'ASI06'],
    owaspSkills: ['AST02', 'AST08'],
    mitreAtlas: ['AML.T0051', 'AML.T0036'],
  },
});

/**
 * Returns the standards crosswalk for a finding `type`.
 * Unknown/unmapped types yield a frozen, all-empty Taxonomy.
 */
export function taxonomyFor(type: string): Taxonomy {
  return TAXONOMY[type] ?? EMPTY;
}
