import { describe, it, expect } from 'vitest';
import app from './audit';

const post = (body: unknown) =>
  app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const sampleSkill = {
  slug: 'hello',
  name: 'Hello',
  source: 'upload',
  files: [{ path: 'SKILL.md', content: '# Hello\nJust says hi.\n' }],
};

describe('POST /audit', () => {
  it('returns an AuditedSkill (risk + findings) for a valid skill', async () => {
    const res = await post({ raw: sampleSkill });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('risk');
    expect(body).toHaveProperty('findings');
    expect(Array.isArray(body.findings)).toBe(true);
  });

  it('also accepts a bare RawSkill (no { raw } wrapper)', async () => {
    const res = await post(sampleSkill);
    expect(res.status).toBe(200);
  });

  it('400 on a body that is not a RawSkill', async () => {
    const res = await post({ nope: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('error');
  });

  it('400 when files entries are malformed', async () => {
    const res = await post({ raw: { slug: 'x', name: 'X', files: [{ path: 'a' }] } });
    expect(res.status).toBe(400);
  });
});
