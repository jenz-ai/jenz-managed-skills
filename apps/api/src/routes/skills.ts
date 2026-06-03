import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { Prisma } from '@prisma/client';
import type { AuditedSkill, Finding, RawSkill, Risk, Severity } from '@jenz/shared';
import { prisma } from '../db';
import { auditSkill } from '../lib/audit';
import { fetchSkillsFromGitHub, GitHubError } from '../lib/github';
import { taxonomyMapFor } from '../lib/taxonomy';
import { getSupabaseUser } from '../lib/supabase-auth';
import { ensureUserWorkspace } from '../lib/workspace';

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
 * Resolve the calling workspace from an optional Supabase bearer token.
 *
 * - Valid dashboard token  → that user's workspace id (library is per-workspace).
 * - No / invalid token     → null = the open "agent/MCP" pool.
 *
 * NON-FATAL by design: the agent-facing API (MCP `list_managed_skills`,
 * unauthenticated import, the gate) must keep working without a token, so an
 * absent/invalid token resolves to the null pool rather than a 401.
 */
async function resolveWorkspaceId(c: Context): Promise<string | null> {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const user = await getSupabaseUser(token);
  if (!user) return null;
  const { workspace } = await ensureUserWorkspace(user);
  return workspace.id;
}

/**
 * Only SAFE skills get a topic folder. A quarantined (suspicious/malicious)
 * skill belongs in Quarantine, not a category — and the auditor's category for
 * a non-safe skill often just echoes the finding type (e.g. 'excessive-agency'),
 * which spawns a junk folder. So we drop `category` unless the verdict is safe.
 * (A dedicated folder-aware categorizer for safe skills is the follow-up.)
 */
function categoryFor(audited: { risk: Risk; category?: string }): { category: string } | Record<string, never> {
  return audited.risk === 'safe' && audited.category !== undefined ? { category: audited.category } : {};
}

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

  // Scope the library to the caller's workspace (null = open agent/MCP pool),
  // so a signed-in dashboard user sees only their own uploads.
  const where: Prisma.SkillWhereInput = { workspaceId: await resolveWorkspaceId(c) };
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
 * Resolve a request body to ONE OR MORE RawSkills, or return an error + status.
 * Shared by both `/import` (sync) and `/import/stream` (SSE) so the two paths
 * stay identical without any code duplication.
 *
 * Handles three shapes:
 *   1. {source:{type:'inline', name, files}} → one RawSkill, built directly
 *   2. {source:{type:'github', url}}         → fetch from GitHub (N skills)
 *   3. Legacy top-level {ref|url|repo}       → fetch from GitHub (N skills)
 *
 * A GitHub repo with multiple `SKILL.md` directories fans out into one RawSkill
 * per skill; a single-skill repo (or one with no SKILL.md) yields exactly one.
 */
async function resolveRawSkills(
  body: unknown,
): Promise<{ raws: RawSkill[] } | { error: string; status: number }> {
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
    return { raws: [{ slug, name, source: 'inline', files }] };
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
    const raws = await fetchSkillsFromGitHub(ref);
    return { raws };
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

  const result = await resolveRawSkills(body);
  if ('error' in result) return c.json({ error: result.error }, result.status as 400);
  const workspaceId = await resolveWorkspaceId(c);

  // Audit every resolved skill 1-by-1. A single import (inline, or a one-skill
  // repo) returns the bare AuditedSkill+id envelope as before; a multi-skill
  // repo returns { skills: [...] }, so existing single-skill callers are unchanged.
  const envelopes: (AuditedSkill & { id: string })[] = [];
  for (const raw of result.raws) {
    const skill = await persistPendingSkill(raw, workspaceId);
    const audited = await auditSkill(raw);
    await finalizeVerdict(skill.id, audited);
    envelopes.push({ id: skill.id, ...auditedEnvelope(audited) });
  }

  return c.json(envelopes.length === 1 ? envelopes[0] : { skills: envelopes }, 201);
});

/**
 * POST /import/stream — streaming, persisting import.
 *
 * Body identical to POST /import. Validates (and enumerates a GitHub repo into
 * its N skills) BEFORE opening the stream, so invalid bodies get a plain JSON
 * 400, not an SSE error. A repo with multiple `SKILL.md` dirs fans out into N
 * skills, audited ONE AT A TIME; every streamed event carries the skill's
 * `index` (0-based, matching the `discovered` list) so the client can route it
 * to the right row. Event order:
 *   1. Open SSE stream, emit `discovered` { total, skills:[{index,slug,name}] }.
 *   2. For each skill, in order:
 *      a. Persist a `pending` row.
 *      b. Run audit, emitting `progress` { index, message } live.
 *      c. On success: write host verdict, emit `verdict` { index, id, ... }.
 *      d. On throw: emit `error` { index }, leave row `pending` (fail closed).
 *
 * A single-skill import emits one `discovered` entry and exactly one verdict —
 * the legacy shape, plus the additive `index` field.
 */
skills.post('/import/stream', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  // Validate (and enumerate the GitHub repo's skills) BEFORE the stream opens.
  const result = await resolveRawSkills(body);
  if ('error' in result) return c.json({ error: result.error }, result.status as 400);
  const raws = result.raws;
  const workspaceId = await resolveWorkspaceId(c);

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

      // Announce every discovered skill up front so the UI can render all rows
      // immediately, before any single audit completes.
      await emit('discovered', {
        total: raws.length,
        skills: raws.map((r, index) => ({ index, slug: r.slug, name: r.name })),
      });

      // Audit each skill 1-by-1. One skill failing never aborts the rest — it
      // emits its own `error` and the loop moves on (per-skill fail-closed).
      for (let index = 0; index < raws.length; index++) {
        const raw = raws[index];
        try {
          const skill = await persistPendingSkill(raw, workspaceId);
          const audited = await auditSkill(raw, (message) => {
            void emit('progress', { index, message });
          });
          await finalizeVerdict(skill.id, audited);
          await emit('verdict', {
            index,
            id: skill.id,
            ...auditedEnvelope(audited),
            taxonomy: taxonomyMapFor(audited.findings),
          });
        } catch {
          // Fail closed: a thrown audit (or persist) yields an error event for
          // this skill, never a verdict. Generic message — no internals leaked.
          await emit('error', { index, error: 'audit failed' });
        }
      }

      // Drain the chain so nothing queued is dropped.
      await chain;
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
 * Persist a RawSkill as a `pending` row (replacing any prior row for its slug),
 * returning the created row. Shared by every import path so a skill always
 * exists in the DB before its audit runs — a thrown audit therefore leaves a
 * `pending` (never `safe`) row behind: fail closed.
 */
async function persistPendingSkill(raw: RawSkill, workspaceId: string | null) {
  return prisma.$transaction(async (tx) => {
    await tx.skill.deleteMany({ where: { slug: raw.slug } });
    return tx.skill.create({
      data: {
        slug: raw.slug,
        name: raw.name,
        source: raw.source,
        ...(raw.sourceRef ? { sourceRef: raw.sourceRef } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        risk: 'pending',
        contentHash: computeContentHash(raw.files),
        files: { create: raw.files.map((f) => ({ path: f.path, content: f.content })) },
      },
    });
  });
}

/** Write the host-computed verdict + findings onto a previously-pending row. */
async function finalizeVerdict(skillId: string, audited: AuditedSkill) {
  await prisma.skill.update({
    where: { id: skillId },
    data: {
      risk: audited.risk,
      ...(audited.description !== undefined ? { description: audited.description } : {}),
      ...categoryFor(audited),
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
}

/** The AuditedSkill response envelope (sans id), shared by the import responses. */
function auditedEnvelope(audited: AuditedSkill): AuditedSkill {
  return {
    slug: audited.slug,
    name: audited.name,
    risk: audited.risk,
    findings: audited.findings,
    ...(audited.description !== undefined ? { description: audited.description } : {}),
    ...categoryFor(audited),
  };
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
