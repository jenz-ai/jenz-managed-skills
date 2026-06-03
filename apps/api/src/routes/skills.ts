import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { Prisma } from '@prisma/client';
import type { AuditedSkill, Finding, RawSkill, Risk, Severity } from '@jenz/shared';
import { prisma } from '../db';
import { auditSkill } from '../lib/audit';
import { fetchSkillFromGitHub, GitHubError } from '../lib/github';
import { taxonomyMapFor } from '../lib/taxonomy';

/**
 * Skill routes — import a skill from GitHub, read its verdict, and the GATE.
 *
 * Mounted by index.ts at /api/skills, so paths here are relative.
 *
 * - GET  /            the library list (summaries).     → 200 { skills: [...] }
 * - POST /import       fetch + persist + audit a skill. → 201 AuditedSkill+id
 * - GET  /:id          the host-computed verdict.        → 200 AuditedSkill+id
 * - GET  /:id/files    THE GATE: release files iff safe. → 200 { files } | 403
 *
 * We validate at the boundary and fail loud. The gate reads the host-computed
 * `risk` off the row — never a model-emitted one.
 */
const skills = new Hono();

const VALID_RISK: readonly Risk[] = ['pending', 'safe', 'suspicious', 'malicious'];

/**
 * GET / — browse/search the workspace skill library. Returns lightweight
 * summaries only (NO file contents — that's the gate's job). Optional filters:
 *   ?category=<exact>  ?risk=<pending|safe|suspicious|malicious>  ?query=<free text>
 * Shape matches the MCP `list_managed_skills` contract 1:1: { skills: ListItem[] }.
 */
skills.get('/', async (c) => {
  const category = c.req.query('category');
  const risk = c.req.query('risk');
  // `query` is the MCP param name; accept `q` as a convenience alias.
  const query = c.req.query('query') ?? c.req.query('q');

  const where: Prisma.SkillWhereInput = {};
  if (category) where.category = category;
  if (risk && VALID_RISK.includes(risk as Risk)) where.risk = risk as Risk;
  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { slug: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.skill.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { findings: true } } },
  });

  // category/description are nullable in the DB but required strings in the
  // MCP/web contract — coalesce null → '' so consumers never see null.
  const list = rows.map((s) => ({
    id: s.id,
    name: s.name,
    risk: s.risk,
    category: s.category ?? '',
    description: s.description ?? '',
    findingsCount: s._count.findings,
  }));
  return c.json({ skills: list }, 200);
});

/**
 * Resolve a request body to a RawSkill, or return an error + HTTP status.
 * Shared by both `/import` (sync) and `/import/stream` (SSE) so the two paths
 * stay identical without any code duplication.
 *
 * Handles three shapes:
 *   1. {source:{type:'inline', name, files}} → build a RawSkill directly
 *   2. {source:{type:'github', url}}         → fetch from GitHub
 *   3. Legacy top-level {ref|url|repo}       → fetch from GitHub
 */
async function resolveRawSkill(
  body: unknown,
): Promise<{ raw: RawSkill } | { error: string; status: number }> {
  const source =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).source
      : undefined;

  // 1) {source:{type:'inline', name, files}}
  if (
    source &&
    typeof source === 'object' &&
    (source as Record<string, unknown>).type === 'inline'
  ) {
    const s = source as Record<string, unknown>;
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (!name)
      return { error: 'inline source requires a non-empty name', status: 400 };
    const files = parseInlineFiles(s.files);
    if (!files)
      return {
        error: 'inline source requires a non-empty files array of {path, content}',
        status: 400,
      };
    const slug = slugify(name);
    if (!slug)
      return { error: 'name does not produce a valid slug', status: 400 };
    return { raw: { slug, name, source: 'inline', files } };
  }

  // 2) {source:{type:'github', url}} or 3) legacy top-level {ref|url|repo}
  let ref: string | null = null;
  if (
    source &&
    typeof source === 'object' &&
    (source as Record<string, unknown>).type === 'github'
  ) {
    const url = (source as Record<string, unknown>).url;
    if (typeof url !== 'string' || url.trim().length === 0)
      return { error: 'github source requires a non-empty url string', status: 400 };
    ref = url.trim();
  } else {
    ref = extractRef(body);
  }
  if (!ref)
    return { error: 'ref (owner/repo[/subdir] or GitHub URL) required', status: 400 };

  try {
    const raw = await fetchSkillFromGitHub(ref);
    return { raw };
  } catch (e) {
    if (e instanceof GitHubError) return { error: e.message, status: e.status };
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `import failed: ${msg}`, status: 400 };
  }
}

skills.post('/import', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const result = await resolveRawSkill(body);
  if ('error' in result) return c.json({ error: result.error }, result.status as 400);
  return persistAuditRespond(c, result.raw);
});

/**
 * POST /import/stream — streaming, persisting import.
 *
 * Body identical to POST /import. Validates BEFORE opening the stream so
 * invalid bodies get a plain JSON 400, not an SSE error. On success:
 *   1. Persist a `pending` row.
 *   2. Open SSE stream.
 *   3. Run audit, emitting `progress` events live.
 *   4. On success: update row with host-computed verdict, emit `verdict`.
 *   5. On throw: emit `error`, leave row as `pending` (fail closed — never safe).
 */
skills.post('/import/stream', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  // Validate (and optionally fetch from GitHub) BEFORE the stream opens.
  const result = await resolveRawSkill(body);
  if ('error' in result) return c.json({ error: result.error }, result.status as 400);
  const raw = result.raw;

  // Persist as `pending` BEFORE streaming, so the id is available in the verdict event.
  const skill = await prisma.$transaction(async (tx) => {
    await tx.skill.deleteMany({ where: { slug: raw.slug } });
    return tx.skill.create({
      data: {
        slug: raw.slug,
        name: raw.name,
        source: raw.source,
        ...(raw.sourceRef ? { sourceRef: raw.sourceRef } : {}),
        risk: 'pending',
        contentHash: computeContentHash(raw.files),
        files: { create: raw.files.map((f) => ({ path: f.path, content: f.content })) },
      },
    });
  });

  // Defeat proxy buffering — frames must arrive live.
  c.header('X-Accel-Buffering', 'no');

  return streamSSE(
    c,
    async (stream) => {
      // Serialize writes through a single promise chain: onProgress is sync
      // but writeSSE is async; the chain preserves event order and ensures all
      // writes flush before the stream closes.
      let chain: Promise<void> = Promise.resolve();
      const emit = (event: string, dataObj: unknown): Promise<void> => {
        chain = chain.then(() =>
          stream.writeSSE({ event, data: JSON.stringify(dataObj) }),
        );
        return chain;
      };

      try {
        const audited = await auditSkill(raw, (message) => {
          void emit('progress', { message });
        });

        // Host-computed verdict: update the row, then stream the result.
        await prisma.skill.update({
          where: { id: skill.id },
          data: {
            risk: audited.risk,
            ...(audited.description !== undefined ? { description: audited.description } : {}),
            ...(audited.category !== undefined ? { category: audited.category } : {}),
            findings: {
              create: audited.findings.map((f) => ({
                type: f.type,
                severity: f.severity,
                file: f.file,
                line: f.line,
                quote: f.quote,
                detector: f.detector,
              })),
            },
          },
        });

        await emit('verdict', {
          id: skill.id,
          slug: audited.slug,
          name: audited.name,
          risk: audited.risk,
          findings: audited.findings,
          ...(audited.description !== undefined ? { description: audited.description } : {}),
          ...(audited.category !== undefined ? { category: audited.category } : {}),
          taxonomy: taxonomyMapFor(audited.findings),
        });
      } catch {
        // Fail closed: a thrown audit yields an error event, never a verdict.
        // Generic message — internals are never leaked to the client.
        await emit('error', { error: 'audit failed' });
      } finally {
        // Drain the chain so nothing queued is dropped.
        await chain;
      }
    },
    // Fallback: streamSSE surfaced an error while running the callback.
    async (_e: Error, stream: SSEStreamingApi) => {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: 'audit failed' }),
      });
    },
  );
});

/**
 * The persist → audit → respond flow, shared by every import path.
 * Persists the RawSkill as pending (replacing any prior row for its slug),
 * runs the audit, writes the host-computed verdict + findings, and returns
 * the AuditedSkill+id envelope.
 */
async function persistAuditRespond(c: Context, raw: RawSkill) {
  // Persist as pending first, replacing any prior row for this slug.
  const skill = await prisma.$transaction(async (tx) => {
    await tx.skill.deleteMany({ where: { slug: raw.slug } });
    return tx.skill.create({
      data: {
        slug: raw.slug,
        name: raw.name,
        source: raw.source,
        ...(raw.sourceRef ? { sourceRef: raw.sourceRef } : {}),
        risk: 'pending',
        contentHash: computeContentHash(raw.files),
        files: { create: raw.files.map((f) => ({ path: f.path, content: f.content })) },
      },
    });
  });

  // Audit, then write the host-computed verdict + findings onto the row.
  const audited = await auditSkill(raw);
  await prisma.skill.update({
    where: { id: skill.id },
    data: {
      risk: audited.risk,
      ...(audited.description !== undefined ? { description: audited.description } : {}),
      ...(audited.category !== undefined ? { category: audited.category } : {}),
      findings: {
        create: audited.findings.map((f) => ({
          type: f.type,
          severity: f.severity,
          file: f.file,
          line: f.line,
          quote: f.quote,
          detector: f.detector,
        })),
      },
    },
  });

  return c.json(
    {
      id: skill.id,
      slug: raw.slug,
      name: raw.name,
      risk: audited.risk,
      findings: audited.findings,
      ...(audited.description !== undefined ? { description: audited.description } : {}),
      ...(audited.category !== undefined ? { category: audited.category } : {}),
    },
    201,
  );
}

/**
 * sha256 over the file bytes in a canonical (path-sorted) form, so the hash is
 * stable regardless of file ordering. This is what the gate re-verifies before
 * releasing files — any byte change after the audit flips the hash and the gate
 * fails closed. Any future code that mutates a skill's files MUST recompute this.
 */
function computeContentHash(files: { path: string; content: string }[]): string {
  // JSON-encoded [path, content] pairs in path order: deterministic and
  // unambiguous (no separator collision between path and content boundaries).
  const canonical = JSON.stringify(
    [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => [f.path, f.content]),
  );
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}


/** Validate an inline `files` value → SkillFile[] (non-empty, each {path,content} strings) or null. */
function parseInlineFiles(value: unknown): RawSkill['files'] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const files: RawSkill['files'] = [];
  for (const f of value) {
    if (!f || typeof f !== 'object') return null;
    const { path, content } = f as Record<string, unknown>;
    if (typeof path !== 'string' || typeof content !== 'string') return null;
    files.push({ path, content });
  }
  return files;
}

/** lowercase, runs of non-alphanumerics → '-', trim leading/trailing '-'. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

skills.get('/:id', async (c) => {
  const skill = await prisma.skill.findUnique({
    where: { id: c.req.param('id') },
    include: { findings: true },
  });
  if (!skill) return c.json({ error: 'not_found' }, 404);

  const findings = skill.findings.map(toFinding);
  const body: AuditedSkill & { id: string } = {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    risk: skill.risk,
    findings,
    // Host-derived OWASP/MITRE crosswalk for the findings UI — mirrors POST /audit,
    // computed at the response boundary (not persisted, never model-emitted).
    taxonomy: taxonomyMapFor(findings),
    ...(skill.description !== null ? { description: skill.description } : {}),
    ...(skill.category !== null ? { category: skill.category } : {}),
  };
  return c.json(body, 200);
});

skills.get('/:id/files', async (c) => {
  const skill = await prisma.skill.findUnique({
    where: { id: c.req.param('id') },
    include: { files: true, findings: true },
  });
  if (!skill) return c.json({ error: 'not_found' }, 404);

  if (skill.risk !== 'safe') {
    return c.json({ error: 'not_safe', risk: skill.risk, reason: gateReason(skill.risk, skill.findings) }, 403);
  }

  // Integrity re-verification (TOCTOU defense): re-hash the bytes we're about to
  // release and refuse if they no longer match what was audited. A mismatch means
  // the files were changed after the `safe` verdict — fail closed, demand re-audit.
  if (skill.contentHash !== null && computeContentHash(skill.files) !== skill.contentHash) {
    return c.json(
      { error: 'not_safe', risk: 'pending', reason: 'integrity check failed — files changed since audit' },
      403,
    );
  }

  return c.json({ files: skill.files.map((f) => ({ path: f.path, content: f.content })) }, 200);
});

/** Pull a GitHub ref string out of { ref | url | repo }. */
function extractRef(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const r = body as Record<string, unknown>;
  for (const key of ['ref', 'url', 'repo'] as const) {
    const v = r[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

/** Why the gate is closed: pending → not audited; else count + worst severity. */
function gateReason(risk: string, findings: { severity: Severity }[]): string {
  if (risk === 'pending') return 'audit not complete';
  if (findings.length === 0) return `${risk} (no findings)`;
  const worst = findings.reduce((a, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[a.severity] ? f : a));
  return `${findings.length} finding(s), highest severity ${worst.severity}`;
}

/** Prisma Finding row → @jenz/shared Finding shape. */
function toFinding(f: {
  type: string;
  severity: Severity;
  file: string;
  line: number;
  quote: string;
  detector: Finding['detector'];
}): Finding {
  return {
    type: f.type,
    severity: f.severity,
    file: f.file,
    line: f.line,
    quote: f.quote,
    detector: f.detector,
  };
}

export default skills;
