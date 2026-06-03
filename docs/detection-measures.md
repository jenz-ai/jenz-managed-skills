# Detection Measures — what Jenz checks skills against

> **Internal engineering reference.** The single place to look up *what* the audit
> detects, *how severe* each thing is, and *how findings become a verdict*.
>
> This is the **settled contract**, not the derivation. For *why* each decision was
> made (sources, benchmarks, reconciliation), read the research:
> `Research-hackathon/Jenz managed skills/07-Research-Synthesis/_synthesis/detection-engine.md`.
> For *where* it lives in code, see [Pointers](#pointers). If this doc and the code
> disagree, **the code wins** — fix this doc.

## What we check, and why it's safe to check it

A *skill* is markdown (`SKILL.md`) plus bundled `scripts/`. We treat **every byte as
inert DATA** — we prefilter it, quote it, and classify it; we never execute or obey it.
The audit looks for two families of problem in that data:

1. **Prompt injection** — text that tries to hijack the downstream agent (override its
   instructions, social-engineer the user, hide instructions in Unicode/obfuscation).
2. **Malicious code** — scripts that steal secrets, exfiltrate data, run destructive
   commands, or fetch-and-execute remote payloads.

The **host computes the verdict, never the model.** The auditor LLM returns *evidence*
(findings as JSON); deterministic host code (`scoreRisk()`) decides
`safe | suspicious | malicious`. This defeats "trick the model into returning safe" —
a manipulated model verdict is overridden by the findings, the regex layer, or pass
disagreement.

## The 13 finding types

These are the measures — the catalogue of things a finding can be. The set is **frozen**
(the `type` enum lives in the auditor JSON schema + the `taxonomy.ts` keys — note
`Finding.type` in `@jenz/shared` is a plain `string`, not a TS enum). "Caught by" shows the
earliest layer that detects it: **L1** = deterministic regex prefilter (instant, free),
**L3** = semantic LLM auditor (reasoning the regex can't do).

| `type` | What it means | Typical severity | Caught by |
|---|---|---|---|
| `instruction-override` | Text telling the downstream agent to ignore system/developer/user policy, change trust boundaries, or prioritise the skill over higher-priority instructions | high → critical | L1 + L3 |
| `description-mismatch` | Implementation/instructions materially exceed or contradict the declared purpose or declared capabilities | medium → high | **L3 only** |
| `social-engineering` | Pressures the user or agent to reveal secrets, approve risky actions, or trust unverifiable claims | medium → high | **L3 only** |
| `hidden-unicode` | Zero-width, bidi-override, or tag characters used to conceal meaning or code | medium | L1 + L3 |
| `obfuscation` | base64/hex/escapes/string-splitting/heredocs concealing risky behaviour | medium → high | L1 + L3 |
| `exfiltration` | Sends local data, secrets, files, prompts, memory, logs, or credentials to a remote destination | critical | L1 + L3 |
| `credential-access` | Reads/copies/searches for secrets, tokens, SSH keys, cloud creds, browser data, wallet files, auth stores | high → critical | L1 + L3 |
| `destructive-cmd` | Deletes/overwrites/chmods/wipes/kills important local or remote resources | high → critical | L1 + L3 |
| `suspicious-download` | Downloads **and executes** remote content — `curl\|bash`, `wget\|sh`, remote installers, unsigned binaries, password-zip staging | high | L1 + L3 |
| `hardcoded-secret` | Embedded API keys, tokens, passwords, private keys, cookies in the skill itself | high | L1 + L3 |
| `excessive-agency` | Requests/uses broader permissions, paths, commands, hosts, or autonomy than the task needs | medium → high | **L3 only** |
| `logic-bomb` | Triggers on time/branch/host/username/file-presence/env state to do something harmful | high → critical | **L3 only** |
| `untrusted-fetch` | Fetches remote prompts/markdown/scripts/configs/data that could later influence or be executed by the agent | medium → high | L1 + L3 |

> The four **L3-only** types (`description-mismatch`, `social-engineering`,
> `excessive-agency`, `logic-bomb`) are exactly the ones regex can't see — they need
> intent reasoning and declared-capability comparison. This is where the LLM pass earns
> its place over a pure scanner.

### What the L1 regex layer assigns today

The prefilter (`prefilter.ts`) is the front gate. It emits findings with `detector: 'regex'`
at these fixed severities:

- `exfiltration` **critical** — a secret-path *and* a network sink on the same line (taint).
- `credential-access` **high** — a secret path alone (no sink).
- `instruction-override`, `suspicious-download` (pipe-to-shell **or** password-archive),
  `destructive-cmd`, `hardcoded-secret` — **high**.
- `hidden-unicode`, `obfuscation`, `untrusted-fetch` — **medium**.

The LLM auditor can raise any of these to `critical` with evidence, and adds the four
semantic-only types. Findings from both sources are merged and deduped by
`(type, file, line, quote-prefix)`, keeping the highest severity.

## Severity rubric

Assigned per finding (verbatim from the auditor prompt):

- **critical** — clear evidence of credential theft, exfiltration, destructive action,
  logic bomb, or remote code/instruction execution used for compromise.
- **high** — strong evidence of risky undeclared capability use, prompt override,
  untrusted remote fetch, pipe-to-shell install, or broad secret access.
- **medium** — concerning concealment, capability mismatch, hidden unicode, social
  engineering, or unnecessary broad permissions *without* direct compromise.
- **low** — weak or incomplete signal with limited security impact.

## Risk rubric (the model's *advisory* view)

The model emits a `risk` too, but it is **advisory only** — used solely as a
self-consistency signal between the two passes. The trusted verdict is computed by the
host (next section). For reference, the model's rubric:

- **malicious** — any critical finding; OR instruction-override combined with
  credential-access / exfiltration / destructive-cmd / suspicious-download /
  untrusted-fetch; OR multiple high-severity findings indicating intentional compromise.
- **suspicious** — any high finding short of malicious; OR multiple mediums; OR a
  material declared-capability mismatch.
- **safe** — no findings, or only clearly benign behaviour matching declared purpose.

## The scoring gate — how findings become the verdict

`scoreRisk(findings, passesAgree)` in `score.ts` is **the gate**, and it lives in exactly
one place. `findings` = the merged regex + LLM-pass-A + LLM-pass-B set; `passesAgree` =
true iff both LLM passes returned the same advisory `risk`. Policy, **fail-closed**:

```
malicious   ← any finding is critical
            OR ≥2 high findings        (both passes independently flagged a high → intentional)
suspicious  ← the two passes disagree  (disagreement never auto-promotes to safe)
            OR any single high finding
            OR any medium finding
safe        ← no medium-or-higher findings AND both passes agree
            (i.e. zero findings, or only low-severity ones)
```

Consequences worth internalising:

- **`safe` is the hard case, not the easy one.** It requires *no medium-or-higher finding*
  *and* pass agreement. Anything ambiguous falls to `suspicious` or `malicious`.
- **A lone `low` returns `safe`** — deliberate, and why the gate is "no medium-or-higher"
  rather than "zero findings". L1 assigns `low` only to weak signals, and `safe` still
  demands pass agreement. This avoids over-quarantining benign deploy skills (a real deploy
  skill legitimately contains `curl` + a token reference).
- **Only `safe` skills are installable.** `suspicious | malicious` → quarantine, never
  written to the live skills folder. The gate is enforced once, on the host verdict —
  never on a model-emitted label.

## The pipeline at a glance

Defense-in-depth, fail-closed, run per skill. No single layer is the security claim.

| Layer | Does | Status |
|---|---|---|
| **L0** Normalize + segment | NFKC normalise; flag zero-width/bidi/tag chars; decode HTML entities; split into ≤512-token windows; separate markdown from code. (The 512-token trap is the #1 gotcha — long files silently truncate and miss tail payloads.) | Planned / partial |
| **L1** Regex + Unicode prefilter | The rule pack in `prefilter.ts`. Instant, free, explainable; primary catcher for malicious *code* patterns. **Triage, not a security claim** on its own (regex alone caught ~1/60 NL attacks in benchmarks). | **Implemented** |
| **L2** Discriminative classifiers | PIGuard + Prompt-Guard-2-86M, sub-second NL-injection second opinion. | **Off** the cloud path — local-sovereignty / post-MVP only |
| **L3** Semantic auditor ×2 | DeepSeek V4 via OpenRouter, double-pass, **tool-less, non-thinking, forced JSON**, spotlit. Catches instruction/data confusion, intent-vs-declared mismatch, taint reasoning, the four semantic-only types. | **Implemented** (`openrouter.ts`, `audit.ts`) |
| **L4** Code SAST | Bandit/Semgrep/GuardDog taint rules. **Folded into L1** for the build. | Folded into L1 |
| **L6** `scoreRisk()` — the gate | Deterministic host scoring → the trusted verdict → quarantine decision. | **Implemented** (`score.ts`) |

**Committed build = L0 + L1 + L3 + L6.** Cloud↔local is a backend toggle (swap the
OpenRouter base URL/model for local Ollama), not a second engine — the detection logic is
identical.

**Declared-capabilities manifest** is the primary false-positive control: an optional
`declared_capabilities` input (network hosts, allowed env vars, read/write paths, allowed
commands) lets the auditor distinguish a scoped legit deploy from an undeclared one.
Without it the demo "drowns in FPs" on legit deploy/install skills.

## Standards crosswalk

Each finding type maps to recognised standards — attached **host-side** after parsing
(the model never emits these IDs; that would bloat tokens and risk hallucinated IDs).
This mirrors `taxonomy.ts` exactly; that file is the source of truth.

| `type` | OWASP LLM 2025 | OWASP Agentic (ASI) | OWASP Skills (AST) | MITRE ATLAS |
|---|---|---|---|---|
| instruction-override | LLM01 | ASI01, ASI06 | AST01 | AML.T0051 |
| description-mismatch | LLM03 | ASI04 | AST04 | AML.T0010.001 |
| social-engineering | LLM01, LLM02 | ASI03 | AST04 | AML.T0052 |
| hidden-unicode | LLM01 | ASI06 | AST08 | *(defense-evasion precursor — no clean leaf)* |
| obfuscation | LLM01, LLM03 | ASI04, ASI06 | AST08 | *(defense-evasion precursor — no clean leaf)* |
| exfiltration | LLM02, LLM06 | ASI02, ASI03 | AST01, AST03 | AML.T0025, AML.T0057 |
| credential-access | LLM02, LLM06 | ASI03 | AST03 | AML.T0055, AML.T0037 |
| destructive-cmd | LLM05, LLM06 | ASI05 | AST01, AST03 | AML.T0050, AML.T0011 |
| suspicious-download | LLM03, LLM05 | ASI04, ASI05 | AST02 | AML.T0010.001, AML.T0050 |
| hardcoded-secret | LLM02 | ASI03 | AST03 | AML.T0055 |
| excessive-agency | LLM06 | ASI02, ASI03 | AST03 | AML.T0050, AML.T0011, AML.T0053 |
| logic-bomb | LLM05, LLM06 | ASI01, ASI05 | AST01 | AML.T0050 |
| untrusted-fetch | LLM01, LLM03 | ASI04, ASI06 | AST02, AST08 | AML.T0051, AML.T0036 |

> ATLAS IDs are verified against MITRE ATLAS (T0051 LLM Prompt Injection, T0055 Unsecured
> Credentials, T0025 Exfiltration, T0057 LLM Data Leakage, T0050 Command & Scripting
> Interpreter, T0011 User Execution, T0037 Data from Local System, T0010.001 ML Supply
> Chain Compromise, T0052 Phishing, T0053 LLM Plugin Compromise, T0036 Data from
> Information Repositories). `hidden-unicode` / `obfuscation` have **no** clean ATLAS leaf
> — don't invent one.

## Honest limits

State these plainly; they're the OWASP/NCSC posture and a strength, not a weakness.

- **Static auditing can't catch runtime-only behaviour** — dynamic imports,
  downloaded-then-executed payloads, privilege-dependent actions. Obfuscated/staged
  payloads can defeat both SAST and LLM review (fundamental undecidability).
- **Verdict manipulation is real.** Tool-less inference removes the *blast radius* (the
  auditor can't run a shell or exfiltrate) but not the risk that hostile text sways the
  judgment — adversarial LLM-as-judge ASR reaches ~74% on some open models. Our mitigation
  is the **host-computed verdict + fail-closed scoring + regex backstop**, not model trust.
- **No defense survives an adaptive attacker** who knows the strategy. The honest framing:
  **"defense in depth that makes evasion harder and costlier — not prompt injection
  solved."**
- **Two-pass agreement is an engineering control**, not a benchmarked theorem for this
  exact task. Same-model double-pass is the weak form of independence; a different-family
  second pass is the strong form (post-MVP).

## Pointers

- **Why / derivation:** `…/07-Research-Synthesis/_synthesis/detection-engine.md` (sources,
  benchmarks, reconciliation, the verbatim auditor system prompt + 3 few-shots).
- **Finding types & schema:** the auditor prompt + JSON schema in `detection-engine.md`
  (the frozen 13-type set); the `Severity`/`Risk` enums in `packages/shared/types.ts`
  (`Finding.type` there is `string`).
- **L1 regex detectors:** `apps/api/src/lib/prefilter.ts` (+ `prefilter/{override,obfusc,exfil}.ts`).
- **L3 auditor + transport:** `apps/api/src/lib/openrouter.ts`, orchestration in `audit.ts`.
- **The gate:** `apps/api/src/lib/score.ts` (`scoreRisk`).
- **Standards crosswalk:** `apps/api/src/lib/taxonomy.ts`.
- **Test plan / attack fixtures:** `…/07-Research-Synthesis/_synthesis/test-plan.md`,
  `attack-fixtures.md`.
</content>
</invoke>
