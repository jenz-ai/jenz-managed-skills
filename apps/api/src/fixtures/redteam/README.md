# Red-team demo fixtures (L3 — Natnael's lane)

The demo's **attack cases**: labeled AI-agent skills the judges watch the gate catch.
Six `RedteamFixture` exports (`{ label, expectedRisk, rationale, raw }`) + an
idempotent HTTP-only seed/verify script. Owned by L3 — **only Natnael edits these
files**; everyone else `import`s them read-only.

- Fixtures: `apps/api/src/fixtures/redteam/*.ts`
- Barrel: `import { redteamFixtures } from '@/fixtures/redteam'` (relative `../src/fixtures/redteam`)
- Seed/verify: `apps/api/scripts/seed-demo.ts` (`pnpm --filter @jenz/api seed:demo`)
- Deterministic test: `redteam.test.ts` (runs in CI, no network/DB)

## The 6 cases

| # | Label | Verdict (floor) | Regex evidence the host scores it on |
|---|-------|-----------------|--------------------------------------|
| 1 | Clean deploy helper (benign control) | `safe` | none — rsync/ssh/git/npm, `rm -rf ./dist` |
| 2 | Credential exfiltration | `malicious` | 2× **critical** exfiltration (secret read \| curl) |
| 3 | Instruction-override / prompt injection | `malicious` | 2× **high** instruction-override (hidden "ignore previous instructions") |
| 4 | Tool poisoning (silent tool redirect) | `suspicious` | 1× **medium** untrusted-fetch (remote tool-override `.yaml`) |
| 5 | Obfuscated payload (token + stager) | `malicious` | hardcoded `ghp_` + `curl\|bash` (**high**) + base64 `eval` + U+200B |
| 6 | Borderline: remote install-then-bash | `suspicious` | 1× **high** suspicious-download (single `curl\|sh`) |

## How verdicts are computed (and why `expectedRisk` is a FLOOR)

Each fixture is authored so the **deterministic Layer-1 regex prefilter ALONE**
yields `expectedRisk` (`scoreRisk(prefilter(raw), passesHealthy=true)`). That's the
guarantee — it holds even if the open-weight model is slow/unavailable.

The semantic model (DeepSeek ×2) then runs and can **only ADD findings, never
downgrade** the host verdict. So the live verdict is always **≥ the floor**:

- `safe` fixtures stay `safe` (benign control has 0 findings; the model adds none).
- `malicious` fixtures stay `malicious`.
- `suspicious` fixtures (tool-poisoning, borderline) **sometimes escalate to
  `malicious`** when the model digs out extra semantic evidence — non-deterministic
  at temperature 0.4, but always **≥ suspicious**, so the gate always blocks them.

The seed reflects this: it checks **gate semantics**, not naive equality — a `safe`
fixture must stay exactly safe (any escalation = a false-positive bug); an attack
must be caught **at least as strictly** as its floor (escalation = `✔↑`, still a pass).

### Verified results (real DeepSeek via OpenRouter, healthy passes)

```
1 Clean deploy helper   safe        (0 findings)          ✔  — stable across 3+ runs
2 Credential exfil      malicious   (regex 2 + model 8)   ✔
3 Prompt injection      malicious   (5 findings)          ✔
4 Tool poisoning        suspicious  (usually 1; occasionally malicious/9) ✔ / ✔↑
5 Obfuscated stager     malicious   (4 findings)          ✔
6 Borderline installer  suspicious  (usually 1; occasionally malicious/3) ✔ / ✔↑
→ 6/6 caught correctly
```

The deterministic regex floor (CI test) is rock-solid; the model only ever
escalates the two `suspicious` cases, never leaks an attack to `safe`.

## Running the REAL pipeline (no mocks, no regex-only)

Env (`OPENROUTER_API_KEY`, `AUDIT_MODEL=deepseek/deepseek-chat`, `DATABASE_URL`) is
injected by Railway — **never paste the key**:

```bash
# Real model, env injected by Railway (preferred):
railway run -- bash -c 'PORT=8083 pnpm --filter @jenz/api start'   # in one shell
railway run -- env JENZ_API=http://localhost:8083/api pnpm --filter @jenz/api seed:demo

# Or against the live deploy (domain migrated 2026-06-03: api.jenz.ai, was skills.jenz.ai):
JENZ_API=https://api.jenz.ai/api pnpm --filter @jenz/api seed:demo
```

`AUDIT_TIMEOUT_MS` defaults to 25s/pass; bump to ~45s for headroom so a slow pass
doesn't fail-closed. The deterministic floor test never needs the model:

```bash
pnpm --filter @jenz/api exec vitest run src/fixtures/redteam/redteam.test.ts
```

## Cross-lane notes (READ before touching `routes/skills.ts`)

- **Inline import shape (converged with Remi/MCP).** The live `POST /api/skills/import`
  is GitHub-ref-only, so inline fixtures can't persist to the library yet. When
  implementing the inline path, accept the shape the **MCP `submit_skill` already
  posts** so one implementation serves both it and this seed:
  ```jsonc
  { "source": { "type": "inline", "name": "<str>", "files": [{ "path": "<str>", "content": "<str>" }] } }
  // github variant (already works): { "source": { "type": "github", "url": "<str>" } }
  ```
  Build `RawSkill = { slug: slugify(name), name, files, source: 'inline' }` → run the
  same `auditSkill` + persist. This seed already posts that inline shape (then falls
  back to github `{source}` then legacy `{ref}`), so it works the moment the path lands.

- **The prod `benign → suspicious` over-flag is NOT a fixture or scoring bug.**
  Root cause: in prod a model pass fails/times out → `passesHealthy=false` →
  `scoreRisk([], false)` fails closed to `suspicious` on **zero evidence**. Locally,
  with a working OpenRouter key + adequate timeout, the benign control is `safe`
  **deterministically (verified 3×)**. Fix is in the **deploy/engine lane**: ensure
  the prod `OPENROUTER_API_KEY` is valid + funded and `AUDIT_TIMEOUT_MS` is adequate
  — not a change to `scoreRisk` or the fixtures. The benign control doubles as the
  regression pin for this.
