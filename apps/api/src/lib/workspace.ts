import { prisma } from '../db';
import type { AuthUser } from './supabase-auth';

/** lowercase, runs of non-alphanumerics → '-', trim leading/trailing '-'. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A friendly default workspace name from an email, used until the user names one. */
export function defaultWorkspaceName(email: string): string {
  const local = email.split('@')[0] || 'My';
  return `${local.charAt(0).toUpperCase()}${local.slice(1)}'s workspace`;
}

/** Find a free slug, appending -2, -3… if `base` is taken (keeping `exceptId`'s own). */
export async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base) || 'workspace';
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const existing = await prisma.workspace.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === exceptId) return candidate;
  }
}

/**
 * Upsert the user and ensure they own exactly one workspace (created with a
 * derived default name/slug on first call). Shared by /api/me and /api/workspace.
 */
export async function ensureUserWorkspace(u: AuthUser) {
  const user = await prisma.user.upsert({
    where: { id: u.id },
    create: { id: u.id, email: u.email },
    update: { email: u.email },
  });
  const existing = await prisma.workspace.findUnique({ where: { ownerId: user.id } });
  if (existing) return { user, workspace: existing };
  const name = defaultWorkspaceName(user.email);
  const workspace = await prisma.workspace.create({
    data: { name, slug: await uniqueSlug(name), ownerId: user.id },
  });
  return { user, workspace };
}
