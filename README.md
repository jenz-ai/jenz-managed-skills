# jenz-managed-skills

Open-weight security gate that audits AI-agent **skills** (a `SKILL.md` + bundled scripts) for
prompt injection / malicious code, and serves a skill's files to an agent **only** if the verdict
is `safe` (else HTTP 403, zero files).

One Hono backend, two surfaces: a web app + an MCP server.

## Monorepo layout

```
apps/api        Hono backend — the gate, audit engine, routes
apps/web        Vite + React-TS web app
apps/mcp        thin MCP client
packages/shared frozen contracts (types) shared across all apps
```

## Lanes

- **Jo** — `apps/web` + platform backend (auth, workspaces, invites, GitHub import, the gate, Prisma/DB, deploy)
- **Natnael** — `apps/api/src/lib/{prefilter,openrouter,score,audit,taxonomy}.ts` + `routes/audit.ts` + fixtures (audit engine)
- **Remi** — `apps/mcp` (thin MCP client)

## Frozen contracts

- **Contract 1** — `packages/shared/types.ts` (`Risk`, `Finding`, `RawSkill`, `AuditedSkill`, …). Everyone imports `@jenz/shared`.
- **Contract 2** — `auditSkill(raw, onProgress?) => Promise<AuditedSkill>` in `apps/api/src/lib/audit.ts`. Signature frozen; body is Natnael's.

## Dev

```bash
pnpm install
pnpm --filter @jenz/api dev   # serves /healthz on PORT (default 8080)
```
