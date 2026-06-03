import { z } from 'zod';

// Input: a skill source (discriminated union → clean JSON schema for the agent).
export const sourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('github'), url: z.string().url() }),
  z.object({
    type: z.literal('inline'),
    name: z.string(),
    files: z.array(z.object({ path: z.string(), content: z.string() })),
  }),
]);
export type Source = z.infer<typeof sourceSchema>;

const riskEnum = z.enum(['pending', 'safe', 'suspicious', 'malicious']);

const findingSchema = z.object({
  type: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  file: z.string(),
  line: z.number(),
  quote: z.string(),
  detector: z.enum(['regex', 'llm']),
});

// Host-derived OWASP/MITRE crosswalk for a finding `type` (mirrors @jenz/shared Taxonomy).
const taxonomySchema = z.object({
  owaspLlm: z.array(z.string()),
  owaspAgentic: z.array(z.string()),
  owaspSkills: z.array(z.string()),
  mitreAtlas: z.array(z.string()),
});

// Output raw-shape for submit_skill / get_skill (AuditedSkill + the API's opaque id).
// `taxonomy` is the host-derived standards crosswalk GET /api/skills/:id returns at its
// response boundary; it MUST be declared here or the SDK's additionalProperties:false
// check rejects the live verdict (structuredContent must NOT have additional properties).
export const auditedShape = {
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  risk: riskEnum,
  findings: z.array(findingSchema),
  description: z.string().optional(),
  category: z.string().optional(),
  taxonomy: z.record(z.string(), taxonomySchema).optional(),
};

// Output raw-shape for list_managed_skills.
export const listShape = {
  skills: z.array(z.object({
    id: z.string(),
    name: z.string(),
    risk: riskEnum,
    category: z.string(),
    description: z.string(),
    findingsCount: z.number(),
  })),
};
