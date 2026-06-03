import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Mock the Supabase token verifier so tests don't hit the network. The route
// logic (upsert user, ensure workspace, rename) runs against the real DB.
vi.mock('../lib/supabase-auth', () => ({ getSupabaseUser: vi.fn() }));

import { getSupabaseUser } from '../lib/supabase-auth';
import app from '../app';
import { prisma } from '../db';

const UID = 'authtest-uid-0001';
const EMAIL = 'authtest@example.com';
const verify = vi.mocked(getSupabaseUser);

async function cleanup() {
  // Cascade removes the owned workspace.
  await prisma.user.deleteMany({ where: { id: UID } });
}

beforeAll(cleanup);
afterAll(cleanup);

function authed(path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { Authorization: 'Bearer good-token', ...(init.headers ?? {}) },
  });
}
const json = (body: unknown) => ({
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('GET /api/me', () => {
  it('401s without a bearer token', async () => {
    verify.mockResolvedValue(null);
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
  });

  it('creates the user + a default workspace and returns both', async () => {
    verify.mockResolvedValue({ id: UID, email: EMAIL });
    const res = await authed('/api/me');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { id: string; email: string };
      workspace: { id: string; name: string; slug: string };
    };
    expect(body.user).toEqual({ id: UID, email: EMAIL });
    expect(body.workspace.id).toBeTruthy();
    expect(body.workspace.name).toBeTruthy();
    expect(body.workspace.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('is idempotent — same workspace on repeat calls', async () => {
    verify.mockResolvedValue({ id: UID, email: EMAIL });
    const a = (await (await authed('/api/me')).json()) as { workspace: { id: string } };
    const b = (await (await authed('/api/me')).json()) as { workspace: { id: string } };
    expect(b.workspace.id).toBe(a.workspace.id);
  });
});

describe('PATCH /api/workspace', () => {
  it('401s without a bearer token', async () => {
    verify.mockResolvedValue(null);
    const res = await app.request('/api/workspace', json({ name: 'x' }));
    expect(res.status).toBe(401);
  });

  it('renames the workspace', async () => {
    verify.mockResolvedValue({ id: UID, email: EMAIL });
    const res = await authed('/api/workspace', json({ name: 'Acme Security' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe('Acme Security');
  });

  it('updates a valid slug', async () => {
    verify.mockResolvedValue({ id: UID, email: EMAIL });
    const res = await authed('/api/workspace', json({ slug: 'acme-sec-authtest' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe('acme-sec-authtest');
  });

  it('rejects an invalid slug', async () => {
    verify.mockResolvedValue({ id: UID, email: EMAIL });
    const res = await authed('/api/workspace', json({ slug: 'Bad Slug!' }));
    expect(res.status).toBe(400);
  });

  it('rejects an empty name', async () => {
    verify.mockResolvedValue({ id: UID, email: EMAIL });
    const res = await authed('/api/workspace', json({ name: '   ' }));
    expect(res.status).toBe(400);
  });
});
