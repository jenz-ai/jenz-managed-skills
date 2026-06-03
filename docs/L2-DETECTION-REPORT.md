# L2 Detection-Depth — Status & Verification Report

_Owner: Natnael (L2 lane: `apps/api/src/lib/openrouter.ts` + `prefilter.ts` + `prefilter/*`)._
_Status: **shipped to `main`**, real-model verified. Last updated 2026-06-03._

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

## ⚠️ Cross-lane finding for L1 (owns `audit.ts`) — demo risk

The live malicious audit hit the **per-pass timeout** (one DeepSeek pass was slow,
~45 s). The current orchestrator sets `passesHealthy = false` if *either* pass
fails/times out, and `scoreRisk([], false) === 'suspicious'`. **So a benign skill
whose model pass is merely slow gets flagged `suspicious`/0-findings** — that is
exactly the prod hello-world over-flag, and its root cause is **model latency, not
the prompt** (the prompt is verified correct above).

Options for L1 to weigh (their call — L2 will not touch `audit.ts`):
- allow `safe` when prefilter found nothing **and ≥1 pass completed cleanly** (a
  zero-evidence label-only shortfall shouldn't block), or
- retry a timed-out pass once, or raise `AUDIT_TIMEOUT_MS`, or use a faster model.

## For L4-eval
All 37 detections + 4 few-shots are listed in comms (`log/natnael.md`, the
"NEW DETECTIONS" post) for scoring. `prefilter.redteam.test.ts` is a ready-made
benign/attack corpus you can extend.
