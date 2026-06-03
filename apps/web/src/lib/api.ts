// API client for the jenz audit API.
// Base URL from VITE_API_BASE env var, fallback to production endpoint.
import type { AuditedSkill, SkillFile, SkillSource, Taxonomy } from "@jenz/shared";

// ---- base URL ---------------------------------------------------------------

export const API_BASE: string =
  (typeof import.meta !== "undefined" &&
    typeof (import.meta as { env?: Record<string, string> }).env !== "undefined"
    ? (import.meta as { env?: Record<string, string> }).env?.["VITE_API_BASE"]
    : undefined) ?? "https://api.jenz.ai/api";

// ---- auth -------------------------------------------------------------------

// The dashboard's Supabase access token, set by AuthProvider on sign-in/out.
// Sent as `Authorization: Bearer` so the API scopes the library + imports to the
// signed-in user's workspace (a user sees only their own uploads). Unset = the
// open agent/MCP pool. Module-level so callers don't have to thread it through.
let authToken: string | null = null;

/** Set (or clear, with null) the bearer token used for workspace-scoped calls. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Authorization header when signed in, else empty. */
function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

// ---- shared types ----------------------------------------------------------

/** Summary shape returned by GET /skills. */
export interface ListItem {
  id: string;
  name: string;
  risk: "pending" | "safe" | "suspicious" | "malicious";
  category: string;
  description: string;
  findingsCount: number;
}

/** Source variants for POST /skills/import/stream. */
type ImportSource =
  | { type: "inline"; name: string; files: SkillFile[] }
  | { type: "github"; url: string }
  | { type: Exclude<SkillSource, "inline" | "github"> };

// ---- GateError --------------------------------------------------------------

/**
 * Thrown by `getSkillFiles` when the gate returns 403.
 * Carries the risk verdict and reason from the API body so callers can
 * display a meaningful message without re-fetching.
 */
export class GateError extends Error {
  risk: string;
  reason: string;

  constructor(risk: string, reason: string) {
    super(`Gate blocked: ${risk} — ${reason}`);
    this.name = "GateError";
    this.risk = risk;
    this.reason = reason;
  }
}

// ---- helpers ----------------------------------------------------------------

function buildUrl(path: string, params?: Record<string, string | undefined>): string {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
}

// ---- SSE frame parser -------------------------------------------------------

export interface SseFrame {
  event: string;
  data: unknown;
}

/**
 * Parses SSE frames from a raw text buffer.
 *
 * Frames are separated by `\n\n`. Each frame has `event:` and `data:` lines.
 * Frames with unparseable JSON data are silently dropped (fail-safe: caller
 * won't crash on a malformed server message).
 *
 * Factored out as a pure function for unit testing without a network.
 */
export function parseSseFrames(raw: string): SseFrame[] {
  const frames: SseFrame[] = [];
  // Only process frame blocks that are properly terminated by \n\n.
  // Split on \n\n and discard the final segment — it's either empty (clean
  // termination) or an incomplete/partial frame that should stay in the buffer.
  const rawFrames = raw.split("\n\n");
  rawFrames.pop(); // always discard the last segment (incomplete or trailing empty)
  for (const rawFrame of rawFrames) {
    const trimmed = rawFrame.trim();
    if (!trimmed) continue;

    let event = "";
    let dataStr = "";
    for (const line of trimmed.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataStr = line.slice("data:".length).trim();
      }
    }

    if (!event || !dataStr) continue;

    let data: unknown;
    try {
      data = JSON.parse(dataStr);
    } catch {
      continue; // skip unparseable frames
    }

    frames.push({ event, data });
  }
  return frames;
}

// ---- API functions ----------------------------------------------------------

/**
 * GET /skills?category=&risk=&query=
 * Returns the `.skills` array. Throws on non-2xx.
 */
export async function listSkills(params?: {
  category?: string;
  risk?: string;
  query?: string;
}): Promise<ListItem[]> {
  const url = buildUrl("/skills", {
    category: params?.category,
    risk: params?.risk,
    query: params?.query,
  });
  const res = await fetch(url, { headers: authHeaders() });
  await throwIfNotOk(res);
  const body = (await res.json()) as { skills: ListItem[] };
  return body.skills;
}

/**
 * GET /skills/:id
 * Returns the full AuditedSkill with id. Throws on non-2xx (including 404).
 */
export async function getSkill(id: string): Promise<AuditedSkill & { id: string }> {
  const res = await fetch(buildUrl(`/skills/${encodeURIComponent(id)}`));
  await throwIfNotOk(res);
  return (await res.json()) as AuditedSkill & { id: string };
}

/**
 * GET /skills/:id/files
 * - 200 → returns `.files` array (SkillFile[])
 * - 403 → throws `GateError` with `risk` and `reason` from the body
 * - other non-2xx → throws plain Error
 *
 * The gate only returns files for skills whose audit concluded `risk === 'safe'`.
 */
export async function getSkillFiles(id: string): Promise<SkillFile[]> {
  const res = await fetch(buildUrl(`/skills/${encodeURIComponent(id)}/files`));

  if (res.status === 403) {
    const body = (await res.json()) as { error: string; risk: string; reason: string };
    throw new GateError(body.risk, body.reason);
  }

  await throwIfNotOk(res);
  const body = (await res.json()) as { files: SkillFile[] };
  return body.files;
}

/**
 * POST /skills/import/stream
 *
 * Opens an SSE stream via fetch (EventSource can't POST).
 * Reads `response.body` with a ReadableStream reader + TextDecoder, parsing
 * SSE frames and dispatching to the appropriate handler:
 *   - `event: progress` → `onProgress(data.message)`
 *   - `event: verdict`  → `onVerdict(data)`
 *   - `event: error`    → `onError(data.error)`
 *
 * Resolves when the stream closes normally.
 * On non-2xx initial response: calls `onError` with the body's error field.
 */
export async function streamImport(
  source: ImportSource,
  handlers: {
    onProgress: (msg: string) => void;
    onVerdict: (v: AuditedSkill & { id: string; taxonomy?: Record<string, Taxonomy> }) => void;
    onError: (err: string) => void;
  },
): Promise<void> {
  const res = await fetch(buildUrl("/skills/import/stream"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      ...authHeaders(),
    },
    body: JSON.stringify({ source }),
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) errMsg = body.error;
    } catch {
      // ignore
    }
    handlers.onError(errMsg);
    return;
  }

  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // Buffer accumulates incomplete frames across chunks
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Process all complete frames (terminated by \n\n) in the buffer
    const lastSep = buf.lastIndexOf("\n\n");
    if (lastSep === -1) continue;

    const complete = buf.slice(0, lastSep + 2);
    buf = buf.slice(lastSep + 2);

    const frames = parseSseFrames(complete);
    for (const frame of frames) {
      if (frame.event === "progress") {
        handlers.onProgress((frame.data as { message: string }).message);
      } else if (frame.event === "verdict") {
        handlers.onVerdict(
          frame.data as AuditedSkill & { id: string; taxonomy?: Record<string, Taxonomy> },
        );
      } else if (frame.event === "error") {
        handlers.onError((frame.data as { error: string }).error);
      }
    }
  }
}
