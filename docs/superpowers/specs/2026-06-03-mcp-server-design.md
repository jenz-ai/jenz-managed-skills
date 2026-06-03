# Jenz MCP Server — Design (reconciled)

- **Date:** 2026-06-03
- **Owner:** Remi · **Lane:** `apps/mcp`
- **Status:** approved (brainstorm) → ready for implementation plan
- **Supersedes drift in:** research-repo `jenz-managed-skills-mcp-spec.md` (2026-06-02) and `2026-06-03-mcp-build-plan.md`. This doc is the source of truth where they disagree.

## 1. What we're building

An MCP server (`@jenz/mcp`) that lets a coding agent (Claude Code first) **submit a skill for a security audit and pull back only the ones that pass** — from inside the CLI. The audit runs server-side on open weights (Natnael's engine, behind Jo's HTTP API). This MCP is a **thin, gate-faithful client** over that API. **No detection logic lives here — the backend is the brain; the MCP is transport + relay.**

## 2. Decisions (and why)

| # | Decision | Why |
|---|---|---|
| D1 | **stdio transport first.** Hosted Streamable HTTP deferred. | Demo runs in a local Claude Code session; stdio has zero deploy dependency on Jo and is the fastest path to a working demo. Tool registration is transport-agnostic, so hosted can be added later with no tool rewrites. |
| D2 | **Thin HTTP client.** MCP only ever talks HTTP to `JENZ_API`. | Keeps the gate server-side and the MCP swappable from mock → Jo's real API with **no MCP code change** (flip one env var). |
| D3 | **Local mock returns canned `AuditedSkill` verdicts.** No `auditSkill()` import. | `@jenz/api` exposes no library entry — importing it would boot the Hono server (side effect) or fail to resolve; a clean import would need a cross-lane export from Natnael. The MCP is a thin relay and does **not** need real detection to be built/tested; it needs the right route shapes + the real 403 gate. Real verdicts arrive for free by pointing `JENZ_API` at the live API. Canned keeps Remi's lane self-contained and tests deterministic. |
| D4 | **Outputs reuse `@jenz/shared` types + `structuredContent`.** | Single source of truth for `AuditedSkill`/`Finding` — no second, drifting definition. The agent gets validated structured data plus human-readable text. |
| D5 | **Skill identifier is an opaque string** echoed from the API. | The MCP never constructs ids; whatever `import` returns is handed to `audit`/`get`/`pull`. Decouples us from whether Jo keys on `slug` or a uuid. (Mock uses `slug` as the id; flag to Jo that his path `:id` should accept whatever `import` returns.) |
| D6 | **SDK = `@modelcontextprotocol/sdk` v1.x (stable).** | v2 is `2.0.0-alpha.2` with split packages — not for a hackathon. |

## 3. Architecture & data flow

```
Claude Code ──stdio──▶ @jenz/mcp (4 tools)
                          │  fetch + x-jenz-workspace header  (api.ts)
                          ▼
                     JENZ_API (HTTP)
           ┌───────────────┴────────────────┐
  dev: apps/mcp/mock (Hono, in-memory Map)   prod: Jo's apps/api
       canned AuditedSkill verdicts,         (same routes + DB +
       enforces the 403 gate                  Natnael's real engine)
```

Flip `JENZ_API` from `http://localhost:8787/api` (mock) to Jo's deployed URL — **no MCP code change.**

## 4. The four tools

Each tool = zod **raw-shape** `inputSchema` + `outputSchema` + a handler calling `api.ts`. Each returns **human-readable text** (`content`, Claude relays it) **and** validated **`structuredContent`**. Verdict/finding fields reuse the frozen `@jenz/shared` `AuditedSkill` / `Finding`.

| Tool | Input | API calls | Structured output |
|---|---|---|---|
| `submit_skill` | `{ source: {type:'github',url} \| {type:'inline',name,files:[{path,content}]} }` | `import` → `audit` | `{ id, ...AuditedSkill }` (risk, findings[], description, category) |
| `get_skill` | `{ id }` | `get` | `{ id, ...AuditedSkill }` (no files) |
| `list_managed_skills` | `{ category?, risk?, query? }` | `list` | `{ skills: [{ id,name,risk,category,description,findingsCount }] }` |
| `pull_skill` ← **gated** | `{ id }` | `files` | discriminated union on `ok` (see §5) |

`inline` source is how "audit my local skill" works: Claude reads its own `~/.claude/skills/<name>/` files with its native tools and passes them inline — the agent is the bridge, no separate CLI.

## 5. The gate (`pull_skill`) — the only real logic

```ts
// outputSchema = discriminated union on `ok`. The ok:false variant has NO files field,
// so the SDK's own output validation structurally guarantees files can never leak on a block.
const PullOutput = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true),  name: z.string(),
             files: z.array(z.object({ path: z.string(), content: z.string() })),
             hint: z.string() }),
  z.object({ ok: z.literal(false), risk: z.enum(['pending','suspicious','malicious']), reason: z.string() }), // any non-safe risk fails the gate

]);

async function pullSkill(id: string) {
  const { status, body } = await api.files(id);          // GET /skills/:id/files
  if (status !== 200) {
    return { ok: false as const, risk: body.risk, reason: body.reason };
  }
  return { ok: true as const, name: body.name, files: body.files,
           hint: 'Write these to ~/.claude/skills/<name>/ then re-run skill discovery.' };
}
```

**Rules:** files returned **only** on HTTP 200. On non-200 → `{ ok:false }` with **no `files` field, ever.** Never cache or synthesize files for a blocked skill. `pull_skill` on a non-safe skill is **not an error** — it's the gate working as designed.

## 6. API client (`src/api.ts`)

Typed `fetch` wrapper. Base URL + workspace token from env:

```ts
const BASE = process.env.JENZ_API ?? 'http://localhost:8787/api';
const WS   = process.env.JENZ_WORKSPACE ?? 'demo';
const h = { 'x-jenz-workspace': WS, 'Content-Type': 'application/json' };
// import(source) POST /skills/import → { id, name }
// audit(id)      POST /skills/:id/audit → AuditedSkill (idempotent/cached)
// list(query)    GET  /skills?…  · get(id) GET /skills/:id
// files(id)      GET  /skills/:id/files → { status, body }  // 200 {name,files} | 403 {error,risk,reason}
```

Node 22 global `fetch`. The `files` call returns `{ status, body }` so `pullSkill` can branch on status.

## 7. Mock backend (`mock/server.ts`) — dev only

A tiny Hono app, in-memory `Map` as the "DB", faithfully mocking Jo's 5 routes:

- `POST /api/skills/import` → store the `RawSkill`, assign `id = slug`, return `{ id, name }`.
- `POST /api/skills/:id/audit` → return a **canned `AuditedSkill`** (poisoned fixture → `malicious` + a credential-exfil `Finding`; benign fixture → `safe`, no findings), store it. Idempotent.
- `GET /api/skills` → filter the store by `category/risk/query`.
- `GET /api/skills/:id` → stored verdict, no files.
- `GET /api/skills/:id/files` → **200 `{ name, files }` iff stored `risk==='safe'`, else `403 { error:'not_safe', risk, reason }`** — the gate, server-side.

Exposes the Hono app so tests can call `app.request(...)` without binding a port; runs on `:8787` for the MCP inspector + demo. **No `@jenz/api` import.**

## 8. Transport, config & errors

- **`src/index.ts`:** create `McpServer` (from `@modelcontextprotocol/sdk/server/mcp.js`), `registerTool` the 4 tools (transport-agnostic), then `await server.connect(new StdioServerTransport())` (from `.../server/stdio.js`).
- **stdout is the protocol channel** under stdio — **all logging goes to `console.error` (stderr)**. The skeleton's `console.log` is removed. Fatal errors: `console.error` + `process.exit(1)`.
- **Errors via `isError: true`** inside the `CallToolResult` (not thrown, not protocol errors) so Claude sees them and self-corrects. API non-200 (other than the pull gate) → `{ content:[reason], isError:true }`. Network/timeout → `{ content:['couldn't reach jenz audit service'], isError:true }` — never silent.
- **Claude Code install** (for Jo's onboarding screen later):
  `claude mcp add jenz-skills -- node /abs/path/apps/mcp/dist/index.js` with `JENZ_WORKSPACE=<token>` in env.

## 9. Testing

**TDD the gate; build-and-verify the rest.**

- `tests/pull.test.ts` (RED first): against the mock — malicious id → `{ ok:false, risk, reason }` and **asserts no `files` key**; safe id → `{ ok:true, files }`. Drives `pullSkill()`.
- `submit / get / list`: verify against the mock + the MCP inspector (`npx @modelcontextprotocol/inspector`).
- Run via `pnpm --filter @jenz/mcp test` (Vitest).

## 10. File structure & deps

```
apps/mcp/
├── src/
│   ├── index.ts            # McpServer + registerTool(4) + StdioServerTransport
│   ├── api.ts              # fetch wrapper (JENZ_API + x-jenz-workspace)
│   └── tools/{submit,get,list,pull}.ts
├── mock/server.ts          # in-memory Hono stub, canned verdicts, the 403 gate
├── tests/pull.test.ts      # TDD the gate
└── fixtures/               # benign + poisoned skill
```

Add to `apps/mcp/package.json`: `@modelcontextprotocol/sdk` (v1.x), `zod` (v3), `hono`, `@hono/node-server`, `vitest`. Keep `@jenz/shared`. **No `@jenz/api` dependency.**

## 11. Scope

**In:** 4 tools · stdio transport · gate-faithful `pull` · in-memory mock with canned verdicts + 403 gate · install snippet · benign+poisoned fixtures · demo rehearsal.

**Out (deferred/explicit non-goals):** hosted Streamable HTTP transport · discovery/ranking beyond `list` · Codex/Hermes configs · auth beyond the workspace token · streaming audits over MCP (the web app owns the live "moment").

## 12. Coordinate with Jo / Natnael (post to comms)

- **Jo:** confirm `import` auto-audits vs separate `audit` call; confirm path `:id` accepts whatever `import` returns (opaque id); confirm the exact `/files` 403 body (`{ error, risk, reason }`).
- **Natnael:** none required for the MCP. (If we ever want real verdicts in the *mock*, he'd add a side-effect-free `@jenz/api/audit` export — out of scope now.)

## 13. Demo (Remi's half of the 3-min run)

1. *"Audit + add the skill at github.com/…/poisoned-skill"* → `submit_skill` → `malicious` + offending line → `pull_skill` → `{ ok:false }`. **Caught.**
2. *"Add a safe formatter skill"* → `submit_skill` → `safe` → `pull_skill` → Claude writes files to `~/.claude/skills/…` → `/formatter` usable. **Vetted skill flows in natively.**
3. *"Audit my local skill X"* → Claude reads its own `~/.claude/skills/X` files, passes them **inline** to `submit_skill`. Confirms the inline path.
