import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import type { AuditedSkill, Finding, Risk, Severity } from '@jenz/shared';
import { prisma } from '../db';
import { auditSkill } from '../lib/audit';
import { fetchSkillFromGitHub, GitHubError } from '../lib/github';

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

skills.post('/import', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const ref = extractRef(body);
  if (!ref) return c.json({ error: 'ref (owner/repo[/subdir] or GitHub URL) required' }, 400);

  let raw;
  try {
    raw = await fetchSkillFromGitHub(ref);
  } catch (e) {
    if (e instanceof GitHubError) return c.json({ error: e.message }, e.status as 400);
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `import failed: ${msg}` }, 400);
  }

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
});

skills.get('/:id', async (c) => {
  const skill = await prisma.skill.findUnique({
    where: { id: c.req.param('id') },
    include: { findings: true },
  });
  if (!skill) return c.json({ error: 'not_found' }, 404);

  const body: AuditedSkill & { id: string } = {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    risk: skill.risk,
    findings: skill.findings.map(toFinding),
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
