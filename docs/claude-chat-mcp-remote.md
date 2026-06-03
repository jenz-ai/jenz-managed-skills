# Claude Chat (Remote) MCP Connector — Implementation Spec & Analysis

> **Status:** P2 spike — **analysis + documentation**. **Additive only**; does not touch the
> demo-critical app/API. Synthesized by the `claude-chat-mcp` agent team (6 parallel
> research facets) + lead verification against the code. Every external claim is cited;
> code claims are `file:line`.
>
> **Goal:** expose the existing `@jenz-ai/skills-mcp` (today: stdio, for Claude Code) **also**
> as a **Claude Chat / claude.ai custom connector** = a remote MCP server over **public HTTPS
> using Streamable HTTP**. (stdio/localhost cannot be a claude.ai connector.)

---

## TL;DR — decisions

1. **Code = an entrypoint swap, not a rewrite.** Extract a `createServer()` factory; add `src/http.ts` (stateless Streamable HTTP). **2 new files, `index.ts` trimmed, ~4 `package.json` lines. Zero changes to `api`/`schemas`/`tools`/`mock`/`tests`** — the stdio demo + both vitest suites are provably untouched.
2. **Host = a 2nd Railway service** in the same project → `mcp.jenz.ai` (~1–1.5 h, reuses our proven stack). Cloudflare Workers (`McpAgent` + built-in OAuth) is the **post-MVP** path (~4–6 h, new runtime).
3. **Demo auth = authless connector** (claude.ai supports it) — BUT our origin is wide open with an **uncapped inline-import path**, so add **body cap + per-IP rate limit + daily spend ceiling** (and optionally a path-secret URL) before any public exposure. The **gate** (`pull_skill` returns files only when `safe`) is the security boundary either way.
4. **Production auth = OAuth (DCR/CIMD)** reusing **Supabase** as the IdP → **per-user workspaces** (requires making workspace isolation real — it is *cosmetic* today).
5. **Two hard claude.ai limits:** **~150,000-char** tool-result cap (engineer `pull_skill`) + **300 s** timeout (audit ~50 s = ~6× headroom; fine).

**What NOT to do:** don't touch `apps/api` demo-critical code for this; don't promote `hono` into the published MCP package; don't add an `outputSchema` to `pull_skill` (the two-shape gate depends on its absence); don't ship SSE-only.

---

## 0. The change, bottom-to-top

```
end user (Claude chat)
  └─ claude.ai custom connector  ── public HTTPS, Streamable HTTP, (authless | OAuth)
       └─ mcp.jenz.ai  (NEW Railway service)
            └─ src/http.ts  (NEW) — StreamableHTTPServerTransport, stateless
                 └─ createServer()  (NEW factory) — the SAME McpServer + 4 tools
                      └─ src/api.ts (UNCHANGED) — env-driven fetch → JENZ_API
                           └─ https://api.jenz.ai/api  (UNCHANGED, demo-critical)
                                └─ the gate: GET /api/skills/:id/files → 200{files} iff safe else 403
```
The only genuinely new code is the **transport binding** (`http.ts`) and the **factory split** (`server.ts`). Everything below the factory is reused byte-for-byte.

---

## 1. Code conversion

### 1a. `src/server.ts` (NEW) — the transport-agnostic factory
Move the `new McpServer(...)` + the 4 `registerTool` calls + the helpers (`msg`/`toolError`/`verdictText`) out of `index.ts` into a `createServer()` factory, **copied verbatim** (the gate strings + `as unknown as Record<string, unknown>` casts must stay identical). Source today: `index.ts:11-91`.

```ts
// apps/mcp/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuditedSkill } from '@jenz/shared';        // dev-only import type → erased at compile
import { sourceSchema, auditedShape, listShape } from './schemas.js';
import { submitSkill } from './tools/submit.js';
import { getSkill } from './tools/get.js';
import { listManagedSkills } from './tools/list.js';
import { pullSkill } from './tools/pull.js';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toolError = (e: unknown) => ({
  content: [{ type: 'text' as const, text: `jenz audit service error: ${msg(e)}` }],
  isError: true,
});
const verdictText = (v: AuditedSkill) =>
  `${v.name}: ${v.risk.toUpperCase()}` +
  (v.findings.length
    ? ` — ${v.findings.length} finding(s); e.g. ${v.findings[0].type} @ ${v.findings[0].file}:${v.findings[0].line}`
    : ' — no findings');

/** Build a fully-configured jenz-skills MCP server (all 4 tools). Transport-agnostic. */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'jenz-skills', version: '0.1.0' });

  server.registerTool('submit_skill', {
    title: 'Submit a skill for audit',
    description:
      'Import a skill (github url or inline files) and run the open-weight security audit. ' +
      'Returns the verdict (risk + findings). Never returns files — use pull_skill for that.',
    inputSchema: { source: sourceSchema },
    outputSchema: auditedShape,
  }, async ({ source }) => {
    try {
      const v = await submitSkill(source);
      return { content: [{ type: 'text', text: verdictText(v) }], structuredContent: v as unknown as Record<string, unknown> };
    } catch (e) { return toolError(e); }
  });

  server.registerTool('get_skill', {
    title: 'Get a skill verdict',
    description:
      "Fetch a skill's stored audit verdict + findings by id. Use when you have an id from a " +
      'previous session and need to re-check its verdict. Does not return files.',
    inputSchema: { id: z.string() },
    outputSchema: auditedShape,
  }, async ({ id }) => {
    try {
      const v = await getSkill(id);
      return { content: [{ type: 'text', text: verdictText(v) }], structuredContent: v as unknown as Record<string, unknown> };
    } catch (e) { return toolError(e); }
  });

  server.registerTool('list_managed_skills', {
    title: 'List managed skills',
    description: 'Browse/search the workspace skill library. Optional filters: category, risk, query.',
    inputSchema: {
      category: z.string().optional(),
      risk: z.enum(['pending', 'safe', 'suspicious', 'malicious']).optional(),
      query: z.string().optional(),
    },
    outputSchema: listShape,
  }, async (filter) => {
    try {
      const { skills, available } = await listManagedSkills(filter);
      const text = !available
        ? 'Skill listing is not available on this backend yet (the list endpoint is not implemented). ' +
          'Use submit_skill / get_skill / pull_skill by id instead.'
        : skills.length
          ? skills.map((s) => `• ${s.name} [${s.risk}] (${s.category})`).join('\n')
          : 'no skills found';
      return { content: [{ type: 'text', text }], structuredContent: { skills } as unknown as Record<string, unknown> };
    } catch (e) { return toolError(e); }
  });

  // THE GATE. No outputSchema (two shapes); guarantee enforced in pullSkill() + tests.
  server.registerTool('pull_skill', {
    title: "Pull a vetted skill's files",
    description:
      "Retrieve a skill's files to install locally. Returns files ONLY if the skill passed " +
      'the audit (risk=safe). Otherwise returns { ok:false } with no files — this is the gate, not an error.',
    inputSchema: { id: z.string() },
  }, async ({ id }) => {
    try {
      const res = await pullSkill(id);
      const text = res.ok
        ? `SAFE — ${res.files.length} file(s) returned. ${res.hint}`
        : `BLOCKED — risk=${res.risk}. ${res.reason}. No files returned.`;
      return { content: [{ type: 'text', text }], structuredContent: res as unknown as Record<string, unknown> };
    } catch (e) { return toolError(e); }
  });

  return server;
}
```

`index.ts` shrinks to the stdio bind (behaviour identical — same name/version/log, npx path unchanged):
```ts
// apps/mcp/src/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('[jenz-mcp] jenz-skills MCP server running on stdio');
}
main().catch((e) => { console.error('[jenz-mcp] fatal:', e); process.exit(1); });
```

### 1b. `src/http.ts` (NEW) — Streamable HTTP, stateless, final
Reconciled from `code-blueprint` + `sdk-transport`: Node `http`, **stateless** (fresh server+transport per POST), **`enableJsonResponse: true`** (plain JSON round-trips → no SSE plumbing/buffering on Railway), **CORS + OPTIONS** (claude.ai is browser-originated — the SDK does **not** add CORS), **bind `0.0.0.0:$PORT`** (Railway), and a **2 MB body guard** (the uncapped-inline-import abuse vector — see §6).

```ts
// apps/mcp/src/http.ts
import { createServer as createNodeServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const PORT = Number(process.env.PORT) || 8080;
const MCP_PATH = '/mcp';
const MAX_BODY = 2_000_000; // 2 MB — bound the uncapped inline-import payload (abuse guard)

// claude.ai connects from Anthropic's cloud (browser-originated) → CORS is on us.
function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', process.env.MCP_ALLOW_ORIGIN ?? '*'); // tighten in prod
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > MAX_BODY) reject(new Error('payload too large')); });
    req.on('end', () => { if (!raw) return resolve(undefined); try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid JSON body')); } });
    req.on('error', reject);
  });
}
async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Stateless: a fresh McpServer + transport per request; torn down on response close.
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    const body = await readJson(req);          // MUST pass the parsed body as the 3rd arg
    await transport.handleRequest(req, res, body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!res.headersSent) sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message }, id: null });
    else res.end();
  }
}
const httpServer = createNodeServer((req, res) => {
  cors(res);
  const url = req.url ?? '/';
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }              // CORS preflight
  if (req.method === 'GET' && url === '/healthz') return sendJson(res, 200, { ok: true });
  if (url === MCP_PATH || url.startsWith(MCP_PATH + '?')) {
    if (req.method === 'POST') { void handleMcp(req, res); return; }
    // Stateless: no GET-SSE / DELETE-session → 405 (spec-compliant, not a bug).
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));
    return;
  }
  sendJson(res, 404, { error: 'not_found' });
});
httpServer.listen(PORT, '0.0.0.0', () => {
  console.error(`[jenz-mcp] jenz-skills MCP (streamable http) on :${PORT}${MCP_PATH}`);
});
```

### 1c. `package.json` / `tsconfig` deltas
```jsonc
// package.json — no new deps (node:http built-in; SDK+zod already present)
"scripts": {
  "dev:http":   "tsx watch src/http.ts",
  "start:http": "tsx src/http.ts"          // tsx-on-source: safest for Railway (see §3)
}
```
- **`tsconfig.json`: no change** — `rootDir:"src"` + `include:["src/**/*.ts"]` already compile `http.ts`/`server.ts`.
- **`scripts/add-shebang.mjs`: no change** — only the stdio bin needs a shebang; the http entry runs via `tsx`/`node`.

### 1d. File disposition
| File | Disposition |
|---|---|
| `src/server.ts` | **NEW** — factory (verbatim move of helpers + 4 tools) |
| `src/http.ts` | **NEW** — Streamable-HTTP entrypoint (above) |
| `src/index.ts` | **minor** — shrinks to stdio bind via `createServer()` |
| `src/{api,schemas}.ts`, `src/tools/*`, `mock/*`, `tests/*`, `scripts/smoke.ts` | **reuse-verbatim** |
| `package.json` | **minor** — +2 scripts |
| `tsconfig*.json`, `scripts/add-shebang.mjs` | **unchanged** |

**Gotchas (ESM):** keep `.js` suffixes on every relative import + the SDK subpath (`'@modelcontextprotocol/sdk/server/streamableHttp.js'`); `@jenz/shared` stays an `import type` (dev-only, erased — never shipped); `JENZ_API` **defaults to the local mock** (`api.ts:4`), so the hosted service **must** set `JENZ_API=https://api.jenz.ai/api`.

> **⚠️ Inherited contract drift (fix before the wrapper works) — flagged live by codex-audit.** The API now returns a **`taxonomy`** field on `GET /api/skills/:id`, but the MCP's `auditedShape` (`schemas.ts:26-34`) doesn't declare it, so the SDK's **strict `outputSchema` validation throws** *"Structured content does not have additional properties"* on `get_skill` (against the live API today). `list_managed_skills` + `pull_skill` (the gate) are unaffected. The remote wrapper reuses `schemas.ts` verbatim → it **inherits this bug**. **Fix once, fixes both:** add `taxonomy: z.record(z.any()).optional()` to `auditedShape` (or strip `taxonomy` before `structuredContent` in `tools/get.ts`). This is Remi's `apps/mcp` lane.

---

## 2. The SDK transport (`@modelcontextprotocol/sdk@1.29.0`, pinned)

Verified against the **v1.29.0** tag (SHA `e12cbd7`) + the repo lockfile — **not** `main`/v2 (which renames the class to `NodeStreamableHTTPServerTransport`; ignore any web snippet using that name or `zod/v4`).

- **Import:** `import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'` (the package `exports` use a `./*` wildcard → `dist/esm/*`).
- **Stateless** (`sessionIdGenerator: undefined`): no `Mcp-Session-Id`, no session store, any replica serves any request. Correct for our 4 plain request/response tools (no server→client notifications). Build a fresh `McpServer`+transport per POST; `await server.connect(transport)`; `await transport.handleRequest(req, res, parsedBody)`; tear down on `res.on('close')`.
- **`handleRequest(req, res, parsedBody?)`** — you **must** pass the already-parsed body as the 3rd arg, or `initialize` fails (the stream is already consumed). ✅ our `http.ts` does this.
- **`enableJsonResponse: true`** → the server returns one `application/json` object instead of an SSE stream. Simplest for a connector host (no proxy-buffering/`X-Accel-Buffering` concerns). We use it.
- **GET/DELETE → 405** in stateless mode (spec-compliant; health-checkers hitting `/mcp` with GET will see 405 — expected).
- **CORS is on us.** The SDK's express helper adds only `express.json()` — **no CORS**. A browser-originated claude.ai connector needs: methods `GET/POST/DELETE/OPTIONS`; allow headers `Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Authorization`; **expose `Mcp-Session-Id`**; handle `OPTIONS`. ✅ folded into `http.ts`.
- **Hono note:** in 1.29.0 the transport is a thin Node wrapper over `WebStandardStreamableHTTPServerTransport` (already depends on `@hono/node-server` internally). A Hono handler *could* drive the web-standard transport directly, but Node `http` is the paved path — recommended for the spike.
- Durable summary saved by the team at memory `mcp-streamable-http-1290`.

---

## 3. Hosting

### Option 1 — **2nd Railway service, same project (RECOMMENDED, ~1–1.5 h)**
Grounded in `railway.toml:1-18` (the API service: NIXPACKS; build `pnpm install --frozen-lockfile && pnpm -r typecheck && …`; start runs **`tsx` on source**; `healthcheckPath="/healthz"`). The header comment there even says the MCP is *"a local stdio process (npx), so neither is built or served here"* — so a remote MCP is a **new** service.

Steps:
1. Railway project → **New → GitHub Repo** → same `jenz-managed-skills` repo (creates a 2nd service).
2. **Do NOT set a Root Directory** — shared pnpm monorepo with `workspace:*` deps (`@jenz/shared`); build from repo root + scope with `--filter`.
3. **Build:** `pnpm install --frozen-lockfile && pnpm --filter @jenz-ai/skills-mcp typecheck` (NIXPACKS; `packageManager: pnpm@9.12.0` pins pnpm v9 — important, Railway defaults to v8).
4. **Start:** `pnpm --filter @jenz-ai/skills-mcp start:http` (= `tsx src/http.ts`). **`tsx`-on-source** dodges the ESM `node dist` extension-resolution issue the API already hit (`railway.toml:6-9`); `tsc`+`node dist/http.js` also works *iff* imports keep `.js` suffixes (they do).
5. **Healthcheck** `/healthz`, `ON_FAILURE` restart — copy the API's values.
6. **Watch Paths** `apps/mcp/**` + `packages/shared/**` (so API commits don't rebuild MCP).
7. **Variables:** `JENZ_API=https://api.jenz.ai/api`, `JENZ_WORKSPACE=demo`. **No DB/model/OpenRouter keys** — the MCP is a thin client over our API (simpler deploy than the API).
8. **PORT:** the entry listens on `Number(process.env.PORT)` + binds `0.0.0.0` (Railway injects `$PORT`; hardcoding 8080 fails healthcheck/domain). ✅ our `http.ts`.
9. **Domain `mcp.jenz.ai`:** Service → Networking → Custom Domain → add the **CNAME + TXT** Railway shows (both; CNAME alone won't verify). TLS auto.
10. **Coexistence:** separate service, shared repo/lockfile, independent build/start/domain/env — `api.jenz.ai` untouched (satisfies the "don't touch demo-critical" rule by construction).

⚠️ **Install-state caveat (operational):** the current local `node_modules` is **stale/partial** — `@modelcontextprotocol/sdk` is **not on disk**, the store has `zod@4.4.3` instead of the lockfile-pinned `zod@3.25.76`, and `apps/mcp/dist/index.js` is an 88-byte stub. **Run `pnpm install --frozen-lockfile` before any local MCP build/verify**; the lockfile is correct, the checkout's `node_modules` is not.

### Option 2 — **Cloudflare Workers (`McpAgent` / `workers-oauth-provider`), post-MVP (~4–6 h)**
Purpose-built remote-MCP host with **built-in OAuth** (`workers-oauth-provider` + `remote-mcp-github-oauth` template) — directly solves §6's auth/abuse story. Streamable HTTP is the CF default; SSE deprecated. **Cost:** different runtime — no Node `http`/`fs`; a `fetch` handler model, `wrangler.jsonc`, Durable Objects (if stateful), secrets via `wrangler secret put`. **But our tool logic ports cleanly** (`api.ts`/`schemas.ts`/`tools/*` are already `fetch`-based — only the transport/bootstrap is rewritten). `@jenz/shared` would need bundling (outside the pnpm workspace). Scaffold: `npm create cloudflare@latest -- <name> --template=cloudflare/ai/demos/remote-mcp-authless` (or `…-github-oauth`).

**Recommendation:** Railway now (cheap, isolated, reuses everything); Cloudflare when we want the public multi-tenant OAuth connector.

---

## 4. The claude.ai connector (requirements)

> **Two different "connectors"** share the remote-MCP substrate but differ — don't conflate:
> **(A1) Messages API `mcp_connector`** (`anthropic-beta: mcp-client-2025-11-20`) — programmatic; *you* supply an already-obtained bearer; supports Streamable HTTP **or** SSE.
> **(A2) claude.ai / Desktop custom connector** — the UI connector this spike targets; claude.ai runs the OAuth flow itself.

- **Transport:** **Streamable HTTP** (HTTP+SSE is deprecated). Build Streamable-HTTP only. *(Source: claude.com/docs/connectors/building)*
- **Reachability:** claude.ai connects from **Anthropic's cloud** (even on Desktop/Cowork/mobile) — must be public-internet reachable. Outbound egress range **`160.79.104.0/21`** (allowlist only if firewalled; `api.jenz.ai`/`mcp.jenz.ai` are public → nothing to do). *(platform.claude.com/docs/en/api/ip-addresses)*
- **Add flow (Pro/Max):** Customize/Settings → **Connectors → "+" → Add custom connector** → paste the remote MCP URL (`https://mcp.jenz.ai/mcp`) → (optional Advanced: OAuth Client ID/Secret) → **Add**. **Team/Enterprise:** Owner adds org-wide, members then **Connect**/authenticate individually. **Free** = 1 connector. **Mobile** can *use* but not *add*. *(support.claude.com/en/articles/11175166, 11176164)*
- **Auth modes:** `none` (**authless — supported**), `oauth_dcr`, `oauth_cimd`, `oauth_anthropic_creds`, `custom`. **Not supported: user-pasted bearer tokens / creds in query params** — so there's no "paste an API key" shortcut in the UI; it's authless or real OAuth. *(claude.com/docs/connectors/building/authentication)*
- **Feature support:** tools, prompts, resources, text/image results. **`outputSchema`/structured-content is NOT documented as honored on claude.ai** → rely on human-readable **text** content blocks (we already return them). No documented tool-count/name-length limits (we have 4).
- **Pitch hook:** claude.ai shows a security banner — custom connectors are *"arbitrary services that have not been verified by Anthropic… Malicious MCP servers may include hidden instructions."* **That is literally the threat Jenz audits** — use it in the demo narrative.

---

## 5. The two hard limits → concrete designs

### 5a. ~150,000-character tool-result cap → engineer `pull_skill`
`pull_skill` (the gate) returns **file contents** on `safe` — a big skill can exceed 150k chars; the host would truncate/reject → broken UX. Design (host-side, **after** the safe/blocked decision — never a side channel that leaks blocked bytes):
- **Total budget ≈ 120,000 chars** per `pull_skill` response (headroom under 150k for the JSON/MCP envelope). *(150k is documented; 120k is our chosen margin.)*
- **Per-file truncation with an explicit visible marker** (never silent): `--- [TRUNCATED: SKILL.md is 412,000 chars; showing first 80,000. Fetch full via pull_skill path="SKILL.md"] ---` so the model never reasons over a partial file as if complete.
- **Manifest-first for multi-file skills (preferred):** return the verdict + a manifest `[{path, bytes, sha256}]` + inline the files that fit; oversize files are manifest-only with a fetch-by-path instruction.
- **Optional `path`/`offset` arg** on `pull_skill` (or a sibling) to retrieve a large file in ≤150k slices. The gate still applies (blocked → zero bytes regardless of `path`).
- Suggested constants: `TOTAL_BUDGET=120_000`, `PER_FILE_INLINE_MAX=60_000`, reserve ~5_000 for verdict+manifest. *(tunable; only 150k is the hard ceiling.)*

### 5b. 300-second timeout → `submit_skill` audit
Audit = 2 model passes (~25 s each, bounded by `AUDIT_TIMEOUT_MS`) ≈ ~50 s ⇒ **~6× headroom** under 300 s. If a pass is slow, the host **fails closed** (timeout ⇒ never `safe`). Bound the pipeline internally well under 300 s and return an explicit `risk:'error'/unknown` + "audit did not complete, treat as unsafe" rather than a generic wall-clock abort. **No retries** that could stack two ~50 s audits toward 300 s.

---

## 6. Auth + abuse surface

### 6a. Current reality (cited) — the origin is wide open
- The **agent-facing routes the MCP uses are mounted with no middleware**: `/api/skills*`, `/audit`, `/audit/stream` (`app.ts:26-30`). `requireAuth` (Supabase JWT — `middleware/auth.ts:12-19`, `lib/supabase-auth.ts`) guards **only** `/api/me` + `/api/workspace` (`app.ts:31-33`). Open agent surface is **by design** (`supabase-auth.ts:9-12`).
- **`x-jenz-workspace` is sent but never read** — `routes/skills.ts` filters only by category/risk/query (`skills.ts:41-56`); no row is workspace-scoped. **Workspace isolation is cosmetic today** (one global skill table).
- **No rate limiting anywhere**; **CORS `*`** by default (CORS doesn't constrain non-browser clients anyway).
- **`submit_skill` triggers real paid model work, unauthenticated** (`tools/submit.ts` → `/api/skills/import` → `auditSkill` → 2 OpenRouter passes; `audit.ts:43-49`). **Inline imports are uncapped** — `sourceSchema` files have no `.max()` (`schemas.ts:8-10`), `parseInlineFiles` checks types only (`skills.ts:339-349`), no Hono `bodyLimit`. (GitHub imports *are* bounded: 100 KB/file × 50 — `lib/github.ts`.)
- **Good, keep:** fail-closed audit (`audit.ts:54-58`), the gate re-hashes bytes / TOCTOU defense + `403`-unless-safe (`skills.ts:382-404`), generic error text (no internals leaked).

➡️ **Exposing the MCP publicly as-is = anyone runs unlimited DeepSeek-×2 audits on arbitrarily large inline payloads → unbounded OpenRouter spend + DoS on the single audit path.**

### 6b. Demo posture (Wednesday) — authless connector + guardrails
- **Authless connector** (claude.ai supports `none`) so judges add it in seconds.
- **Path-secret URL** for a cheap bump above "anyone who guesses the host": deploy at `https://mcp.jenz.ai/x/<32-hex>/mcp` and reject any other path. Works in the UI (you just paste that URL); a real static bearer is **not** acceptable by the claude.ai UI.
- **Guardrails (the load-bearing controls — `submit_skill` spends money):** the cheapest high-value 80% =
  1. **Body cap** — Hono `bodyLimit` (~1–2 MB) + Zod `.max()` on inline file count + per-file length (mirror GitHub's 100 KB×50). *(Our `http.ts` already adds a 2 MB read guard at the MCP layer; add the matching cap on the API too.)*
  2. **Per-IP rate limit** — e.g. ~5 `submit_skill`/min, ~30/hr → `429` + `Retry-After`.
  3. **Daily spend ceiling** — global imports/day (or token-cost) counter → clean "audit capacity reached" when exceeded.
  - Plus: refuse oversize pre-audit (`413`), global audit concurrency cap (semaphore N≈4), keep the 25 s per-pass timeout, lock `CORS_ORIGINS` in prod, no secrets in logs.

### 6c. Production — OAuth via **Supabase OAuth 2.1 Server**, per-user workspaces

**Supabase is a turnkey OAuth 2.1 Authorization Server built for MCP** (beta, free, all plans) — we do **not** build our own AS. It serves `…/auth/v1/oauth/{authorize,token}`, JWKS `…/auth/v1/.well-known/jwks.json`, **DCR** (flag `allow_dynamic_registration`), PKCE S256, refresh rotation. Its access token is a **standard Supabase JWT**, so the existing `requireAuth` (`supabase-auth.ts:22`, `GET /auth/v1/user`) validates it **unchanged** — *provided `aud` stays `"authenticated"`*. *(supabase.com/docs/guides/auth/oauth-server/mcp-authentication)*

**⚠️ The load-bearing claude.ai constraint — Anthropic issue #82 (closed "not planned").** claude.ai's connector **ignores an external IdP's metadata**: it fetches `/.well-known/oauth-authorization-server` but then **constructs `/authorize` + `/token` from the MCP server's own base URL** and **strips `registration_endpoint` to `/register`** (it still implements the 2025-03-26 auth spec). So we **cannot** point Claude straight at Supabase's endpoints — the remote MCP **must front Supabase with OAuth proxy routes at its own root**:
- `GET /.well-known/oauth-protected-resource` (**RFC 9728, at the ROOT** — *path trap: if this 404s the OAuth flow never starts*) → `{ resource: "<canonical MCP URL>", authorization_servers: ["https://<ref>.supabase.co/auth/v1"] }`; return `401` + `WWW-Authenticate: Bearer resource_metadata="…"` on unauthed calls.
- `GET /authorize` → **302** to Supabase `…/auth/v1/oauth/authorize`, forwarding all params (incl. PKCE `code_challenge` + `code_challenge_method=S256`).
- `POST /token` → proxy to Supabase `…/auth/v1/oauth/token` verbatim (accept `application/x-www-form-urlencoded`).
- `POST /register` → only if using DCR; **prefer pre-registering one static "Claude" client and skipping DCR** (more reliable; sidesteps the path-strip). If DCR, forward to Supabase.
- Register Claude's callback **`https://claude.ai/api/mcp/auth_callback`** as a redirect URI on the Supabase client. Keep **`aud="authenticated"`** in the first cut (changing `aud` for RFC 8707 resource-binding breaks `GET /auth/v1/user` — defer it; tenancy comes from the token's `sub`/`client_id` + workspace scoping below).

**Per-user-workspace payoff + the scoped code change.** Once the user's Supabase JWT flows on every MCP call, add a **graceful `attachWorkspace` middleware** on `/api/skills/*` (Bearer → `getSupabaseUser` → `ensureUserWorkspace` → `c.set('workspaceId', …)`; **no token → `'demo'`**, preserving the open demo path) and **scope every skill query/insert by `workspaceId`** in `routes/skills.ts` (+ an additive `workspaceId` column — Jo's Prisma lane). Today those routes ignore auth + workspace, so isolation is *cosmetic* — this is the change that makes *"each Claude user gets their own gated skill workspace, same GitHub login as the dashboard"* real, and lets the abuse guardrails key off `workspaceId` (durable) instead of IP (spoofable).

**Don't demo OAuth cold.** claude.ai connector OAuth has open reliability issues (#199 `start_error`, #240 missing-Authorization-header). Validate the full Claude→Supabase round-trip early; keep **authless** the on-stage default.

**Shortcut:** Cloudflare Workers `workers-oauth-provider`/`McpAgent` (Option 2) bakes in most of these proxy + metadata routes — the natural home for the productionized OAuth connector.

---

## 7. Real E2E verification (no theatre)

All shapes verified vs the MCP spec; tool args from `index.ts`/`schemas.ts`. (Live sanity already done: `curl https://api.jenz.ai/healthz` → `200 {"ok":true}`.) `BASE` = `http://localhost:8080/mcp` local, `https://mcp.jenz.ai/mcp` deployed.

**Transport handshake (curl JSON-RPC; headers `Content-Type: application/json` + `Accept: application/json, text/event-stream`):**
1. `initialize` → result has `protocolVersion`, `serverInfo {name:"jenz-skills",version:"0.1.0"}`, `capabilities.tools`.
2. `notifications/initialized` → **202**, empty body.
3. `tools/list` → exactly **4** tools (`submit_skill, get_skill, list_managed_skills, pull_skill`).

**Engine via the tools:**
4. `submit_skill {source:{type:"github", url:".../agent-skills/tree/main/deploy-preview"}}` → `risk:"safe"`, no files; record `SAFE_ID`.
5. `submit_skill … changelog-genie` **and** `env-doctor` → `risk:"malicious"`, findings populated; record `MAL_ID`.
6. `get_skill {id:MAL_ID}` → same malicious verdict from store.
7. `list_managed_skills {risk:"malicious"}` → list (or graceful "not available" text).

**THE GATE (headline assertion):**
8. `pull_skill {id:MAL_ID}` → `structuredContent.ok=false`, **no `files`**, text `BLOCKED — risk=malicious`, `isError` **false** (blocking is the gate, not an error).
9. `pull_skill {id:SAFE_ID}` → `ok:true`, non-empty `files[]`, text `SAFE — N file(s)`.
10. Reconcile: `GET https://api.jenz.ai/api/skills/<MAL_ID>/files` → **403**; `<SAFE_ID>` → **200 {files}** (frozen contract #3 underneath the tool).

**MCP Inspector:** `npx @modelcontextprotocol/inspector` → Transport **Streamable HTTP**, URL = `BASE`, Connect → History shows `initialize`→`initialized` → Tools tab → reproduce the gate BLOCK/ALLOW contrast (screenshot for the demo). CLI form: `npx @modelcontextprotocol/inspector --cli BASE --transport http --method tools/call --tool-name pull_skill --tool-arg id=<MAL_ID>`.

**claude.ai connector E2E chat script:** add `https://mcp.jenz.ai/mcp` as a custom connector → in chat enable it → (1) submit `deploy-preview` → safe; (2) submit `changelog-genie`+`env-doctor` → both malicious w/ findings; (3) list risk=malicious; (4) **pull changelog-genie → BLOCKED, no files**; (5) pull `deploy-preview` → **files returned**. "Real, not theatre" = tool cards show real params/results, the malicious pull is refused **because the server returned `ok:false`/no files** (flip to the safe id in the same chat → files come back), and the malicious skill content is reported as audited **data**, never executed.

**Pass/fail =** handshake correct · 4 tools · gate BLOCK (no files) vs ALLOW (files) reproduced at all 3 layers (curl → Inspector → claude.ai) · malicious corpus blocked while `deploy-preview` passes · verdict computed server-side · nothing faked.

---

## 8. Effort & sequencing

| Step | Owner | Effort |
|---|---|---|
| `server.ts` + `http.ts` + scripts (code) | MCP lane (Remi) | ~1 h |
| `pnpm install --frozen-lockfile`; local curl + Inspector smoke | verify | ~0.5 h |
| 2nd Railway service + `mcp.jenz.ai` DNS + deployed smoke | deploy lane | ~1–1.5 h |
| Abuse guardrails on the API (body cap + rate limit + daily ceiling) | API lane | ~1–2 h |
| claude.ai connector add + chat E2E | anyone | ~0.25 h |
| **Production:** OAuth-via-Supabase + real per-workspace scoping | future | ~1–2 d |

**Do not** touch `apps/api` demo-critical paths for the spike beyond the (separable) guardrails; **do not** block the final demo audit. This is the future-user "add jenz to Claude Chat" story — strong post-demo, not on the 3-minute critical path.

---

## Appendix — sources
- MCP TS SDK v1.29.0 (tag `e12cbd7`): `server/streamableHttp.ts`, `webStandardStreamableHttp.ts`, `examples/server/simpleStatelessStreamableHttp.ts`; memory `mcp-streamable-http-1290`.
- MCP spec: modelcontextprotocol.io/specification/2025-06-18/{basic/transports,basic/lifecycle,server/tools}; auth 2025-11-25/basic/authorization.
- claude.ai connectors: platform.claude.com/docs/en/agents-and-tools/mcp-connector · claude.com/docs/connectors/building (+ /authentication) · support.claude.com/en/articles/11175166, /11176164 · platform.claude.com/docs/en/api/ip-addresses · mcp-tunnels/overview.
- Railway: docs.railway.com/guides/monorepo · /networking/domains. Cloudflare: developers.cloudflare.com/agents/guides/remote-mcp-server · /model-context-protocol/transport.
- Repo: `apps/mcp/src/{index,server(new),http(new),api,schemas,tools/*}.ts`, `package.json`, `tsconfig.json`, `railway.toml:1-18`, `apps/api/src/{app,index}.ts`, `routes/skills.ts`, `middleware/auth.ts`, `lib/supabase-auth.ts`, `apps/web/src/{lib/supabase.ts,screens/Login.tsx}`.
