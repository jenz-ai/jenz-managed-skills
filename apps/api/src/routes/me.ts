import { Hono } from 'hono';
import { requireAuth, type AuthEnv } from '../middleware/auth';
import { ensureUserWorkspace } from '../lib/workspace';

/**
 * GET /api/me — the signed-in user + their workspace.
 *
 * Auth-gated (dashboard only). Upserts the user from the Supabase token and
 * creates their default workspace on first call, so the dashboard always has a
 * workspace to render. The agent-facing API is unaffected by this route.
 */
const me = new Hono<AuthEnv>();
me.use('*', requireAuth);

me.get('/', async (c) => {
  const { user, workspace } = await ensureUserWorkspace(c.get('user'));
  return c.json({
    user: { id: user.id, email: user.email },
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
  });
});

export default me;
