/**
 * Supabase Auth token verification for the DASHBOARD API.
 *
 * The dashboard signs users in with Supabase Auth (client-side) and sends the
 * resulting JWT as `Authorization: Bearer <jwt>`. We verify it by asking
 * Supabase who the token belongs to (`GET /auth/v1/user`) — this needs only the
 * public anon key + project URL, no JWT secret.
 *
 * IMPORTANT: this guards ONLY the dashboard routes (/api/me, /api/workspace).
 * The agent-facing gate/audit/import/list API stays OPEN by design — the MCP
 * and the live demo call it with no token.
 *
 * Env (read at call time so dev picks up .env without a rebuild):
 *   SUPABASE_URL        e.g. https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY   the public anon/publishable key
 */
export interface AuthUser {
  id: string;
  email: string;
}

export async function getSupabaseUser(token: string): Promise<AuthUser | null> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; email?: string };
    if (!data.id || !data.email) return null;
    return { id: data.id, email: data.email };
  } catch {
    // Network/parse failure → fail closed (treat as unauthenticated).
    return null;
  }
}
