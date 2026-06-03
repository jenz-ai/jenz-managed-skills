/**
 * POST /api/skills/import/stream — streaming, persisting import route.
 *
 * Test strategy mirrors skills.test.ts exactly:
 *   - vi.mock auditSkill + fetchSkillFromGitHub (hermetic, never real GitHub or real model)
 *   - Real Prisma (Supabase test DB via DATABASE_URL)
 *   - Hono app.request(...)
 *   - SSE frames parsed the same way audit-stream.test.ts does it
 */
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { AuditedSkill, RawSkill } from '@jenz/shared';

vi.mock('../lib/github', () => ({
  fetchSkillsFromGitHub: vi.fn(),
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
import { auditSkill } from '../lib/audit';
import { fetchSkillsFromGitHub } from '../lib/github';

const PREFIX = 'importstream-';
const app = new Hono().route('/api/skills', skills);

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.skill.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

// ─── helpers ────────────────────────────────────────────────────────────────

interface SSEFrame {
  event?: string;
  data?: string;
}

function parseSSE(text: string): SSEFrame[] {
  return text
    .split('\n\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((frame) => {
      const event = frame.match(/event:\s*(.*)/)?.[1]?.trim();
      const data = frame.match(/data:\s*([\s\S]*)/)?.[1]?.trim();
      return { event, data };
    });
}

const streamPost = (body: unknown) =>
  app.request('/api/skills/import/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// ─── 1. Happy path: valid inline source ─────────────────────────────────────

describe('POST /api/skills/import/stream — valid inline source', () => {
  it('responds with SSE content-type and x-accel-buffering: no', async () => {
    const slug = `${PREFIX}ct`;
    vi.mocked(auditSkill).mockResolvedValue({
      slug,
      name: slug,
      risk: 'safe',
      findings: [],
    });

    const res = await streamPost({
      source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content: '# hi\n' }] },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
  });

  it('emits ≥1 progress event then exactly one verdict event', async () => {
    const slug = `${PREFIX}progress`;
    vi.mocked(auditSkill).mockImplementation(async (_raw, onProgress) => {
      onProgress?.('step 1');
      onProgress?.('step 2');
      return { slug, name: slug, risk: 'safe', findings: [] } satisfies AuditedSkill;
    });

    const res = await streamPost({
      source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content: '# hi\n' }] },
    });

    const frames = parseSSE(await res.text());
    const progress = frames.filter((f) => f.event === 'progress');
    const verdicts = frames.filter((f) => f.event === 'verdict');

    expect(progress.length).toBeGreaterThanOrEqual(1);
    expect(verdicts.length).toBe(1);
  });

  it('verdict data contains id, risk, and taxonomy', async () => {
    const slug = `${PREFIX}verdict-shape`;
    vi.mocked(auditSkill).mockResolvedValue({
      slug,
      name: slug,
      risk: 'safe',
      findings: [],
    });

    const res = await streamPost({
      source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content: '# hi\n' }] },
    });

    const frames = parseSSE(await res.text());
    const verdictFrame = frames.find((f) => f.event === 'verdict');
    expect(verdictFrame).toBeDefined();

    const verdict = JSON.parse(verdictFrame!.data ?? 'null');
    expect(typeof verdict.id).toBe('string');
    expect(typeof verdict.risk).toBe('string');
    expect(verdict.taxonomy).toBeDefined();
    expect(typeof verdict.taxonomy).toBe('object');
  });

  it('row is persisted and shows the final verdict (not pending)', async () => {
    const slug = `${PREFIX}persisted`;
    vi.mocked(auditSkill).mockResolvedValue({
      slug,
      name: slug,
      risk: 'malicious',
      findings: [
        {
          type: 'Credential exfiltration',
          severity: 'critical',
          file: 'SKILL.md',
          line: 1,
          quote: 'steal',
          detector: 'llm',
        },
      ],
      description: 'does bad things',
      category: 'malware',
    });

    const res = await streamPost({
      source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content: '# bad\n' }] },
    });

    const frames = parseSSE(await res.text());
    const verdictFrame = frames.find((f) => f.event === 'verdict');
    const verdict = JSON.parse(verdictFrame!.data ?? 'null');

    expect(typeof verdict.id).toBe('string');

    // Row must be persisted with the host-computed verdict.
    const row = await prisma.skill.findUnique({
      where: { id: verdict.id },
      include: { findings: true },
    });
    expect(row).not.toBeNull();
    expect(row!.risk).toBe('malicious');
    expect(row!.findings).toHaveLength(1);
    expect(row!.description).toBe('does bad things');
  });

  it('verdict GET /:id afterwards returns the same verdict (not pending)', async () => {
    const slug = `${PREFIX}get-after`;
    vi.mocked(auditSkill).mockResolvedValue({
      slug,
      name: slug,
      risk: 'suspicious',
      findings: [],
    });

    const res = await streamPost({
      source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content: '# x\n' }] },
    });

    const frames = parseSSE(await res.text());
    const verdict = JSON.parse(frames.find((f) => f.event === 'verdict')!.data ?? 'null');

    const getRes = await app.request(`/api/skills/${verdict.id}`);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.risk).toBe('suspicious');
  });
});

// ─── 2. Invalid body → 400 JSON, no stream, no row ──────────────────────────

describe('POST /api/skills/import/stream — invalid body', () => {
  it('400 JSON error on empty body {}', async () => {
    const res = await streamPost({});
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).not.toContain('text/event-stream');
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(auditSkill).not.toHaveBeenCalled();
  });

  it('400 JSON error on inline source missing files', async () => {
    const res = await streamPost({ source: { type: 'inline', name: `${PREFIX}no-files` } });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).not.toContain('text/event-stream');
    expect((await res.json()).error).toBeDefined();
    expect(auditSkill).not.toHaveBeenCalled();
  });

  it('400 JSON error on inline source missing name', async () => {
    const res = await streamPost({
      source: { type: 'inline', files: [{ path: 'SKILL.md', content: '# x\n' }] },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
    expect(auditSkill).not.toHaveBeenCalled();
  });

  it('400 JSON error on inline source with malformed files array', async () => {
    const res = await streamPost({
      source: { type: 'inline', name: `${PREFIX}malformed`, files: [{ path: 'a' }] },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it('400 JSON error when github source is missing url', async () => {
    const res = await streamPost({ source: { type: 'github' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  it('no row is created on invalid body', async () => {
    const before = await prisma.skill.count({ where: { slug: { startsWith: PREFIX } } });
    await streamPost({});
    const after = await prisma.skill.count({ where: { slug: { startsWith: PREFIX } } });
    expect(after).toBe(before);
  });
});

// ─── 3. Audit failure → error event, fail closed, row stays pending ─────────

describe('POST /api/skills/import/stream — audit failure (fail closed)', () => {
  it('emits error event, no verdict event, when auditSkill throws', async () => {
    const slug = `${PREFIX}fail-closed`;
    vi.mocked(auditSkill).mockRejectedValue(new Error('model timeout'));

    const res = await streamPost({
      source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content: '# x\n' }] },
    });

    expect(res.status).toBe(200); // stream opened
    const frames = parseSSE(await res.text());

    const errors = frames.filter((f) => f.event === 'error');
    const verdicts = frames.filter((f) => f.event === 'verdict');

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(verdicts.length).toBe(0);
  });

  it('error event data is { error: "audit failed" } (no internals leaked)', async () => {
    const slug = `${PREFIX}fail-msg`;
    vi.mocked(auditSkill).mockRejectedValue(new Error('secret internal detail'));

    const res = await streamPost({
      source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content: '# x\n' }] },
    });

    const frames = parseSSE(await res.text());
    const errorFrame = frames.find((f) => f.event === 'error');
    expect(errorFrame).toBeDefined();

    const data = JSON.parse(errorFrame!.data ?? 'null');
    expect(data.error).toBe('audit failed');
    // Internals must NOT leak.
    expect(errorFrame!.data).not.toContain('secret internal detail');
  });

  it('row remains non-safe (pending) after audit failure', async () => {
    const slug = `${PREFIX}pending-after-fail`;
    vi.mocked(auditSkill).mockRejectedValue(new Error('boom'));

    const res = await streamPost({
      source: { type: 'inline', name: slug, files: [{ path: 'SKILL.md', content: '# x\n' }] },
    });

    // Drain the stream so the DB write has completed.
    await res.text();

    const row = await prisma.skill.findFirst({ where: { slug } });
    expect(row).not.toBeNull();
    expect(row!.risk).toBe('pending'); // still pending — fail closed
  });
});

// ─── 4. GitHub source path ───────────────────────────────────────────────────

describe('POST /api/skills/import/stream — github source', () => {
  it('fetches via fetchSkillFromGitHub, streams verdict, persists row', async () => {
    const slug = `${PREFIX}gh-stream`;
    const raw: RawSkill = {
      slug,
      name: 'GH Stream Skill',
      source: 'github',
      sourceRef: 'o/r',
      files: [{ path: 'SKILL.md', content: '# GH\n' }],
    };
    vi.mocked(fetchSkillsFromGitHub).mockResolvedValue([raw]);
    vi.mocked(auditSkill).mockResolvedValue({
      slug,
      name: 'GH Stream Skill',
      risk: 'safe',
      findings: [],
    });

    const res = await streamPost({ source: { type: 'github', url: 'https://github.com/o/r' } });
    expect(res.status).toBe(200);

    const frames = parseSSE(await res.text());
    const verdict = JSON.parse(frames.find((f) => f.event === 'verdict')!.data ?? 'null');

    expect(verdict.risk).toBe('safe');
    expect(typeof verdict.id).toBe('string');
    expect(verdict.index).toBe(0);
    expect(fetchSkillsFromGitHub).toHaveBeenCalledWith('https://github.com/o/r');
  });

  it('maps a GitHubError to its status as JSON (before stream opens)', async () => {
    const { GitHubError } = await import('../lib/github');
    vi.mocked(fetchSkillsFromGitHub).mockRejectedValue(new GitHubError('not found', 404));

    const res = await streamPost({ source: { type: 'github', url: 'https://github.com/o/missing' } });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toContain('text/event-stream');
    expect((await res.json()).error).toBe('not found');
  });

  it('a multi-skill repo emits one discovered + one verdict per skill, each persisted', async () => {
    const raws: RawSkill[] = [0, 1, 2].map((i) => ({
      slug: `${PREFIX}multi-${i}`,
      name: `multi-${i}`,
      source: 'github',
      sourceRef: `o/r/multi-${i}`,
      files: [{ path: 'SKILL.md', content: `# multi ${i}\n` }],
    }));
    vi.mocked(fetchSkillsFromGitHub).mockResolvedValue(raws);
    // Make skill #1 quarantined, the others safe — verifies per-skill verdicts.
    vi.mocked(auditSkill).mockImplementation(async (raw) => ({
      slug: raw.slug,
      name: raw.name,
      risk: raw.slug.endsWith('1') ? 'malicious' : 'safe',
      findings: [],
    }));

    const res = await streamPost({ source: { type: 'github', url: 'https://github.com/o/r' } });
    expect(res.status).toBe(200);

    const frames = parseSSE(await res.text());
    const discovered = JSON.parse(frames.find((f) => f.event === 'discovered')!.data ?? 'null');
    expect(discovered.total).toBe(3);
    expect(discovered.skills.map((s: { index: number }) => s.index)).toEqual([0, 1, 2]);

    const verdicts = frames
      .filter((f) => f.event === 'verdict')
      .map((f) => JSON.parse(f.data ?? 'null'));
    expect(verdicts).toHaveLength(3);
    expect(verdicts.map((v) => v.index).sort()).toEqual([0, 1, 2]);
    expect(verdicts.find((v) => v.index === 1).risk).toBe('malicious');
    expect(verdicts.filter((v) => v.risk === 'safe')).toHaveLength(2);

    // Each skill persisted as its own row with the host verdict.
    for (const v of verdicts) {
      const row = await prisma.skill.findUnique({ where: { id: v.id } });
      expect(row).not.toBeNull();
      expect(row!.risk).toBe(v.risk);
    }
  });

  it('one skill failing audit does not abort the others (per-skill fail-closed)', async () => {
    const raws: RawSkill[] = [0, 1].map((i) => ({
      slug: `${PREFIX}partial-${i}`,
      name: `partial-${i}`,
      source: 'github',
      sourceRef: `o/r/partial-${i}`,
      files: [{ path: 'SKILL.md', content: `# p ${i}\n` }],
    }));
    vi.mocked(fetchSkillsFromGitHub).mockResolvedValue(raws);
    vi.mocked(auditSkill).mockImplementation(async (raw) => {
      if (raw.slug.endsWith('0')) throw new Error('model timeout');
      return { slug: raw.slug, name: raw.name, risk: 'safe', findings: [] };
    });

    const res = await streamPost({ source: { type: 'github', url: 'https://github.com/o/r' } });
    const frames = parseSSE(await res.text());

    const errors = frames.filter((f) => f.event === 'error').map((f) => JSON.parse(f.data ?? 'null'));
    const verdicts = frames.filter((f) => f.event === 'verdict').map((f) => JSON.parse(f.data ?? 'null'));
    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(0);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].index).toBe(1);
    expect(verdicts[0].risk).toBe('safe');

    // The failed skill's row stays pending (fail closed); never safe.
    const failed = await prisma.skill.findFirst({ where: { slug: `${PREFIX}partial-0` } });
    expect(failed!.risk).toBe('pending');
  });
});
