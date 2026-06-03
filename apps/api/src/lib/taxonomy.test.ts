import { describe, it, expect } from 'vitest';
import { taxonomyFor, taxonomyMapFor } from './taxonomy';

describe('taxonomyFor (finding type → standards crosswalk)', () => {
  it('maps instruction-override across all four standards', () => {
    expect(taxonomyFor('instruction-override')).toEqual({
      owaspLlm: ['LLM01'],
      owaspAgentic: ['ASI01', 'ASI06'],
      owaspSkills: ['AST01'],
      mitreAtlas: ['AML.T0051'],
    });
  });

  it('maps exfiltration with two MITRE ATLAS ids', () => {
    expect(taxonomyFor('exfiltration')).toEqual({
      owaspLlm: ['LLM02', 'LLM06'],
      owaspAgentic: ['ASI02', 'ASI03'],
      owaspSkills: ['AST01', 'AST03'],
      mitreAtlas: ['AML.T0025', 'AML.T0057'],
    });
  });

  it('maps credential-access', () => {
    expect(taxonomyFor('credential-access')).toEqual({
      owaspLlm: ['LLM02', 'LLM06'],
      owaspAgentic: ['ASI03'],
      owaspSkills: ['AST03'],
      mitreAtlas: ['AML.T0055', 'AML.T0037'],
    });
  });

  it('maps hidden-unicode with an empty mitreAtlas (no clean leaf)', () => {
    const t = taxonomyFor('hidden-unicode');
    expect(t.owaspLlm).toEqual(['LLM01']);
    expect(t.owaspAgentic).toEqual(['ASI06']);
    expect(t.owaspSkills).toEqual(['AST08']);
    expect(t.mitreAtlas).toEqual([]);
  });

  it('maps obfuscation with an empty mitreAtlas', () => {
    expect(taxonomyFor('obfuscation')).toEqual({
      owaspLlm: ['LLM01', 'LLM03'],
      owaspAgentic: ['ASI04', 'ASI06'],
      owaspSkills: ['AST08'],
      mitreAtlas: [],
    });
  });

  it('returns all-empty arrays for an unknown type', () => {
    expect(taxonomyFor('nonsense')).toEqual({
      owaspLlm: [],
      owaspAgentic: [],
      owaspSkills: [],
      mitreAtlas: [],
    });
  });
});

describe('taxonomyMapFor (response-boundary crosswalk map)', () => {
  it('keys the map by distinct mapped finding type, dropping duplicates + unmapped types', () => {
    const map = taxonomyMapFor([
      { type: 'exfiltration' },
      { type: 'exfiltration' }, // duplicate → one entry
      { type: 'credential-access' },
      { type: 'nonsense' }, // unmapped → omitted
    ]);
    expect(Object.keys(map).sort()).toEqual(['credential-access', 'exfiltration']);
    expect(map.exfiltration.owaspLlm).toEqual(['LLM02', 'LLM06']);
    expect(map['credential-access'].mitreAtlas).toEqual(['AML.T0055', 'AML.T0037']);
  });

  it('returns an empty object for no findings', () => {
    expect(taxonomyMapFor([])).toEqual({});
  });
});
