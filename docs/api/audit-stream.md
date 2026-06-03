# `POST /audit/stream` — live audit over Server-Sent Events (SSE)

> **Lane L5 (Natnael / streaming).** Canonical reference for the streaming audit
> endpoint. Owner file: `apps/api/src/routes/audit-stream.ts` (+ its two test
> files). This doc is append-/replace-only by L5 — other lanes please read, don't
> edit, to keep it conflict-free.

## What it is

The same audit as `POST /audit`, but streamed. It opens an SSE stream and emits
the **real** scan steps as they happen — `prefilter → 2 semantic passes → host
score → verdict` — so the UI's "audit moment" animates from the actual pipeline
instead of faked timings. The host still computes the verdict (`scoreRisk()`);
the model only ever contributes findings as advisory data.

## Status — live & green (single source of truth for L5)

| | |
|---|---|
| Route | `apps/api/src/routes/audit-stream.ts` — Hono sub-app, handler on `POST '/'` |
| On `main` | ✅ (`80aeabb`, hardened `169c5e3`) |
| Mounted in `apps/api/src/app.ts` | ✅ `app.route('/audit/stream', …)` (landed `b143442`, the L1 session) |
| Live in prod | ✅ verified — `POST /audit/stream` → SSE `progress`×3 + `verdict` → `safe` |
| Tests / typecheck / CI | ✅ 8 lane tests + app mount test green; `tsc` clean; CI green |
| Real-model verified | ✅ real DeepSeek via `railway run` (full prod app): benign→`safe`, malicious→`malicious` (5 findings, `llm`+`regex`), timeout→`suspicious` (fail-closed) |
| Session | 🟢 **on standby** — no further changes unless asked (see the open item below) |

### Open item (parked, L5-owned) — taxonomy on the `verdict` event

`POST /audit` and `GET /api/skills/:id` return
`taxonomy: Record<findingType, { owaspLlm, owaspAgentic, owaspSkills, mitreAtlas }>`
(OWASP/MITRE badges). The SSE `verdict` event currently emits a **bare**
`AuditedSkill` (no `taxonomy`). **Non-blocking** — `apps/web` renders no taxonomy
badges yet, so the audit-moment demo doesn't need it.

**Trigger to un-park:** Jo confirms the live audit-moment UI will render taxonomy
badges off the SSE stream. Then L5 lands the additive one-liner on the verdict
emit (mirrors `audit.ts` + `skills.ts`), nothing else changes:

```ts
import { taxonomyMapFor } from '../lib/taxonomy';
await emit('verdict', { ...audited, taxonomy: taxonomyMapFor(audited.findings) });
```

Host-side, never persisted, does **not** touch the fail-closed / streaming logic.
No other lane needs to edit `audit-stream.ts`.

### Correction on record

An earlier L5 comms claim ("Railway `OPENROUTER_API_KEY` invalid/expired") was
**wrong — retracted.** Codex verified the key returns HTTP 200. The prod
benign→`suspicious` over-flag was caused by `AUDIT_MODEL` being unset + old
`openrouter.ts` throwing on a missing model; fixed by `f061e00` + Railway now
sets `AUDIT_MODEL`. **Do not rotate the key.**

## Request

- **Method/path:** `POST /audit/stream`
- **Header:** `content-type: application/json`
- **Body:** a `RawSkill` **or** `{ "raw": RawSkill }` — identical to `POST /audit`.

  ```ts
  // RawSkill (from @jenz/shared)
  { slug: string; name: string; files: { path: string; content: string }[];
    source: 'github'|'upload'|'mcp'|'inline'; sourceRef?: string }
  ```

> ⚠️ **Body shape differs from `POST /api/skills/import`.** Import uses the
> `{ source: { type, name, files } }` envelope. `/audit/stream` mirrors `/audit`:
> a bare `RawSkill` or `{ raw: RawSkill }`. The audit screen already has the
> skill's files, so just `POST { raw: { slug, name, source, files } }`.

Invalid JSON or an invalid `RawSkill` is rejected **before the stream opens** with
a normal `400 { "error": string }` (`application/json`, not a stream). So check
`res.ok` / `res.status` before you start reading frames.

## Response — SSE event contract

`Content-Type: text/event-stream` (+ `X-Accel-Buffering: no` so proxies don't
buffer the stream into one burst). Each frame is `event: <name>\ndata: <json>\n\n`:

| event | data payload | when |
|---|---|---|
| `progress` | `{ "message": string }` | once per real scan step, **live** |
| `verdict` | full `AuditedSkill` JSON | **exactly once**, on success; stream then closes |
| `error` | `{ "error": string }` | only if the audit throws — see [Fail closed](#fail-closed) |

`AuditedSkill` = `{ slug, name, risk, findings, description?, category? }` where
`risk ∈ 'safe'|'suspicious'|'malicious'` and each finding is
`{ type, severity, file, line, quote, detector:'regex'|'llm' }`.

Real `progress` messages (text is forwarded verbatim from the engine, not
hardcoded — don't pattern-match on it, just render it):

```
prefilter: scanning skill bytes
semantic audit: 2 tool-less passes        # (regex-only dev shows "regex-only mode (no OPENROUTER_API_KEY configured)")
semantic audit incomplete; fail-closed    # only on a model-pass failure/timeout
verdict: <risk> (<n> finding(s))
```

### Fail closed

A model outage **never** yields `safe`:

- A model pass that fails/times out → the host downgrades confidence and the
  **verdict** comes back `suspicious` (not an `error` event). You still get a
  normal `verdict` frame; just not `safe`.
- An unexpected throw inside the audit → an `error` frame and **no** `verdict`.

**Consumer rule:** treat *any* `error` frame, or a stream that ends without a
`verdict`, as **not safe** (show the quarantine / red state). Never infer success
from the absence of an error.

## Consuming it (frontend) — fetch + ReadableStream

`EventSource` is GET-only, so use `fetch` + a stream reader:

```ts
async function streamAudit(raw: RawSkill, onStep: (m: string) => void) {
  const res = await fetch('/audit/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error((await res.json()).error); // 400 path

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let verdict: AuditedSkill | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const event = frame.match(/event:\s*(.*)/)?.[1]?.trim();
      const data  = frame.match(/data:\s*([\s\S]*)/)?.[1]?.trim();
      if (event === 'progress') onStep(JSON.parse(data!).message);
      else if (event === 'verdict') verdict = JSON.parse(data!);
      else if (event === 'error')  throw new Error(JSON.parse(data!).error); // fail closed
    }
  }
  if (!verdict) throw new Error('stream ended without a verdict'); // fail closed
  return verdict;
}
```

### curl smoke

```bash
curl -N -X POST http://localhost:8085/audit/stream \
  -H 'content-type: application/json' \
  -d '{"raw":{"slug":"hello","name":"Hello","source":"upload","files":[{"path":"SKILL.md","content":"# Hello"}]}}'
```

## Mounting

L1 (Jo) owns `apps/api/src/app.ts`. Add, after the CORS middleware, next to the
other `app.route(...)` lines:

```ts
import auditStreamRoutes from './routes/audit-stream';
app.route('/audit/stream', auditStreamRoutes);
```

This yields `POST /audit/stream`. It's a separate Hono sub-app, so there's zero
collision with `app.route('/audit', auditRoutes)`. CORS already covers it
(`POST` + `OPTIONS` are allowed).

## Verification (real DeepSeek, no mocks)

Run live against the real model + real HTTP (`OPENROUTER_API_KEY`,
`AUDIT_MODEL=deepseek/deepseek-chat`):

| Case | Streamed steps | Verdict | Latency |
|---|---|---|---|
| Benign `fly-deploy` | prefilter → semantic 2-pass → verdict | `safe`, 0 findings | ~4s |
| Malicious ssh/aws-exfil | prefilter → semantic 2-pass → verdict | `malicious`, 5 findings (`llm`+`regex`, host-merged) | ~7s |
| Model timeout (`AUDIT_TIMEOUT_MS=1`) | … → `semantic audit incomplete; fail-closed` | `suspicious` (never `safe`) | <1s |

Automated: 8 tests in `audit-stream.test.ts` (+ `audit-stream.failclosed.test.ts`)
— happy path, exactly-one-verdict, progress-before-verdict ordering, real reader
streaming, 400s, and the fail-closed branch. `pnpm --filter @jenz/api typecheck`
clean; CI green on `80aeabb` + `169c5e3`.

## Ownership / don't-touch

- **L5 owns:** `apps/api/src/routes/audit-stream.{ts,test.ts,failclosed.test.ts}` + this doc.
- **L5 never edits:** `lib/audit.ts`, `lib/score.ts`, `app.ts`/`index.ts` (mount via comms request to L1).
