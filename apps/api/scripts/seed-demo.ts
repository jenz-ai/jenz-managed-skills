/**
 * seed-demo.ts — drive the 6 red-team fixtures through a LIVE/local API.
 *
 * For each fixture, in demo order:
 *   1. VERIFY  — POST /audit { raw } → assert host verdict === expectedRisk.
 *   2. PERSIST — POST /api/skills/import { raw } (best-effort) so the fixture
 *      lands in the library with a REAL host-computed verdict for the UI.
 *
 * HTTP-ONLY: no prisma, no DB, no @jenz/api imports. Node 22 global fetch.
 * Idempotent (import replaces any prior row for the slug). One fixture failing
 * never aborts the run. Exit 1 only on a VERDICT MISMATCH — persistence is a
 * known cross-lane dependency (Jo's gate/DB) and never fails the run.
 *
 * Run:  pnpm --filter @jenz/api seed:demo
 * Live: JENZ_API=https://skills.jenz.ai/api pnpm --filter @jenz/api seed:demo
 */
import type { AuditedSkill, RawSkill } from '@jenz/shared';
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

interface ImportResult {
  id?: string;
  risk?: string;
}

interface Row {
  label: string;
  expected: string;
  actual: string;
  match: boolean;
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
    console.error('  Start it (PORT=8083 pnpm dev:api) or set JENZ_API to a live base.');
    process.exit(1);
  }
}

/** POST /audit { raw } → the host-computed AuditedSkill (verdict ground truth). */
async function verify(raw: RawSkill): Promise<AuditedSkill> {
  const res = await fetch(auditUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ raw }),
  });
  const json: unknown = await res.json();
  if (!res.ok || !isAuditedSkill(json)) {
    throw new Error(`audit ${res.status}: ${JSON.stringify(json).slice(0, 120)}`);
  }
  return json;
}

/** POST /api/skills/import { raw } → {id,risk}, retrying with a GitHub ref on 400. */
async function persist(raw: { sourceRef?: string }): Promise<ImportResult> {
  let res = await fetch(importUrl, { method: 'POST', headers, body: JSON.stringify({ raw }) });
  if (res.status === 400 && raw.sourceRef) {
    res = await fetch(importUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: raw.sourceRef }),
    });
  }
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = ((json as { error?: string }).error ?? `status ${res.status}`).slice(0, 80);
    throw new Error(`${res.status}: ${msg}`);
  }
  return json as ImportResult;
}

async function main(): Promise<void> {
  console.log(`Seeding ${redteamFixtures.length} red-team fixtures → ${origin}\n`);
  await checkHealth();

  const rows: Row[] = [];
  let persisted = 0;

  for (const fx of redteamFixtures) {
    const expected = fx.expectedRisk;
    let actual = '—';
    let match = false;
    let libId = '—';

    try {
      const audited = await verify(fx.raw);
      actual = audited.risk;
      match = actual === expected;
      const mark = match ? '✔' : '✘';
      console.log(`${mark} ${fx.label}  expected=${expected} actual=${actual} findings=${audited.findings.length}`);

      try {
        const imported = await persist(fx.raw);
        libId = imported.id ?? '—';
        persisted += 1;
        console.log(`  ↳ library id=${libId} risk=${imported.risk ?? '?'}`);
      } catch (pe) {
        const msg = pe instanceof Error ? pe.message : String(pe);
        console.log(`  ↳ library persist unavailable (${msg}) — pending inline-import path (cc Jo)`);
      }
    } catch (ve) {
      const msg = ve instanceof Error ? ve.message : String(ve);
      console.log(`✘ ${fx.label}  verify failed: ${msg}`);
    }

    rows.push({ label: fx.label, expected, actual, match, libId });
  }

  printSummary(rows, persisted);
  const mismatches = rows.filter((r) => r.actual !== r.expected).length;
  process.exit(mismatches > 0 ? 1 : 0);
}

function printSummary(rows: Row[], persisted: number): void {
  // Pad OR truncate to a fixed width so columns line up regardless of label length.
  const w = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  console.log('\n── SUMMARY ──────────────────────────────────────────────');
  console.log(`${w('label', 40)} ${w('expected', 10)} ${w('actual', 10)} match  libId`);
  for (const r of rows) {
    console.log(`${w(r.label, 40)} ${w(r.expected, 10)} ${w(r.actual, 10)}  ${r.match ? '✔' : '✘'}    ${r.libId}`);
  }
  const matched = rows.filter((r) => r.match).length;
  console.log('─────────────────────────────────────────────────────────');
  console.log(`${matched}/${rows.length} verdicts matched   ${persisted}/${rows.length} persisted`);
}

main().catch((e) => {
  console.error('seed-demo crashed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
