# Codex-Audit Handoff

Last updated: 2026-06-03 ~15:15 CEST by `codex-audit` (Claude session continuing the lane; Codex hit its limit).

## ⭐ LATEST RE-AUDIT — GO/NO-GO (main `285cd45`)

**Verdict: the PRODUCT is demo-ready. The only real risk is operational (DB resets).**

GREEN — verified LIVE today:
- **A. Local gates** (`285cd45`): typecheck + api 277✓/4 skipped + web 143✓ + mcp 5✓ + web/mcp builds. Node 26 engine warning only.
- **B. GATE both-ways** (the core promise): LIVE — safe `GET /:id/files` → 200 **with** files; malicious → 403 **no** `files`. Verified **authed** (Bearer JWT) AND **unauth**. Fail-closed: missing ids → 404, no leak.
- **C. Two-subdir onboarding (#1 demo-blocker)** — FIXED (`abf9029`) and proven LIVE in the signed-in browser: both `…/tree/main/skills/changelog-genie` and `…/deploy-preview` get DISTINCT labels, BOTH stage → BOTH stream (`POST /api/skills/import/stream`) → BOTH land. Verdicts correct: changelog-genie→malicious/quarantined (finding: instruction-override), deploy-preview→safe. Source+unit also green (onboardingLogic.test.ts:53-63, 143/143).
- **D. No dup drift** — after import + full reload, library = exactly 2, no phantom rows.
- **E. MCP `@jenz-ai/skills-mcp@0.1.1`** — gate holds through the published MCP: `pull_skill(safe)`→ok+2 files, `pull_skill(malicious)`→ok:false, NO files, "7 finding(s)…". `get_skill` returns taxonomy (0.1.0 additionalProperties bug fixed). Canonical `npx -y @jenz-ai/skills-mcp@0.1.1` boots clean (first attempt raced the download).
- **G (core)** — real API data (no fixture fallback), real SSE progress+verdict, console 0 errors on the real flow.

RISKS / FINDINGS (raise — not the auditor's to fix):
- 🔴 **DB RESETS** keep wiping the demo workspace (twice today, ~12:58 + a re-seed by ~13:06). Verified with a VALID token (`/api/me`→200): authed `GET /api/skills`=0 while unauth=2. **Jo (DB/API): FREEZE resets through the demo.** This is the ONLY thing that breaks the live demo.
- 🟡 **Workspace-scope split**: the live LIST is auth/workspace-scoped — signed-in dashboard=the user's workspace, unauth/MCP=global. The re-seed landed in the GLOBAL scope, not the demo workspace → signed-in dashboard starts empty while unauth/MCP see 2. Don't demo dashboard + MCP together (different libraries). `list_managed_skills` (token-less MCP)→0.
- 🟡 **Stale-row → broken detail**: when a list row points to a server-deleted skill, `SkillDetail` renders a broken fallback (placeholder "Files 3: SKILL.md/examples//refs/" + "Couldn't load skill details/files: not_found") instead of a clean "removed" state. Web fix (refetch + 404 handling), not caching.
- 🟡 **UI detail-page render** (safe files / malicious findings on the DETAIL page): verified via API+MCP (data correct); UI detail render not re-confirmed because a wipe interrupted the click. Low risk for a clean continuous import→click.
- ℹ️ **Client-only controls** (install-to-local, sidebar add-skill, approve-anyway) still in source — not gate leaks, not truthful flows → don't click on stage.
- ⚠️ **Caching is NOT a fix** (Natnael asked): caching the gate `/:id/files` verdict serves STALE security verdicts (unsafe for a gate) and worsens the stale-list→404 bug. Real fix = stop resets + seed into the demo workspace.

Demo (proven): signed in → Import & audit → both subdir URLs → catches the injection, passes the benign. **GO iff resets are frozen.**

Live ids drift on every re-seed; re-fetch before relying on any. As of ~13:06 the GLOBAL (unauth) rows were `cmpy2s5yp0024k42r80aavy9g` (safe) + `cmpy2r096001tk42rg2tmlnh0` (malicious); the signed-in demo workspace was empty.

---

_Below: earlier handoff state (pre-`285cd45`), kept for context._

Last updated (prior): 2026-06-03 ~14:10 CEST by `codex-audit`.

This file is the handoff for the audit lane only. It is not the team-lead handoff.
Do not overwrite `docs/codex-team-lead-handoff.md`; that belongs to the Codex
team-lead session.

## Identity And Scope

- Role: `codex-audit`, independent reviewer.
- Worktree used: `jenz-mcp-qa`.
- Expected comms identity: `COMMS_AGENT=codex-audit`.
- Default mode: read-only auditing, except this handoff doc and comms updates
  when explicitly asked.
- Output should be findings, exact repros, file:line diagnoses, and comms posts.
  Do not fix Jo/Remi/Natnael lane code unless the human explicitly changes the
  scope.

## Required Startup For The Next Session

Run this first:

```bash
cd /Users/jeshiseifo/Desktop/AdaVentures-Hackathon-2026-06-03/jenz-mcp-qa
sed -n '1,220p' AGENTS.md
cd ~/jenz-team-comms && ./comms.sh read --all
cd /Users/jeshiseifo/Desktop/AdaVentures-Hackathon-2026-06-03/jenz-mcp-qa
git fetch origin main
git status --short --branch
git log --oneline --max-count=10 origin/main
```

Then pull/rebase this worktree before retesting:

```bash
git pull --rebase --autostash origin main
```

Use comms for every material status:

```bash
cd ~/jenz-team-comms
COMMS_AGENT=codex-audit ./comms.sh send "..."
```

## Current Local State At Handoff

- Pulled source head: `89a9a95 fix(web): reconcile imported skill by id-or-name (no stale duplicate)`.
- Recent commits after my full browser pass:
  - `8863def fix(web): honest import staging - stop fabricating skill names`
  - `808789e release(mcp): publish @jenz-ai/skills-mcp@0.1.1`
  - `89a9a95 fix(web): reconcile imported skill by id-or-name`
- Worktree note: `.playwright-mcp/` is an untracked local browser artifact from
  Playwright inspection. It is not source.
- I did not rerun the full local suite after pulling `89a9a95`; rerun it before
  declaring latest main green.

## Last Full Audit I Personally Verified

The last full signed-in browser/API/MCP audit I completed was posted to comms at
`2026-06-03 13:54` for `ed0e2b4`. Summary:

- Local gates passed after sequential reinstall/generate:
  - `pnpm install`
  - `pnpm --filter @jenz/api exec prisma generate`
  - `pnpm -r typecheck`
  - `pnpm --filter @jenz/api test` -> 277 passed, 4 skipped
  - `pnpm --filter @jenz/web test` -> 140 passed
  - `pnpm --filter @jenz/web build`
  - `pnpm --filter @jenz-ai/skills-mcp test` -> 5 passed
  - `pnpm --filter @jenz-ai/skills-mcp build`
- Local shell is Node v26; repo wants Node >=22 <23. This produced warnings but
  did not break the sequential local gates.
- Do not run `prisma generate` concurrently with API tests in this worktree. It
  reproduced a local Prisma dylib corruption (`segment '__TEXT' load command
  content extends beyond end of file`). Sequential `pnpm install --force &&
  prisma generate && api test` cleared it.
- Live API at `https://api.jenz.ai/api` was real and gate-safe:
  - `GET /skills` was 8 at that time.
  - `deploy-preview` safe -> `GET /files` 200 with files.
  - `changelog-genie` malicious -> `GET /files` 403 and no `files` field.
- Signed-in browser at `https://skills.jenz.ai/#`:
  - console clean after reload and detail checks.
  - safe detail fetched real `GET /:id` and `GET /:id/files` and rendered
    `SKILL.md` + `scripts/deploy.sh`.
  - malicious detail fetched real `GET /:id`, rendered 7 findings and taxonomy
    badges, and withheld files.
  - browser import stream was real for `changelog-genie`: `POST
    /api/skills/import/stream` returned SSE progress and a `verdict{id,taxonomy}`.

## Live State Checked After Latest Pull

After pulling to `89a9a95`, I ran a quick live list check:

```text
GET https://api.jenz.ai/api/skills -> 200, count=9
```

Current extra row:

```text
id: cmpy0hvc3002dod2qbxx1zwr2
name: agent-skills
risk: malicious
```

This is the repo-root aggregate row. It should be pruned before a clean demo
unless the team intentionally changes the demo library target.

## Current Findings And Status

### 1. Browser Two-Subdir Onboarding Still Appears Open

Severity: demo-blocking until re-audited or script avoids it.

What I verified at `ed0e2b4`:

- Entering both requested subdir URLs:
  - `https://github.com/jenz-ai/agent-skills/tree/main/skills/changelog-genie`
  - `https://github.com/jenz-ai/agent-skills/tree/main/skills/deploy-preview`
- produced one staged GitHub source, not two.
- the actual stream body contained only `changelog-genie`.

After `8863def`, fake staged skill names were removed. That fixes the "fake
names" problem, but source still dedupes by repo label:

- `apps/web/src/screens/onboardingLogic.ts:48-57` still turns any GitHub path
  into `org/repo`.
- `apps/web/src/screens/Onboarding.tsx:189-203` still skips a second GitHub
  source when `g.label === label`.
- `apps/web/src/screens/ImportModal.tsx:120-133` has the same pattern.

So the exact "paste two subdir URLs from the same repo" flow likely still drops
the second URL. Re-audit this in the signed-in browser after the latest Pages
deploy. If still broken, fix is to dedupe by full URL or by path-aware label,
not only `org/repo`.

### 2. Browser Duplicate After Import Was Source-Fixed, Needs Live Re-Audit

Status: source fix landed at `89a9a95`; not browser-reverified by me.

Original issue:

- streaming `changelog-genie` replaced the stored DB row, but browser appended
  a new in-memory row because it upserted by id only.
- API stayed clean, but browser showed 9 rows and stale row click 404ed.

Current source:

- `apps/web/src/App.tsx:115-123` now reconciles imported skills by `id OR name`.

Next auditor should run one signed-in import and verify the in-session browser
count does not drift. If a live import creates or replaces rows, list the row
ids/slugs in comms and prune if needed.

### 3. MCP Published Package Was Fixed, Needs Published-Package Smoke

Status: source and npm version now look correct, but live published smoke still
needs a final run.

Original issue:

- source fix `67b40b3` added optional `taxonomy` to MCP `auditedShape`.
- npm was still `@jenz-ai/skills-mcp@0.1.0`; published tarball lacked
  `taxonomy` while output schema had `additionalProperties:false`.

Current state after Remi:

- `apps/mcp/package.json` is `0.1.1`.
- `npm view @jenz-ai/skills-mcp version` returns `0.1.1`.

Run this next:

```bash
cd /tmp
node --input-type=module <<'NODE'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'codex-audit-mcp-011', version: '0' });
await client.connect(new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@jenz-ai/skills-mcp@0.1.1'],
  env: { ...process.env, JENZ_API: 'https://api.jenz.ai/api' },
}));
try {
  const list = await client.callTool({ name: 'list_managed_skills', arguments: {} });
  const skills = list.structuredContent?.skills ?? [];
  const safe = skills.find((s) => /deploy-preview/i.test(s.name));
  const mal = skills.find((s) => /changelog-genie/i.test(s.name));
  const safeGet = await client.callTool({ name: 'get_skill', arguments: { id: safe.id } });
  const malGet = await client.callTool({ name: 'get_skill', arguments: { id: mal.id } });
  const safePull = await client.callTool({ name: 'pull_skill', arguments: { id: safe.id } });
  const malPull = await client.callTool({ name: 'pull_skill', arguments: { id: mal.id } });
  console.log(JSON.stringify({
    count: skills.length,
    safeGetKeys: Object.keys(safeGet.structuredContent ?? {}),
    malGetKeys: Object.keys(malGet.structuredContent ?? {}),
    safePull: safePull.structuredContent,
    malPull: malPull.structuredContent,
  }, null, 2));
} finally {
  await client.close();
}
NODE
```

Expected:

- `get_skill` accepts taxonomy.
- safe `pull_skill` returns files.
- malicious `pull_skill` returns no files.

### 4. Live Library Is Currently Not The Clean 8

Status: live-verified after latest pull.

Current live count is 9 with extra root aggregate `agent-skills`. This is not a
gate leak, but it can confuse the demo. Coordinate with Jo before pruning,
because Remi also raised a product question about empty per-user workspaces.

### 5. Client-Only Controls Still Exist For Now

Status: known issue, not a gate leak.

Jo briefly claimed a de-desktop removal pass but then posted that he dropped it
for now. The controls remain in source for demo:

- install-to-local-tool UI
- sidebar add-skill
- approve-anyway

Do not click them on stage. They do not bypass the server gate, but they are
not truthful product flows.

## Core Invariants To Re-Verify

Use these every time latest main or prod changes:

```bash
pnpm install
pnpm --filter @jenz/api exec prisma generate
pnpm -r typecheck
pnpm --filter @jenz/api test
pnpm --filter @jenz/web test
pnpm --filter @jenz/web build
pnpm --filter @jenz-ai/skills-mcp test
pnpm --filter @jenz-ai/skills-mcp build
```

Live API:

```bash
curl -s https://api.jenz.ai/healthz
curl -s https://api.jenz.ai/api/skills
```

Gate invariant:

- safe row: `GET /api/skills/:id/files` must be 200 and include `files`.
- non-safe row: `GET /api/skills/:id/files` must be 403 and must not include
  a `files` field.

Browser:

- signed-in `skills.jenz.ai` should show real API data, not fixtures.
- console should be clean.
- import should call `https://api.jenz.ai/api/skills/import/stream`.
- stream should emit progress and verdict events.
- safe detail should fetch `/files` and render files.
- malicious detail should render findings/taxonomy and withhold files.

## Suggested Prompt For The Next Claude Session

Use something like this:

```text
You are taking over the codex-audit lane, not the team-lead lane. Work in
/Users/jeshiseifo/Desktop/AdaVentures-Hackathon-2026-06-03/jenz-mcp-qa.
Read AGENTS.md, then ~/jenz-team-comms via ./comms.sh read --all, then
docs/codex-audit-handoff.md. Do not overwrite docs/codex-team-lead-handoff.md.
Stay read-only except comms/audit-handoff updates unless Natnael explicitly
asks for code changes. Pull latest main. Re-run the audit checklist against
latest main and prod. Focus on: two-subdir onboarding dedupe, browser import
no duplicate after 89a9a95, npm @jenz-ai/skills-mcp@0.1.1 live get_skill/pull
smoke, live library count/prune state, and gate invariant safe 200 files /
malicious 403 no files. Post results to comms with
COMMS_AGENT=codex-audit and commit hash.
```

