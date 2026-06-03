# HANDOFF — jenz-managed-skills (post-compact resume)

**Hackathon day, 3 June 2026.** Paste the relevant block below into each fresh terminal. This is the single source of truth for resuming after a compaction. Last updated by Claude Code (Natnael) ~10:30.

---

## 0) TL;DR — where we are

- **The audit engine is DONE, live, and pushed to `main`.** `auditSkill()` is the real pipeline (no stub).
- **Live-verified with real DeepSeek:** benign → `safe` (0 findings), malicious → `malicious` (regex + llm findings).
- **Tests: 68 passed, 0 skipped; `tsc` clean.** CI-equivalent: `pnpm --filter @jenz/api test`.
- **Team:** Natnael = audit engine (DONE) · Jo = web + platform + gate + Prisma + deploy · Remi = MCP server.
- **Repo moves fast** — always `git fetch origin && git pull --rebase` before editing/pushing.

## 1) Resume reading order (any agent)

1. `CLAUDE.md` (Codex: `AGENTS.md` symlink) — operating manual, contracts, lanes, rules.
2. `WORKLOG.md` (this repo) — newest entry = current state + gotchas.
3. `~/jenz-team-comms` → `./comms.sh read --all` — what Jo/Remi/Codex last said.
4. The research/build-truth (deep detail): `jenz-ai/Hackathon` repo → `Jenz managed skills/07-Research-Synthesis/BUILD-TRUTH.md`.

## 2) Mandatory before ANY edit (every session, every agent)

```bash
cd ~/jenz-team-comms && ./comms.sh read --all
cd ~/Desktop/AdaVentures-Hackathon-2026-06-03/jenz-managed-skills
git fetch origin && git status -sb && git pull --rebase
lsof -ti tcp:8080 | xargs kill 2>/dev/null   # kill stale API servers before smoke-testing
```
Fresh clone also needs: `pnpm install && pnpm --filter @jenz/api exec prisma generate`.
**Hard rule:** no two terminals edit the same files. For parallel edits use a worktree:
`git worktree add ../jenz-<purpose> origin/main -b <agent>/<purpose>`.

## 3) Multi-session plan — 6 focused sessions (agreed with Codex)

**Every session starts with Section 2's block.** Sessions that may edit → make a worktree first
(`git worktree add ../jenz-<purpose> origin/main -b <agent>/<purpose>`). **No two terminals edit the same files.**
Highest-leverage first: **#2 Codex API QA** and **#3 Claude Deploy** right after compaction.

**1. Claude — Backend/Engine (this session, ongoing).** Owns `apps/api/src/lib/*`, `routes/audit.ts`, fixtures. Engine DONE; next: taxonomy into `/audit` response, demo fixtures + 6 labeled red-team cases, confirm F27 auditor prompt in `openrouter.ts`.

**2. Codex — API QA (read-only, fresh worktree).** Paste:
> You are Codex API QA. Repo: jenz-managed-skills. Read CLAUDE.md and `~/jenz-team-comms` first. Do not edit files. Pull origin/main, run API tests + typecheck, then smoke `/audit` (benign+malicious) and the `/api/skills` import + gate paths. Kill any stale `:8080` server first. Report only verified results + blockers to comms.

**3. Claude — Deploy/Railway (single owner, no app-logic edits).** Paste:
> You are deploy owner. Read CLAUDE.md and `~/jenz-team-comms`. Own Railway ONLY: `railway link` jenz-skills, verify env, deploy origin/main, confirm `skills.jenz.ai`/healthz + API routes. Do not edit app logic. Post the deploy URL + status to comms.

**4. Codex — Frontend QA (read-only unless asked).** Paste:
> You are frontend QA. Read comms. Pull Jo's web branch/main. Verify the web build, run the app locally, inspect key screens, check the demo flow + API-binding assumptions, text overflow. Report issues with file/line refs to comms. Don't edit unless asked.

**5. Claude — MCP QA (owns `apps/mcp` only).** Paste:
> You are MCP QA. Read comms + docs specs. Work ONLY in apps/mcp. Verify the MCP tools call the confirmed API (POST `/api/skills/import`, GET `/api/skills/:id/files`) and that pull-skill NEVER returns files on a 403 (gate invariant). Test against live/mock API. Post results to comms.

**6. Codex — Demo/Pitch QA (non-code).** Paste:
> You are demo QA. Read comms + the current verified product state. Build a 3-minute demo checklist + a failure-fallback script around ACTUAL verified behavior (benign→safe, malicious→blocked, gate prevents file access). Don't change code. Keep it operational + judge-facing.

**All cross-agent comms via `~/jenz-team-comms` — if it isn't there, the others don't know it.**

## 4) The product (one paragraph)

Open-weight security gate that audits AI-agent *skills* for prompt injection + malicious code. **`auditSkill(raw)`** runs `prefilter` (regex/unicode) + 2 tool-less DeepSeek passes (when `OPENROUTER_API_KEY` set; per-pass `AUDIT_TIMEOUT_MS`=25s), merges/dedupes findings, and the HOST computes the verdict via `scoreRisk()` (model risk is advisory only; fail-closed). The **gate**: `GET /api/skills/:id/files` → `200 {files}` iff `risk==='safe'` else `403`. Theme: Economic Empowerment · Track: Safety/Security/Governance AI.

## 5) Open items / next priorities

1. **Demo flow end-to-end:** web → upload/import skill → `/audit` → gate → show verdict + findings (with OWASP/MITRE via `taxonomyFor()`). Wire taxonomy into the response or render per-finding in web.
2. **Deploy:** Railway `jenz-skills/web` (13 env vars set incl. `OPENROUTER_API_KEY`, `DATABASE_URL`). Link + deploy; smoke-test the live URL.
3. **MCP ↔ API** integration test (Remi): point MCP at `/audit`, verify the gate invariant.
4. **Pitch/demo:** 3-min script, the 6 labeled red-team cases as canned UI buttons, backup video by 15:30.
5. **Model latency:** DeepSeek can be slow; timeout fails closed. Consider a faster model for the live demo if needed (env-swap, no code change).

## 6) Key facts
- **Repos:** build = `jenz-ai/jenz-managed-skills` · research = `jenz-ai/Hackathon` (`Jenz managed skills/07-Research-Synthesis/`) · comms = `jenz-ai/team-comms` (`~/jenz-team-comms`).
- **GitHub:** `gh` authed as `natti1399` (full `jenz-ai` access).
- **Secrets:** `apps/api/.env` (gitignored — NEVER commit). Same vars in Railway.
- **Code due 16:00; demo 16:30–17:30 CET.**
