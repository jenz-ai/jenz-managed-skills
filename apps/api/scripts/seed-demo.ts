/**
 * seed-demo.ts — drive the 6 red-team fixtures through a LIVE/local API.
 *
 * For each fixture, in demo order:
 *   1. VERIFY  — POST /audit { raw } → the REAL host verdict, checked against the
 *      fixture's expectedRisk (= its deterministic regex floor). The gate check is
 *      severity-aware: a `safe` fixture MUST stay safe (any escalation is a false
 *      positive); an attack fixture MUST be caught at least as strictly as its
 *      floor — the semantic model may escalate (e.g. suspicious→malicious), never
 *      downgrade. So a benign control regression OR an attack slipping to `safe`
 *      fails the run; honest model escalation does not.
 *   2. PERSIST — POST /api/skills/import (best-effort) so the fixture lands in the
 *      library with a REAL host verdict for the UI. Tries the canonical inline
 *      shape the MCP also posts → github → legacy {ref}, so ONE server-side inline
 *      path serves both this seed and Remi's submit_skill.
 *
 * HTTP-ONLY: no prisma, no DB, no @jenz/api imports. Node 22 global fetch.
 * Idempotent (import replaces any prior row for the slug). One fixture failing
 * never aborts the run. Persistence is a cross-lane dependency and never fails
 * the run; only a gate miss (benign escalated, or an attack released) exits 1.
 *
 * Real-model run (env injected by Railway, no secrets in the shell):
 *   railway run -- pnpm --filter @jenz/api seed:demo
 * Or against a running API:
 *   JENZ_API=https://api.jenz.ai/api pnpm --filter @jenz/api seed:demo
 */
import type { AuditedSkill, RawSkill, Risk } from '@jenz/shared';
import { redteamFixtures } from '../src/fixtures/redteam';

const JENZ_API = process.env.JENZ_API ?? 'http://localhost:8083/api';
const workspace = process.env.JENZ_WORKSPACE;

const base = JENZ_API.replace(/\/+$/, '');
const origin = base.replace(/\/api$/, '');
const healthUrl = `${origin}/healthz`;
const auditUrl = `${origin}/audit`;
const importUrl = `${base}/skills/import`;

const headers = {
  'content-type': 'application/json',
  ...(workspace ? { 'x-jenz-workspace': workspace } : {}),
};

/** safe < suspicious < malicious — used for the severity-aware gate check. */
const RISK_ORDER: Record<string, number> = { pending: 0, safe: 1, suspicious: 2, malicious: 3 };

/**
 * Gate semantics for the demo, not naive equality:
 *  - a `safe` fixture is "caught correctly" iff it stays exactly safe (any
 *    escalation on a benign control is a FALSE POSITIVE — the prod over-flag bug);
 *  - an attack fixture is "caught" iff the verdict is at least as strict as its
 *    floor (the semantic model may escalate, never downgrade; `safe` = a leak).
 */
function isCaught(expected: Risk, actual: string): boolean {
  if (expected === 'safe') return actual === 'safe';
  return (RISK_ORDER[actual] ?? 0) >= (RISK_ORDER[expected] ?? 99);
}

interface ImportResult {
  id?: string;
  risk?: string;
}

interface Row {
  label: string;
  expected: Risk;
  actual: string;
  caught: boolean;
  escalated: boolean;
  libId: string;
}

function isAuditedSkill(x: unknown): x is AuditedSkill {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.risk === 'string' && Array.isArray(r.findings);
}

/** Preflight: confirm the API is reachable before doing real work. */
async function checkHealth(): Promise<void> {
  try {
    const res = await fetch(healthUrl);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✘ API not reachable at ${origin} (${healthUrl}): ${msg}`);
    console.error('  Start it (PORT=8083 pnpm dev:api / railway run) or set JENZ_API to a live base.');
    process.exit(1);
  }
}

/** POST /audit { raw } → the host-computed AuditedSkill (verdict ground truth). */
async function verify(raw: RawSkill): Promise<AuditedSkill> {
  const res = await fetch(auditUrl, { method: 'POST', headers, body: JSON.stringify({ raw }) });
  const json: unknown = await res.json();
  if (!res.ok || !isAuditedSkill(json)) {
    throw new Error(`audit ${res.status}: ${JSON.stringify(json).slice(0, 120)}`);
  }
  return json;
}

/**
 * Persist into the library, trying each import body shape in turn until one is
 * accepted. Inline first (the exact shape the MCP's submit_skill posts, so one
 * server-side inline path serves both), then a github {source}, then legacy
 * top-level {ref}. Stops on the first non-shape error (≠400/404).
 */
async function persist(raw: RawSkill): Promise<ImportResult> {
  const bodies: unknown[] = [
    { source: { type: 'inline', name: raw.name, files: raw.files } },
    ...(raw.sourceRef ? [{ source: { type: 'github', url: raw.sourceRef } }] : []),
    ...(raw.sourceRef ? [{ ref: raw.sourceRef }] : []),
  ];

  let status = 0;
  let json: unknown = {};
  for (const body of bodies) {
    const res = await fetch(importUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    json = await res.json().catch(() => ({}));
    if (res.ok) return json as ImportResult;
    status = res.status;
    if (status !== 400 && status !== 404) break; // a real error, not a shape rejection
  }
  const msg = ((json as { error?: string }).error ?? `status ${status}`).slice(0, 80);
  throw new Error(`${status}: ${msg}`);
}

async function main(): Promise<void> {
  console.log(`Seeding ${redteamFixtures.length} red-team fixtures → ${origin}\n`);
  await checkHealth();

  const rows: Row[] = [];
  let persisted = 0;

  for (const fx of redteamFixtures) {
    const expected = fx.expectedRisk;
    let actual = '—';
    let caught = false;
    let escalated = false;
    let libId = '—';

    try {
      const audited = await verify(fx.raw);
      actual = audited.risk;
      caught = isCaught(expected, actual);
      escalated = caught && expected !== 'safe' && actual !== expected;
      const mark = caught ? '✔' : '✘';
      const note = escalated ? ` (model escalated ${expected}→${actual})` : '';
      console.log(`${mark} ${fx.label}  expected≥${expected} actual=${actual} findings=${audited.findings.length}${note}`);

      try {
        const imported = await persist(fx.raw);
        libId = imported.id ?? '—';
        persisted += 1;
        console.log(`  ↳ library id=${libId} risk=${imported.risk ?? '?'}`);
      } catch (pe) {
        const msg = pe instanceof Error ? pe.message : String(pe);
        console.log(`  ↳ library persist unavailable (${msg}) — pending inline-import path (cc Jo/Remi shape)`);
      }
    } catch (ve) {
      const msg = ve instanceof Error ? ve.message : String(ve);
      console.log(`✘ ${fx.label}  verify failed: ${msg}`);
    }

    rows.push({ label: fx.label, expected, actual, caught, escalated, libId });
  }

  printSummary(rows, persisted);
  const missed = rows.filter((r) => !r.caught).length;
  process.exit(missed > 0 ? 1 : 0);
}

function printSummary(rows: Row[], persisted: number): void {
  // Pad OR truncate to a fixed width so columns line up regardless of label length.
  const w = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  console.log('\n── SUMMARY ──────────────────────────────────────────────');
  console.log(`${w('label', 40)} ${w('expected', 11)} ${w('actual', 11)} gate   libId`);
  for (const r of rows) {
    const gate = r.caught ? (r.escalated ? '✔↑' : '✔ ') : '✘ ';
    console.log(`${w(r.label, 40)} ${w('≥' + r.expected, 11)} ${w(r.actual, 11)} ${gate}   ${r.libId}`);
  }
  const caught = rows.filter((r) => r.caught).length;
  const escalated = rows.filter((r) => r.escalated).length;
  console.log('─────────────────────────────────────────────────────────');
  console.log(
    `${caught}/${rows.length} caught correctly` +
      (escalated ? ` (${escalated} model-escalated ↑, still blocked)` : '') +
      `   ${persisted}/${rows.length} persisted`,
  );
}

main().catch((e) => {
  console.error('seed-demo crashed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
