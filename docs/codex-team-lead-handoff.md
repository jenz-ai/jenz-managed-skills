# Codex Team-Lead Handoff

Last updated: 2026-06-03 ~13:45 CEST by Codex team-lead session.

This is the compact state handoff for Codex after the final multi-agent audit pass. It is intentionally a unique docs file to avoid racing `WORKLOG.md` while other Claude sessions are still pushing.

## Current Source Of Truth

- Team comms: `~/jenz-team-comms`
- Build repo: `jenz-ai/jenz-managed-skills`
- Current pulled main in this checkout: `bdd7c8d`
- API: `https://api.jenz.ai/api`
- Frontend: `https://skills.jenz.ai/#`
- Claude Code MCP command:
  ```bash
  claude mcp add jenz-skills -e JENZ_API=https://api.jenz.ai/api -- npx -y @jenz-ai/skills-mcp
  ```

## Lead Verdict

Core product is real and demo-strong, not UI theatre on the verified path.

What is green:
- API is live.
- Gate invariant is live: safe rows return files; malicious/suspicious rows return `403` and no files.
- Browser bundle is live API-backed for list/import/detail/files paths.
- `skills.jenz.ai` no longer white-screens on missing Supabase env.
- Mock datasets were removed from the production UI path; remaining fixtures are test-only or constants.
- Real corpus `github.com/jenz-ai/agent-skills` is the right demo substrate.

What is not fully demo-clean until verified:
- Signed-in browser flow must be run with Natnael/Jo demo session: import -> stream verdict -> folders -> detail -> gate.
- Published MCP package parity must be confirmed after Remi's schema fix.
- Demo library should be pruned immediately before the final run.

## No-UI-Theatre Rules

Use only verified live paths on stage:
- Browser import via GitHub **subdir URLs**, not repo root.
- `POST /api/skills/import/stream` for live audit progress and persisted verdict.
- Skill detail reads `GET /api/skills/:id`.
- Files are shown only via `GET /api/skills/:id/files`.
- MCP `pull_skill` may be shown as the agent-workflow gate.

Avoid on stage:
- Root repo URL `github.com/jenz-ai/agent-skills` because it creates one aggregate row.
- Folder upload, because browser-native upload prompts are ugly on stage.
- Sidebar `Add skill`.
- `Approve anyway`.
- Any fake breach theatrics.
- Claude Chat remote MCP live setup.

Recommended demo import URLs:
```text
https://github.com/jenz-ai/agent-skills/tree/main/skills/changelog-genie
https://github.com/jenz-ai/agent-skills/tree/main/skills/deploy-preview
```

Expected:
- `changelog-genie` -> malicious, findings/taxonomy, files blocked.
- `deploy-preview` -> safe, files visible.

## Current Remaining Work

### P0 / P1 Before Demo

1. Signed-in browser rehearsal.
   Owner: Jo/Natnael with logged-in session.
   Verify: dashboard -> import subdir URLs -> streamed verdicts -> folders -> detail -> safe files visible / malicious files blocked.
   If rows are created, list slugs and prune.

2. MCP published package parity.
   Owner: Remi.
   Source fix landed at `67b40b3`: MCP schema now accepts optional `taxonomy`.
   Check: `npm view @jenz-ai/skills-mcp version` still showed `0.1.0` during Codex check, while `package.json` was also `0.1.0`.
   Risk: if npm was not republished after the fix, `npx -y @jenz-ai/skills-mcp` may still use the old schema and `get_skill` may still fail.
   Needed: publish patched package or explicitly use a local built path for demo. Then run live MCP smoke.

3. Demo library prune.
   Owner: Jo/deploy or whoever owns DB cleanup.
   Target: 8 rows only:
   - 6 red-team fixtures
   - `agent-skills/skills/deploy-preview`
   - `agent-skills/skills/changelog-genie`

### P2 / Stretch

Claude Chat remote MCP:
- Feasible but not a live-demo dependency.
- Current MCP is stdio-only for Claude Code.
- Claude Chat connectors need a public HTTPS remote MCP server with Streamable HTTP/SSE.
- Docs exist in `docs/claude-chat-mcp-remote.md`.
- Treat as stretch/future-user connector. Do not disturb `api.jenz.ai`, `skills.jenz.ai`, Prisma, or current stdio MCP.

## Audit Findings From Parallel Agents

Browser truth:
- Core browser list/import/stream/detail/files path is live API-backed.
- P1 avoidances remain: local add/approve controls, audit-history-style fixture areas if present, MCP check animation.

API/security:
- No file leak found for non-safe rows.
- Model advisory risk does not decide host verdict.
- Content-hash TOCTOU check is real for current import paths.
- P1 security caveats: legacy rows with `contentHash = null`, open global import can overwrite by slug, detail finding quotes can expose snippets from submitted content.

Deploy readiness:
- API/gate green.
- Frontend live and not blank.
- Full release not final until signed-in browser rehearsal and MCP package parity.

Business/demo:
- Story is compelling if framed as velocity unlocked, not "scanner".
- Best line: "Jenz is the trust layer for agent capabilities."
- Do not claim prompt injection is solved, first, or GDPR-compliant.
- Do not show Claude Chat remote MCP live.

Remote MCP:
- Entry-point swap, not a rewrite.
- Minimal future work: extract server factory, add HTTP Streamable MCP entrypoint, deploy separate service/subdomain.
- Public MCP creates abuse surface if agent API stays open: needs caps/rate limits/spend guard before public exposure.

## Final Demo Checklist

1. Confirm latest main is deployed to API and Pages.
2. Confirm `GET https://api.jenz.ai/api/skills` returns target demo rows.
3. Confirm safe row files: `deploy-preview` -> `200` + files.
4. Confirm malicious row files: `changelog-genie` -> `403` + no files.
5. Confirm logged-in browser flow:
   - paste subdir URLs
   - see streamed progress
   - see verdicts land in folders
   - open malicious detail and show blocked files
   - open safe detail and show files
6. Confirm MCP:
   - `list_managed_skills`
   - `get_skill` works with taxonomy
   - `pull_skill` blocks malicious and returns files for safe
7. Run prune after any import smoke.

## What To Watch

- If browser shows auth screen only, the public unauth state is fine; the demo still needs a logged-in session.
- If `npx -y @jenz-ai/skills-mcp` still fails `get_skill`, source fix is not enough; publish/package path is stale.
- If live row count drifts above target, prune before demo.
- If a successful import is run for audit, do not leave extra rows without listing slugs.
