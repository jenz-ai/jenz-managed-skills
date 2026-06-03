import { Hono } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import type { RawSkill } from '@jenz/shared';
import { auditSkill } from '../lib/audit';

/**
 * POST /audit/stream — stream a live skill audit as Server-Sent Events.
 *
 * Body: a RawSkill, or `{ raw: RawSkill }` (identical to POST /audit).
 * Validated at the boundary BEFORE the stream opens:
 *   400 → { error }  (invalid JSON or invalid RawSkill — a normal JSON response).
 *
 * On a valid body an SSE stream opens and emits, in order:
 *   event: progress  data: { "message": string }   one per real scan step (forwarded
 *                                                    live from auditSkill's onProgress).
 *   event: verdict   data: <AuditedSkill JSON>      emitted EXACTLY ONCE on success.
 *   event: error     data: { "error": string }      emitted if the audit throws.
 *
 * Fail closed: on any audit error we emit `error` and never a `verdict` (a failed or
 * hung audit must never imply 'safe'). The error message is generic — internals are
 * never leaked to the client.
 */
const auditStream = new Hono();

auditStream.post('/', async (c) => {
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

  return streamSSE(
    c,
    async (stream) => {
      // onProgress is sync `(msg) => void`, but writeSSE is async. Serialize every
      // write through one ordered promise chain so events keep their order and all
      // flush before the callback returns (otherwise late writes get dropped).
      let chain: Promise<void> = Promise.resolve();
      const emit = (event: string, dataObj: unknown): Promise<void> => {
        chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(dataObj) }));
        return chain;
      };

      try {
        const audited = await auditSkill(raw, (message) => {
          void emit('progress', { message });
        });
        await emit('verdict', audited);
      } catch {
        // Fail closed: a thrown audit yields an error event, never a verdict.
        await emit('error', { error: 'audit failed' });
      } finally {
        // Drain the chain so nothing queued (esp. trailing progress) is dropped.
        await chain;
      }
    },
    // Fallback: streamSSE surfaced an error while running the callback.
    async (_e: Error, stream: SSEStreamingApi) => {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'audit failed' }) });
    },
  );
});

/** Validate the RawSkill at the boundary — mirrors POST /audit's rules. */
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

export default auditStream;
