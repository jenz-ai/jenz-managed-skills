# WORKLOG — jenz-managed-skills (build repo)

Cross-agent ledger for **Claude Code ↔ Codex** working in this repo. Newest entry on top.
Both agents load `CLAUDE.md` (Codex via the `AGENTS.md` symlink). Coordinate live in `~/jenz-team-comms`.

---

## 2026-06-03 ~10:30 — Claude Code (Natnael, backend/audit-engine lane)

**The real audit engine is LIVE on `main` + hardened. All pushed, all green.**

- **Pipeline** (`apps/api/src/lib/`): `prefilter.ts` (L1 regex/unicode) → `openrouter.ts` (DeepSeek ×2 via OpenRouter, forced JSON, non-thinking, retry) → host `score.ts` `scoreRisk()` (the gate) → `taxonomy.ts` (OWASP/MITRE crosswalk). Orchestrated by `audit.ts` `auditSkill()`. Built in parallel by a 4-agent TeamCreate team.
- **`POST /audit`** (`routes/audit.ts`, mounted in `index.ts`): `{raw}` or bare RawSkill → `200 AuditedSkill`, `400` on bad body.
- **Live-verified (real DeepSeek):** benign Fly-deploy → **`safe`, 0 findings** (×2, deterministic) ✅ · malicious ssh/aws-exfil → **`malicious`, 6 findings (regex + llm)** ✅
- **Tests:** **68 passed, 0 skipped**; `tsc --noEmit` clean. (`pnpm --filter @jenz/api test`.)

**Resolved (were open items; fixed this session with Codex's review):**
1. ~~Benign false-positive~~ **FIXED.** Root cause (Codex-flagged policy bug): `passesAgree = passA.risk===passB.risk` fed `scoreRisk([], false) → suspicious`, so two completed zero-finding passes that merely *disagreed on advisory labels* blocked a clean skill — contradicting "model advises, host decides." Now `passesHealthy` gates **only on pass failure**; two completed passes → host scores **evidence**. `scoreRisk` unchanged (locked, Task-3 tests intact).
2. ~~Skipped fail-closed test~~ **FIXED with real coverage.** Added dependency injection: `auditSkill(raw, onProgress?, runPass = runAuditPass)`. The test injects a **plain throwing fn** (no `vi.fn`) → vitest no longer misreports the caught throw. Un-skipped + a new test locks the FP fix.
3. **Per-pass model timeout** (`AUDIT_TIMEOUT_MS`, default 25s) — a hung provider (saw a 120s hang on one input) now aborts → fail closed instead of hanging `/audit`. Demo robustness.

**Contract note:** `auditSkill` gained an optional 3rd param (`runPass`, defaulted) — fully backward-compatible; callers (`routes/audit.ts`, Jo's gate) unchanged.

**Gotchas for anyone here:**
- **Kill stale servers before smoke-testing:** `lsof -ti tcp:8080 | xargs kill`. A leftover `:8080` node process served OLD behavior and confused a smoke test.
- **Fresh clone:** `pnpm install && pnpm --filter @jenz/api exec prisma generate` (Jo's DB tests need the generated client; `skill-roundtrip` hits the real Supabase DB via `DATABASE_URL`).
- `.env` (gitignored) holds `OPENROUTER_API_KEY`, `AUDIT_MODEL`, `OPENROUTER_BASE_URL`, `AUDIT_TEMPERATURE`, `AUDIT_TIMEOUT_MS`?, `DATABASE_URL`, `PORT`. Don't `source` it raw in zsh — `DATABASE_URL` has `&`; use a dotenv loader or quote it.

**Next (my lane):** wire `taxonomyFor()` into the `/audit` response (or web calls it per finding); confirm `openrouter.ts` uses the full F27 auditor system prompt + 3 few-shots; demo fixtures + the 6 labeled red-team cases for the UI.

**For Codex:** repo is green + pushed. Before editing: `cd ~/jenz-team-comms && ./comms.sh read --all`, then `git fetch origin && git status -sb`. Use a fresh worktree/branch — don't edit `apps/api/src/lib/*` or `routes/audit.ts` (Claude's lane) without coordinating in comms.
