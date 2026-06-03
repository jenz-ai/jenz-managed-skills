import { Hono } from 'hono';
import { prisma } from '../db';
import { requireAuth, type AuthEnv } from '../middleware/auth';
import { ensureUserWorkspace } from '../lib/workspace';

/**
 * Workspace routes (auth-gated, dashboard only).
 * - GET   /api/workspace        the caller's workspace.
 * - PATCH /api/workspace        rename (and optionally re-slug) it.
 */
const workspace = new Hono<AuthEnv>();
workspace.use('*', requireAuth);

workspace.get('/', async (c) => {
  const { workspace: ws } = await ensureUserWorkspace(c.get('user'));
  return c.json({ id: ws.id, name: ws.name, slug: ws.slug });
});

workspace.patch('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const { workspace: ws } = await ensureUserWorkspace(c.get('user'));
  const data: { name?: string; slug?: string } = {};

  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim()) {
      return c.json({ error: 'name must be a non-empty string' }, 400);
    }
    data.name = b.name.trim();
  }

  if (b.slug !== undefined) {
    if (typeof b.slug !== 'string' || !/^[a-z0-9-]+$/.test(b.slug)) {
      return c.json({ error: 'slug must match ^[a-z0-9-]+$' }, 400);
    }
    const taken = await prisma.workspace.findUnique({ where: { slug: b.slug } });
    if (taken && taken.id !== ws.id) return c.json({ error: 'slug already taken' }, 409);
    data.slug = b.slug;
  }

  if (Object.keys(data).length === 0) return c.json({ error: 'nothing to update' }, 400);

  const updated = await prisma.workspace.update({ where: { id: ws.id }, data });
  return c.json({ id: updated.id, name: updated.name, slug: updated.slug });
});

export default workspace;
