// Dashboard auth API calls (bearer-authenticated). Reuses the shared API_BASE
// from lib/api.ts so the auth + audit clients always hit the same backend.
import { API_BASE } from "../lib/api";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
}
export interface Me {
  user: { id: string; email: string };
  workspace: Workspace;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // ignore
  }
  return fallback;
}

/** GET /api/me — the signed-in user + their workspace (created on first call). */
export async function fetchMe(token: string): Promise<Me> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await errorMessage(res, `me failed: HTTP ${res.status}`));
  return (await res.json()) as Me;
}

/** PATCH /api/workspace — rename (and optionally re-slug) the caller's workspace. */
export async function patchWorkspace(
  token: string,
  body: { name?: string; slug?: string },
): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/workspace`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `workspace update failed: HTTP ${res.status}`));
  return (await res.json()) as Workspace;
}
