import { Hono } from 'hono';
import type { RawSkill } from '@jenz/shared';
import { auditSkill } from '../lib/audit';
import { taxonomyMapFor } from '../lib/taxonomy';

/**
 * POST /audit — audit a skill bundle for prompt injection / malicious code.
 *
 * Body: a RawSkill, or `{ raw: RawSkill }`.
 * 200 → AuditedSkill  (host-computed verdict; the model never decides risk).
 * 400 → { error }     (invalid body — we validate at the boundary, fail loud).
 *
 * The internals (auditSkill) get swapped from the stub to the real pipeline
 * with NO change to this contract — so MCP/web can integrate against it now.
 */
const audit = new Hono();

audit.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const candidate =
    body && typeof body === 'object' && 'raw' in (body as Record<string, unknown>)
      ? (body as { raw: unknown }).raw
      : body;

  const error = validateRawSkill(candidate);
  if (error) return c.json({ error }, 400);

  const raw = normalize(candidate as RawSkill);
  const audited = await auditSkill(raw);
  // Enrich at the response boundary (host-side, deterministic, never persisted):
  // the OWASP/MITRE crosswalk keyed by finding type, for the findings UI.
  return c.json({ ...audited, taxonomy: taxonomyMapFor(audited.findings) }, 200);
});

function validateRawSkill(x: unknown): string | null {
  if (!x || typeof x !== 'object') return 'body must be a RawSkill object (or { raw: RawSkill })';
  const r = x as Record<string, unknown>;
  if (typeof r.slug !== 'string' || r.slug.length === 0) return 'slug (non-empty string) required';
  if (typeof r.name !== 'string' || r.name.length === 0) return 'name (non-empty string) required';
  if (!Array.isArray(r.files) || r.files.length === 0) return 'files (non-empty array) required';
  for (const f of r.files) {
    if (!f || typeof f !== 'object') return 'each file must be { path, content }';
    const ff = f as Record<string, unknown>;
    if (typeof ff.path !== 'string' || typeof ff.content !== 'string') {
      return 'each file needs string path + content';
    }
  }
  return null;
}

/** Fill optional metadata so the engine has a complete, immutable RawSkill. */
function normalize(raw: RawSkill): RawSkill {
  const allowed = ['github', 'upload', 'mcp', 'inline'] as const;
  const source = (allowed as readonly string[]).includes(raw.source) ? raw.source : 'upload';
  return {
    slug: raw.slug,
    name: raw.name,
    files: raw.files.map((f) => ({ path: f.path, content: f.content })),
    source,
    ...(raw.sourceRef ? { sourceRef: raw.sourceRef } : {}),
  };
}

export default audit;
