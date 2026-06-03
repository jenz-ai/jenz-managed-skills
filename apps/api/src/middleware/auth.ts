import type { MiddlewareHandler } from 'hono';
import { getSupabaseUser, type AuthUser } from '../lib/supabase-auth';

/** Hono env for authed routes — `c.get('user')` is the verified Supabase user. */
export type AuthEnv = { Variables: { user: AuthUser } };

/**
 * Require a valid Supabase bearer token. On success attaches the user to the
 * context; otherwise responds 401. Fail-closed: any missing/invalid/unverifiable
 * token is rejected.
 */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const user = token ? await getSupabaseUser(token) : null;
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};
