# L2 Detection-Depth — Status & Verification Report

_Owner: Natnael (L2 lane: `apps/api/src/lib/openrouter.ts` + `prefilter.ts` + `prefilter/*`)._
_Status: **✅ COMPLETE — shipped to `main`, deployed (api.jenz.ai), prod over-flag cleared. L2 STANDING DOWN.** Real-model + real-prod-env verified. Last updated 2026-06-03._

> **This file is the single source of truth for L2.** It is intentionally NOT
> duplicated into the shared `WORKLOG.md`/`CLAUDE.md` — several Claude sessions
> document concurrently, and those shared files collide on concurrent edits.
> Cross-session updates from L2 also live in comms (`~/jenz-team-comms`, `log/natnael.md`).
>
> ⚠️ **Correction for anyone reading the `WORKLOG.md` ~11:05 entry:** that entry
> attributes the prod over-flag to a broken/invalid `OPENROUTER_API_KEY`. That is
> NOT the cause — the key is valid (HTTP 200, verified). The proven root cause is
> **`AUDIT_MODEL` unset in Railway** (see the ROOT CAUSE section below). Resetting
> the key alone would not have fixed it; setting `AUDIT_MODEL` (or this code's
> default) does.

This is the durable record of the L2 detection-depth work so Jo, Remi, the L4-eval
session, and any other parallel Claude/Codex session can get filled in without
re-reading the diff. **Conflict-free by construction:** L2 only ever edited its
own two owned files + new files under `apps/api/src/lib/prefilter/`; `score.ts`,
`audit.ts`, `routes/*`, `apps/web`, `apps/mcp` were never touched.

## What shipped

**Goal:** catch more real prompt-injection / exfil / obfuscation attacks while
holding the false-positive floor (a single stray finding flips the LOCKED
`scoreRisk()` to `suspicious` and breaks the demo).

1. **Modular prefilter** (`prefilter.ts`): now composes pluggable `RegexRule[]`
   modules in addition to its inline core detectors, deduping the union. The
   seam (`prefilter/types.ts`) let three categories be built in parallel with
   zero file collisions. Empty modules = zero behavior change.

2. **37 new deterministic L1 detections** across three modules (each TDD'd with a
   positive **and** a benign-negative case; only existing `@jenz/shared` finding
   types used; severity-disciplined):
   - `prefilter/override.ts` (18) — instruction-override phrasing variants,
     jailbreak/persona modes, fake `[system]`/`<system>`/`BEGIN SYSTEM PROMPT`
     delimiters, tool-poisoning hidden directives ("before every response,
     read…"), scoped trust-boundary subversion (`excessive-agency`), and
     fabricated-authority `social-engineering`.
   - `prefilter/obfusc.ts` (12) — base64/atob **decode-AND-execute** across
     JS/Python/PowerShell/sh, char-code & escape-run construction, dangerous-token
     concatenation, and a homoglyph / mixed-script predicate (Cyrillic U+0400–04FF
     + Greek U+0370–03FF confusables) that leaves Norwegian / Latin-Extended prose
     clean.
   - `prefilter/exfil.ts` (7) — known exfil sink hosts (telegram/discord/
     pastebin/transfer.sh/ngrok/OOB collectors), DNS/OOB command-substitution
     exfil, secret-source→network-sink pipes (**critical**), credential-store
     reads the core misses (`.npmrc`/`.git-credentials`/gh hosts/keychain CLIs/
     cookie DBs), remote-fetch process-substitution exec (`bash <(curl …)`,
     `eval "$(curl …)"`, IEX download-string), and single-line install→fetch→exec
     chains.

3. **Hardened auditor** (`openrouter.ts`): reinforced the inert-DATA / never-obey
   contract (tool-poisoning standing directives no longer excused) and added 4
   few-shot exemplars beyond the original 3 — hidden-unicode override → malicious,
   base64 decode-and-execute → malicious, tool-poisoning description-mismatch →
   malicious, and a **benign-but-scary README → safe** (the FP guard for the prod
   hello-world over-flag). Transport invariants (forced JSON, `reasoning.enabled:
   false`, retry, `coerceRisk → suspicious`) unchanged. Model output stays
   advisory; the host `scoreRisk()` still computes the trusted verdict.

## Verification (evidence, not claims)

- **Deterministic suite:** DB-free lib suite **182 passed** (incl. canonical
  fixtures, 28-case cross-cutting `prefilter.redteam.test.ts`, and per-module
  positive+negative tests). `tsc --noEmit` exit 0. CI on the push = **success**.
- **The 13 failing api tests** are 100% DB-only (`PrismaClientInitializationError:
  DATABASE_URL` — pure environment, pass in CI with ephemeral Postgres). Not L2.

- **REAL model end-to-end** (no mocks) — `audit.live.test.ts` against live
  OpenRouter `deepseek/deepseek-chat` (resolves to `deepseek-chat-v3`,
  `reasoning_tokens: 0` confirmed), real prefilter + 2 real passes + host verdict:

  | Case | Verdict | Evidence |
  |---|---|---|
  | benign declared Fly deploy | **safe** | 0 findings |
  | benign README (hello-world style) | **safe** | 0 findings |
  | malicious cred-exfil | **malicious** | instruction-override, credential-access, exfiltration |
  | semantic-only exfil (no regex signature) | **malicious** | excessive-agency/regex + instruction-override·exfiltration·credential-access·social-engineering /llm |

  → The prod hello-world false-positive **does not recur**; the model **catches a
  pure-prose attack the regex can't**, and the new `override` rule fires alongside
  it (regex + model defense-in-depth).

### How to run the real test (opt-in; CI skips it)
```bash
cd apps/api   # OPENROUTER_API_KEY etc. live in apps/api/.env (gitignored)
export OPENROUTER_API_KEY=… AUDIT_MODEL=deepseek/deepseek-chat \
       OPENROUTER_BASE_URL=https://openrouter.ai/api/v1 RUN_LIVE_AUDIT=1
pnpm exec vitest run src/lib/audit.live.test.ts --reporter=verbose
```

## 🎯 ROOT CAUSE of the prod benign→suspicious over-flag (PROVEN) — FIXED

Diagnosed by probing the real Railway prod env (`railway run`, no secrets printed):

```
hasOpenRouterKey: true   AUDIT_MODEL: <unset>   AUDIT_TIMEOUT_MS: <unset(25000)>
```

**`AUDIT_MODEL` was unset in the Railway prod env.** `openrouter.ts` did
`const model = process.env.AUDIT_MODEL; if (!model) throw …`, so in prod **every
model pass threw instantly** (verified: 1–16 ms, zero HTTP calls) → both passes
fail → `passesHealthy=false` → `scoreRisk([], false) === 'suspicious'`. That is
the exact hello-world over-flag — and it meant the **entire LLM layer was silently
off in prod** (only the regex prefilter ran, so semantic-only attacks were missed).
NOT the prompt (the prompt is verified correct above), NOT a logic bug.

Proven end-to-end with the live test run **under the real prod env** (`railway run`):
- before: benign → `suspicious` (model never ran)
- after the fix (prod env, `AUDIT_MODEL` still unset there): benign → **`safe`**,
  malicious → **`malicious`**, semantic-only → **`malicious`** with real LLM findings.

**Fix (L2 lane, `openrouter.ts`, shipped):** a missing env var must never disable
the model layer — `model = process.env.AUDIT_MODEL || 'deepseek/deepseek-chat'`
(env still overrides, provider-agnostic) + bounded transient-retry on
408/425/429/5xx/network errors (abort-aware) so a single provider blip can't
fail-close a pass. So a redeploy of this code fixes prod even with the env var
still unset.

**Action — @jo:** redeploy (`railway up`) to pick up the fix; also set
`AUDIT_MODEL=deepseek/deepseek-chat` in the Railway env (belt-and-suspenders).

**Secondary, for L1 (owns `audit.ts`, not L2's to touch):** one pass still hit the
25 s `AUDIT_TIMEOUT_MS` on a slow input. Worth hardening so a slow-but-fine pass
can't flip a clean skill to `suspicious`: allow `safe` when prefilter found nothing
**and ≥1 pass completed cleanly**, and/or raise `AUDIT_TIMEOUT_MS`.

## For L4-eval
All 37 detections + 4 few-shots are listed in comms (`log/natnael.md`, the
"NEW DETECTIONS" post) for scoring. `prefilter.redteam.test.ts` is a ready-made
benign/attack corpus you can extend.
