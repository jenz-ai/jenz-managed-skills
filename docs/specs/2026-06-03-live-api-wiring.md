# Spec — Wire the web app to the live audit API

**Date:** 2026-06-03 · **Author:** Jo (+ Claude) · **Lane:** frontend (`apps/web`) only
**Status:** draft for approval

## Why

`skills.jenz.ai` is live but it is a **scripted mock**. Every verdict on screen is a
hardcoded fixture in `apps/web/src/data/skills.ts`; the audit screen runs on
`setTimeout` timers. There is **zero** network code in `apps/web/src` — it never
touches `api.jenz.ai`. We are a security tool; a faked audit is the worst possible
demo. The engine is real and green in prod (Natnael verified: `/audit`,
`/audit/stream`, the gate, seeded library). This spec makes the UI a real client of
it: **real audits, real skills in real folders, real findings + OWASP/MITRE badges,
and a gate that actually blocks malicious files.**

Out of scope (explicit): auth/login, multi-tenant workspaces, any change to
`@jenz/shared` or the API contracts (frozen + live), visual redesign. We swap the
data source; we keep the existing look.

## The live API contract (already deployed, do not change)

Base: `https://api.jenz.ai/api` (override via `VITE_API_BASE`).

| Method | Path | Returns |
|---|---|---|
| GET | `/skills?category=&risk=&query=` | `{ skills: ListItem[] }` — `{id,name,risk,category,description,findingsCount}` (summaries, **no files**) |
| GET | `/skills/:id` | `AuditedSkill & {id}` **with `taxonomy`** (OWASP LLM/Agentic/Skills + MITRE ATLAS keyed by finding type) |
| GET | `/skills/:id/files` | **THE GATE** — `200 {files:[{path,content}]}` iff `risk==='safe'`, else `403 {error,risk,reason}` |
| POST | `/skills/import` | persist + audit + return `AuditedSkill & {id}` (201). Sources: `{source:{type:'github',url}}`, `{source:{type:'inline',name,files}}`, or legacy `{ref}` string. GitHub fetch is server-side. |
| POST | `/audit/stream` | SSE: `progress {message}` ×N → one `verdict` (AuditedSkill) → or `error`. Ephemeral (not persisted). |

`@jenz/shared` shapes: `Risk = pending|safe|suspicious|malicious`, `Finding =
{type,severity,file,line,quote,detector}`, `Taxonomy =
{owaspLlm,owaspAgentic,owaspSkills,mitreAtlas}` (string[] each).

## The central problem: two `Skill` types

The web app's local `Skill` (`apps/web/src/state/types.ts`) is **not**
`@jenz/shared.AuditedSkill`. Differences that the adapter must bridge:

| web `Skill` | API `AuditedSkill` |
|---|---|
| `risk: safe\|suspicious\|malicious\|scanning\|queued` | `risk: pending\|safe\|suspicious\|malicious` |
| `findings[].sev: high\|medium\|low`, `.snippet: MdLine[]` | `findings[].severity: critical\|high\|medium\|low`, `.quote: string`, `.line`, `.file`, `.detector` |
| `category: string` (folder), `source: claude\|codex\|…`, `desc`, `skillMd: MdLine[]`, `files: number` | `category?`, `source` (github\|upload\|mcp\|inline) only on RawSkill, `description?`, no md lines |

**A pure, unit-tested adapter is the linchpin.** Everything else consumes it.

## Design decision — audit moment (DECIDED: live streaming, the wow factor)

The hero moment: the user kicks off the audit and **watches verdicts stream in** —
each skill shows live progress, slams to its real verdict, gets logged in the audit
list, and **drops into its folder at the same time**, so the workspace visibly fills
up in real time.

**Mechanism: `POST /audit/stream` per staged skill.**
- `progress` events → drive the existing scanning animation with **real** messages
  (prefilter → model → score), not fake timers.
- `verdict` event → the **host-computed** `AuditedSkill` (the trusted `scoreRisk()`
  runs server-side inside `auditSkill`, so the stream verdict's `risk` is the same
  value the gate would use — never model-emitted). On arrival we (a) log it in the
  audit screen and (b) add it to app state → it appears in its folder **live**.

**One audit per skill, persisted in the same call.** We add a streaming variant of
import (see Lane 0) so the single call streams progress, persists the verdict, and
backs the server gate. No double-audit, no stream-vs-DB mismatch.

**NEW endpoint — `POST /api/skills/import/stream`** (Lane 0, `routes/skills.ts` = our
lane). Body identical to `/skills/import` (`{source:{type:'github'|'inline', …}}` or
legacy `{ref}`). Behavior: persist row as `pending` (replacing any prior row for the
slug) → `auditSkill(raw, onProgress)` → update the row with the host-computed verdict
→ emit SSE, in order:
- `event: progress  data: {message}` — one per real scan step (live).
- `event: verdict   data: AuditedSkill & {id, taxonomy}` — host-computed, **persisted**,
  with the DB `id` and the `taxonomyMapFor` crosswalk. Exactly once on success.
- `event: error     data: {error}` — on any failure; row left non-safe. **Fail closed.**
Mirrors the existing `audit-stream.ts` SSE mechanics + `skills.ts` persist flow; reuses
`auditSkill`'s `onProgress` and `taxonomyMapFor` (both exist). Does **not** touch
`audit.ts` / `audit-stream.ts` (not our lane).

**The gate is uniform and real for every skill.** Because every skill — seeded or
freshly-streamed — is persisted, `SkillDetail` always uses the server gate
`GET /skills/:id/files` → real `200 {files}` / `403`. No client-side gating anywhere.

## Phases (each independently demo-valuable; ship in order)

**P0 — read path live (lowest risk, biggest immediate win).** The seeded library is
already on `api.jenz.ai`. Point Library + SkillDetail + the gate at it:
- `Library` → `GET /skills`, group by `category` into folders, real risk pills.
- `SkillDetail` → `GET /skills/:id` (real findings + **taxonomy badges**); "view
  files" → `GET /skills/:id/files` → real `200` (show files) / `403` (blocked state).
- App boots its skill list from the API instead of `data/skills.ts`.
- Result: "skills in real folders + the gate" is **real** with no import needed.

**P1 — live streaming audit moment (the wow), persisted.** Onboarding hands the real
staged sources (uploaded folder bytes → `SkillFile[]`; GitHub URL) to the app. The
Audit screen opens `POST /skills/import/stream` per skill: `progress` → live
animation; `verdict` → logged in the audit **and** dropped into its folder, live, with
the DB `id` + taxonomy. Skill is persisted → survives reload, reachable by the MCP,
and the real server gate applies.

## Lanes (file-disjoint, for the agent team)

Round 1 (parallel, file-disjoint): **Lane 0** (api) + **Lane 1** (web foundation).
Round 2 (parallel, against Lane 1's frozen exports + Lane 0's SSE contract):
**Lane 2** (read path) + **Lane 3** (audit moment). Then I integrate `App.tsx` wiring.

- **Lane 0 — streaming persist-import route (api, our lane).** Add
  `POST /skills/import/stream` to `apps/api/src/routes/skills.ts` per the contract
  above (persist pending → `auditSkill(raw, onProgress→emit)` → update row → emit
  `verdict` with `id` + `taxonomyMapFor` → fail-closed `error`). Reuse the existing
  `persistAuditRespond` logic + `audit-stream.ts` SSE shape. **TDD** in
  `skills.test.ts` (or a new `skills-import-stream.test.ts`): valid → progress+verdict
  persisted; bad body → 400; audit throw → `error` + row not safe. Does NOT touch
  `audit.ts` / `audit-stream.ts`. Independent of all web lanes.
- **Lane 1 — API client + adapter (web foundation).** NEW `apps/web/src/lib/api.ts`
  (`listSkills`, `getSkill`, `getSkillFiles` → throws typed `GateError` on 403,
  `streamImport(source, {onProgress, onVerdict, onError})` → consumes the Lane 0 SSE
  route; reads `import.meta.env.VITE_API_BASE`) + NEW
  `apps/web/src/lib/adapt.ts` (`auditedToSkill`, `listItemToSkill`, risk/severity/
  finding/category mappers — **pure**) + `api.test.ts` (mock `fetch`) + `adapt.test.ts`.
  **TDD.** Exports are the frozen interface the other lanes import.
- **Lane 2 — read path UI.** `screens/Library.tsx`, `screens/SkillDetail.tsx`
  (+ their `.test.ts`): swap props-from-fixtures for live fetches via Lane 1; render
  taxonomy badges; wire the gate in SkillDetail (files panel = `getSkillFiles`,
  catch `GateError` → blocked state).
- **Lane 3 — app state + streaming audit + onboarding.** `App.tsx`,
  `screens/Audit.tsx`, `screens/Onboarding.tsx`, `screens/onboardingLogic.ts`
  (+ tests): App loads seeded skills from `GET /skills` and merges in
  freshly-streamed ones from app state; Onboarding collects real sources (folder
  bytes → `SkillFile[]`, GitHub URL) and hands `RawSkill`s to the run; Audit opens
  `streamAudit` per skill, animates from `progress`, and on each `verdict` logs the
  row + adds the skill to its folder live. Gate fresh skills client-side on the
  host-computed risk. **TDD** the pure bits (status reducer, folder-merge, raw-skill
  builder from uploaded files).

`data/skills.ts` fixtures stay as the **fallback/empty-state seed** only (so an API
outage degrades gracefully, not to a white screen) — gated behind a load error.

## Build & deploy discipline

- Work on branch `feat/web-live-wiring` off `main` — **not** directly on `main`
  (main auto-deploys; no broken intermediate deploys to `skills.jenz.ai`).
- TDD throughout (RED→GREEN). `pnpm --filter @jenz/web test` + `typecheck` + `build`
  green before merge. Merge to `main` only when the full chain is green → one clean
  auto-deploy.
- `git pull` before push; post to comms on start + merge.

## Acceptance criteria

- [ ] `apps/web/src` makes real `fetch` calls to `VITE_API_BASE` (default
      `api.jenz.ai/api`); no screen renders a hardcoded verdict.
- [ ] Library shows the live seeded skills grouped into real folders with real risk pills.
- [ ] SkillDetail shows real findings **and OWASP/MITRE taxonomy badges** from `GET /skills/:id`.
- [ ] The gate is real: opening a `safe` skill's files → contents shown; a
      `suspicious`/`malicious` skill → blocked state (the `403` is exercised, not faked).
- [ ] `POST /skills/import/stream` exists: streams `progress`, persists, emits
      `verdict` with `id` + `taxonomy`, fail-closed `error`; covered by API tests.
- [ ] Audit screen streams each skill live, resolves rows to the **real** engine
      verdict, and the skill drops into its folder as it resolves (P1).
- [ ] A streamed skill is **persisted** — survives reload and is listed by `GET /skills`
      (and therefore pullable via the MCP).
- [ ] Adapter + client are unit-tested; `pnpm --filter @jenz/web test`/`typecheck`/`build` green.
- [ ] Graceful degradation: API error → visible error/empty state, never a crash or a fake verdict.

## Risks / verification items

- `fetchSkillFromGitHub` (server) behavior on a **multi-skill repo root** (the demo
  corpus `jenz-ai/agent-skills` has 8 skills in subdirs) — verify whether it returns
  one skill or needs per-subdir refs; Lane 3 confirms against `apps/api/src/lib/github.ts`.
- SSE `verdict` event currently omits `taxonomy` (P1/B only) — not on the P0/P-A path.
- Uploaded folder file size — cap total bytes posted inline to avoid huge requests.
