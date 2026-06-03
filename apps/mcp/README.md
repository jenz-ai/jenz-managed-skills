# @jenz-ai/skills-mcp

Thin MCP server: submit skills for a security audit, pull back only the `safe` ones.
No detection logic here — it's a gate-faithful client over the jenz HTTP API.

## Tools
- `submit_skill` — import (github url or inline files) + audit → verdict
- `get_skill` — fetch a stored verdict by id
- `list_managed_skills` — browse/search the library (filters: category, risk, query)
- `pull_skill` — **gated**: returns files only when `risk === 'safe'`, else `{ ok:false }`

## Run locally (against the mock)
```bash
pnpm --filter @jenz-ai/skills-mcp mock     # terminal A — mock API on :8787
pnpm --filter @jenz-ai/skills-mcp build
```

## Add to Claude Code (stdio)
Published — npx one-liner (recommended):
```bash
claude mcp add jenz-skills -e JENZ_API=https://api.jenz.ai/api -- npx -y @jenz-ai/skills-mcp
```
From a local build (no publish needed):
```bash
pnpm --filter @jenz-ai/skills-mcp build
claude mcp add jenz-skills -e JENZ_API=https://api.jenz.ai/api -- node /ABSOLUTE/PATH/apps/mcp/dist/index.js
```
The API is currently open — no workspace token needed. `JENZ_API` defaults to the local
mock (`http://localhost:8787/api`) if unset, so set it to the live API for a real audit.

## Env
- `JENZ_API` — API base (default `http://localhost:8787/api`). Flip to Jo's URL when live.
- `JENZ_WORKSPACE` — workspace token sent as `x-jenz-workspace` (default `demo`).

## Smoke test (end-to-end gate proof)
Drives all 4 tools through a real stdio MCP client and asserts the gate. Defaults to an
in-process mock; point at a real backend by setting `JENZ_API`:
```bash
pnpm --filter @jenz-ai/skills-mcp smoke                                  # against the mock
JENZ_API=https://api.jenz.ai/api JENZ_WORKSPACE=<token> \
  pnpm --filter @jenz-ai/skills-mcp smoke                                # against the real API
```
Exits non-zero if any scenario fails (4 tools present, poison→blocked-no-files, safe→files, list).

## Demo runbook (the in-CLI half)
With the MCP added to Claude Code (mock or real API):
1. *"Audit and add the skill at github.com/…/poisoned-skill"* → `submit_skill` → **malicious** + the
   offending line → `pull_skill` → `{ ok:false }`. **Caught — nothing written.**
2. *"Add a safe formatter skill"* → `submit_skill` → **safe** → `pull_skill` → files returned →
   Claude writes them to `~/.claude/skills/…`. **Vetted skill flows in natively.**
3. *"Audit my local skill X"* → Claude reads its own `~/.claude/skills/X` files and passes them
   **inline** to `submit_skill`. (The agent is the bridge — no separate CLI.)
