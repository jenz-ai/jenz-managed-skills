# L6 — Deploy-Verify / Prod Demo-Flow Session Report

**Session:** L6 (Claude, worktree `jenz-deploy`, branch `claude/deploy`)
**Lane:** Deploy verification · live prod demo-flow · canonical-URL publishing · list-endpoint (only on Jo handoff)
**Status:** ✅ COMPLETE — demo flow verified GREEN on the live API. Standing by.
**Wrote zero application code** (worktree clean). All findings/fixes are env/config or escalations to the owning lane.

> Source of truth for cross-session coordination remains `~/jenz-team-comms` (`log/natnael.md`). This doc consolidates the L6 message stream into one place.

---

## TL;DR (current state)

- **API base = `https://api.jenz.ai/api`** (live, valid TLS, latest code). **Frontend = `https://skills.jenz.ai`** (Cloudflare Pages, cutover done, serving HTML).
- **The prod "benign over-flag" demo blocker is FIXED.** Root cause was **`AUDIT_MODEL` unset in Railway** → I set it + redeployed; Jo's `f061e00` (default-model + retry) then shipped via `railway up`. Benign now audits `safe` in prod.
- **Both demo gate paths verified live:** benign → `safe` → gate **200 `{files}`**; malicious → gate **403** (no files) with real `detector:llm` findings.
- **Open (owned by others):** demo-library cleanup (Jo, DB), SSE-verdict taxonomy 1-liner (L5/Codex), regex `.aws`-in-URL false-positive (engine lane).

---

## What L6 did (chronological)

1. **Boot + canonical URLs.** Read comms, synced main, verified prod. Published the canonical API base + flagged that `skills.jenz.ai` had **no browser dashboard** (API-only at the time) and **CORS was absent** (Jo since added CORS). Confirmed the `GET /api/skills` list endpoint was already shipped by Jo (no L6 work needed).
2. **Diagnosed the #1 demo blocker** (benign skills → `suspicious`/0-findings in prod). Proved via code-read + live `/audit` probes that it was **not** a `scoreRisk` bug: the model layer was failing. Confirmed first-hand (benign `/audit` → `suspicious` in ~0.1s = far too fast for real DeepSeek = passes failing → `passesHealthy=false` → fail-closed).
3. **Verified the engine is correct end-to-end** under real conditions: stood up a local Postgres (no Docker, `brew postgresql@15`), ran the full API suite **71/71 green** (the "13 failures" some see locally are purely missing `DATABASE_URL`), and drove the real demo flow with the **real DeepSeek model** — benign→`safe`→gate 200; subtle regex-evading injection → `malicious` with **5 `detector:llm` findings** (proves the open-weight LLM semantic layer, our core pitch).
4. **Owned + applied the prod fix** (team-lead handoff to L6; announced ownership + locked Railway first):
   - Diagnosed via `railway run` (read-only, prod env injected, no secrets printed): `OPENROUTER_API_KEY` **present + valid**; **`AUDIT_MODEL` UNSET** (no default in code → instant throw).
   - Set `AUDIT_MODEL=deepseek/deepseek-chat` (+ `AUDIT_TEMPERATURE=0.4`, `AUDIT_TIMEOUT_MS=25000`) via `railway variables --set --skip-deploys`, then `railway redeploy`.
   - Verified the flip live: benign `/audit` → `safe` (5.8s, real DeepSeek).
5. **Re-smoked the full demo flow** on `api.jenz.ai` after the domain migration: benign import → `safe` → gate 200; honest malicious inline import → `malicious` (regex + llm) → gate 403.
6. **Final alignment pass** + demo-library hygiene flag (junk test rows to wipe before demo).

---

## Root causes found

### 1. `AUDIT_MODEL` unset in Railway prod — FIXED ✅ (L6 + Jo)
- `apps/api/src/lib/openrouter.ts:420-421` — `AUDIT_MODEL` has **no default**; unset → `requestCompletion` throws `"AUDIT_MODEL is not configured"` instantly (zero network) → both passes fail → `audit.ts` sets `passesHealthy=false` → `scoreRisk([], false) === 'suspicious'` (`score.ts:11`). Engine is correct + fail-closed by design; this was pure prod env.
- Fix: `AUDIT_MODEL=deepseek/deepseek-chat` set in Railway; Jo's `f061e00` adds a code-level default-model + retry as belt-and-suspenders. Both live.

### 2. Regex false-positive: `SECRET_PATH` matches `.aws` inside `docs.aws.amazon.com` — OPEN ⚠️ (engine lane)
- `apps/api/src/lib/prefilter.ts:57` — the `.aws`/`.ssh` path detector has no filesystem-path anchoring, so it matches the `.aws` substring in any AWS doc URL. `anthropics/courses` (a legit repo) was labeled `malicious` on 7 benign AWS doc links.
- Fix (engine lane, **not** L6): anchor the path detectors so `.aws/.ssh/...` only match as filesystem paths (require a leading boundary that isn't alphanumeric, so `docs.aws` won't fire but `~/.aws` / `/home/x/.aws` will). Low demo risk (didn't trigger on the labeled corpus controls).

---

## Canonical URLs (current, post Jo's migration)

| Surface | URL | Notes |
|---|---|---|
| **API base** | `https://api.jenz.ai/api` | live, valid TLS, latest code, model fix applied |
| **Frontend** | `https://skills.jenz.ai` | Cloudflare Pages, cutover done (serves HTML) |
| MCP install | `claude mcp add jenz-skills -e JENZ_API=https://api.jenz.ai/api -- npx -y @jenz-ai/skills-mcp` | Remi's published `@jenz-ai/skills-mcp@0.1.0` |

> Earlier L6 comms said "API = skills.jenz.ai/api" — **superseded.** Jo migrated API → `api.jenz.ai`, `skills.jenz.ai` → frontend.

---

## Live demo flow — verified GREEN (api.jenz.ai)

- `GET /healthz` → 200, valid TLS.
- Benign import (`octocat/Hello-World`) → `safe` → `GET /api/skills/:id/files` → **200 `{files}`**.
- Malicious inline import → `malicious` (regex + `detector:llm` criticals) → gate **403 `{error:not_safe,...}`** no files.
- Seeded 6 demo fixtures (by another natnael/L3 session) + external labeled corpus `github.com/jenz-ai/agent-skills` validated 8/8 (2 malicious blocked, 6 safe pass).

---

## Open items + owners

| Item | Owner | Notes |
|---|---|---|
| **Demo-library cleanup** | Jo (DB; no DELETE endpoint) | 23 rows live; ~15 are smoke/test junk. Keep only the 6 fixtures + corpus deploy-preview/changelog-genie. **L6-created junk to wipe:** `l6-evil-exfil`, `octocat-hello-world` (Hello-World), `Spoon-Knife`, `gitignore`, `courses`. |
| SSE `verdict` taxonomy enrichment (1-line `audit-stream.ts`) | L5 / Codex | Parked unless Jo wants OWASP/MITRE badges in the live audit-moment; diff is ready. |
| Regex `.aws`-in-URL FP | engine lane | See Root Cause #2. |

---

## Incident note (transparency)

While applying the env fix, my `railway redeploy` crossed with **Jo's intentional, announced domain migration** (API → `api.jenz.ai`, `skills.jenz.ai` → frontend). I escalated a "PROD DOWN" alarm **before fully reading comms** — it was the migration, not an outage. Corrected + apologized in comms. **Lesson (saved to memory): in this many-instance setup, read comms fully before escalating an infra alarm; a surprising prod state is usually a teammate's announced change.**

---

## L6 guarantees
- No application code changed (worktree clean at `b143442`).
- No secrets printed/committed; `railway run` used read-only for prod-env diagnosis.
- Railway env-lock released; deploy/domain stays Jo's lane.
- Local artifacts only: a local `jenz` Postgres DB for testing (not pushed).
