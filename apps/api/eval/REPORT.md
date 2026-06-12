# Jenz Managed Skills — Detection-Rate Eval

> **Detects 100.0% of known prompt-injection attacks at 0.0% false-positive rate** — open-weight, on a 59-case corpus (45 attacks · 14 benign controls).

## What this measures

Jenz is a security gate: a skill is **released** to the agent only when its
verdict is `safe` (`GET /api/skills/:id/files` → `200`, else `403`). So a skill is
**detected / blocked** exactly when the host verdict is anything other than `safe`
(`suspicious`, `malicious`, or fail-closed `pending`). **Recall** = the share of
known attacks the gate blocks; **false-positive rate** = the share of legitimate
(benign) skills it wrongly blocks. The **false-safe rate** isolates the worst
failure — an attack the gate would have released as `safe`.

## Results

| Metric | Full open-weight engine (L1 regex + DeepSeek V4 ×2) | Regex-only baseline (L1 prefilter) |
| --- | --- | --- |
| Recall (attacks blocked) | 100.0% (45/45) | 64.4% (29/45) |
| False-positive rate (benign) | 0.0% (0/14) | 0.0% (0/14) |
| False-safe rate (attack → safe) | 0.0% (0/45) | 35.6% (16/45) |
| Blocked as malicious | 30 | 6 |
| Blocked as suspicious | 15 | 23 |
| Benign passed (gate let through) | 100.0% (14/14) | 100.0% (14/14) |

_The verdict is computed by the **host** (`scoreRisk`) on evidence — the model only
returns findings as data. The two modes show what the regex prefilter catches alone
vs. what the full open-weight engine adds on top._

### Detection rate by attack category

| Attack category | Regex-only | Full engine | Lift |
| --- | --- | --- | --- |
| Direct injection | 50.0% (4/8) | 100.0% (8/8) | **+50pt** |
| Indirect injection | 28.6% (2/7) | 100.0% (7/7) | **+71pt** |
| Tool poisoning | 33.3% (2/6) | 100.0% (6/6) | **+67pt** |
| Exfiltration | 87.5% (7/8) | 100.0% (8/8) | **+13pt** |
| Destructive | 71.4% (5/7) | 100.0% (7/7) | **+29pt** |
| Obfuscation | 100.0% (9/9) | 100.0% (9/9) | — |

## Metric targets

| Target | Threshold | Actual | Result |
| --- | --- | --- | --- |
| Recall on attacks | ≥ 95.0% | 100.0% | ✅ PASS |
| False-positive rate on benign | ≤ 20.0% | 0.0% | ✅ PASS |
| False-safe rate (catastrophic) | = 0% | 0.0% | ✅ PASS |

## Notes

- **Real engine, real open-weight model — no mocks.** Every verdict is produced by the production `auditSkill` pipeline (L1 regex prefilter → two live model passes that read the skill bytes as inert DATA → host `scoreRisk` decides on evidence). The model never decides the verdict; it only returns findings. Figures are from a live run and may shift by a case or two between runs (double-pass, temperature 0.4).
- **False-positive rate is measured on 14 hard-negative benign skills** (legitimate skills full of imperative language: formatters, test runners, deploys with declared tokens). A larger benign set would tighten the interval.
- **Zero false-safe this run** — no attack was released as `safe`.

## Corpus provenance

The 59-case corpus is grounded in published prompt-injection and
agent-security benchmarks and advisories:

- **OWASP Top 10 for LLM Applications** — LLM01 Prompt Injection, LLM02/LLM06 sensitive-information / excessive-agency.
- **AgentDojo** — agent prompt-injection benchmark (direct + indirect).
- **InjecAgent** — indirect prompt injection in tool-using agents.
- **MITRE ATLAS** — AML.T0051 (LLM Prompt Injection) and related tactics.
- **Snyk ToxicSkills** — real-world malicious-skill / tool-poisoning advisories.

Categories: direct injection, indirect injection, tool poisoning, exfiltration,
destructive commands, obfuscation, plus a hard-negative **benign control set** to
measure false positives.

## Reproduce

```bash
# from the repo root
pnpm install
pnpm --filter @jenz/api exec prisma generate

# full run (regex-only baseline + full DeepSeek×2 engine if OPENROUTER_API_KEY is set)
pnpm --filter @jenz/api exec tsx eval/runner.ts

# fast / CI: regex-only, no model calls
EVAL_REGEX_ONLY=1 pnpm --filter @jenz/api exec tsx eval/runner.ts

# smoke: first 3 cases only
EVAL_LIMIT=3 pnpm --filter @jenz/api exec tsx eval/runner.ts
```

_Model: `deepseek/deepseek-chat` · generated 2026-06-03T09:34:46.203Z._
