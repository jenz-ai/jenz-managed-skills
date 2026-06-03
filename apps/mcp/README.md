# @jenz/mcp

Thin MCP server: submit skills for a security audit, pull back only the `safe` ones.
No detection logic here — it's a gate-faithful client over the jenz HTTP API.

## Tools
- `submit_skill` — import (github url or inline files) + audit → verdict
- `get_skill` — fetch a stored verdict by id
- `list_managed_skills` — browse/search the library (filters: category, risk, query)
- `pull_skill` — **gated**: returns files only when `risk === 'safe'`, else `{ ok:false }`

## Run locally (against the mock)
```bash
pnpm --filter @jenz/mcp mock     # terminal A — mock API on :8787
pnpm --filter @jenz/mcp build
```

## Add to Claude Code (stdio)
```bash
claude mcp add jenz-skills -- node /ABSOLUTE/PATH/apps/mcp/dist/index.js
# env: JENZ_WORKSPACE=<token>   JENZ_API=<api base url, defaults to http://localhost:8787/api>
```

## Env
- `JENZ_API` — API base (default `http://localhost:8787/api`). Flip to Jo's URL when live.
- `JENZ_WORKSPACE` — workspace token sent as `x-jenz-workspace` (default `demo`).
