/**
 * Eval runner — the orchestrator.
 *
 *   pnpm --filter @jenz/api exec tsx eval/runner.ts
 *
 * Feeds every `EvalCase` through the REAL engine (`auditSkill`, imported
 * read-only) and emits the pitch artifact `eval/REPORT.md` plus raw
 * `eval/results.json`.
 *
 * DUAL-MODE in one run (the headline comparison):
 *   1. BASELINE = regex-only — `OPENROUTER_API_KEY` is unset for the pass, so
 *      `auditSkill` runs the L1 prefilter + host scoreRisk only.
 *   2. FULL = L1 + DeepSeek V4 ×2 — the key is restored and (if present) every
 *      case is audited again through the full open-weight engine.
 *   No key at all ⇒ only the baseline runs (noted in the report).
 *
 * Fail-closed throughout: a case that throws is recorded as `pending` (blocked),
 * never crashing the run, so one bad case can't void the whole eval.
 *
 * Env flags:
 *   EVAL_REGEX_ONLY=1  skip the full pass (fast / CI)
 *   EVAL_LIMIT=N       only the first N cases (smoke)
 *   EVAL_STRICT=1      exit(1) if the headline mode misses the targets
 *   AUDIT_TIMEOUT_MS   per model-pass timeout (defaulted generously below)
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { auditSkill } from '../src/lib/audit';
import { ALL_CASES } from './corpus/index';
import { scoreMode, type CaseResult, type ModeSummary } from './scorer';
import { renderReport, type ReportMeta } from './report';
import { isBlocked, isCorrect, type EvalCase } from './types';

// Generous default so a real (slow) model pass isn't falsely failed-closed by
// the engine's per-pass timeout — a single slow benign pass would otherwise
// fail-close to `suspicious` and inflate the false-positive rate. Only set when
// the operator hasn't already. (Observed real DeepSeek passes up to ~25s.)
process.env.AUDIT_TIMEOUT_MS ??= '60000';

const REGEX_ONLY = process.env.EVAL_REGEX_ONLY === '1';
const STRICT = process.env.EVAL_STRICT === '1';
const LIMIT = Number(process.env.EVAL_LIMIT) || 0;
const FULL_CONCURRENCY = 6;
const TARGETS = { recall: 0.95, fpRate: 0.2 } as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const evalDir = __dirname;

/** Audit one case, fail-closed: any throw → `pending` (blocked) with 0 findings. */
async function runCase(c: EvalCase): Promise<CaseResult> {
  const started = Date.now();
  try {
    const audited = await auditSkill(c.raw);
    return {
      id: c.id,
      category: c.category,
      label: c.label,
      risk: audited.risk,
      blocked: isBlocked(audited.risk),
      correct: isCorrect(c.label, audited.risk),
      findings: audited.findings.length,
      ms: Date.now() - started,
    };
  } catch (err) {
    // Engine threw → cannot certify safe → fail closed. Record as pending.
    process.stderr.write(
      `  ! ${c.id} threw, recording fail-closed (pending): ${(err as Error).message}\n`,
    );
    return {
      id: c.id,
      category: c.category,
      label: c.label,
      risk: 'pending',
      blocked: true,
      correct: c.label === 'attack',
      findings: 0,
      ms: Date.now() - started,
    };
  }
}

/** Run all cases sequentially — used for the fast regex-only baseline. */
async function runSequential(cases: readonly EvalCase[]): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (const c of cases) out.push(await runCase(c));
  return out;
}

/** Bounded async pool — used for the model-bound full pass. Hand-rolled, no deps. */
async function runPooled(
  cases: readonly EvalCase[],
  concurrency: number,
): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= cases.length) return;
      results[i] = await runCase(cases[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, cases.length) }, worker);
  await Promise.all(workers);
  return results;
}

function compactTable(s: ModeSummary): string {
  return (
    `  recall ${(s.recall * 100).toFixed(1)}% (${s.attacksBlocked}/${s.attacks})` +
    ` · FP ${(s.falsePositiveRate * 100).toFixed(1)}% (${s.benignBlocked}/${s.benign})` +
    ` · false-safe ${s.falseSafe}` +
    ` · mal ${s.maliciousVerdicts}/susp ${s.suspiciousVerdicts}`
  );
}

async function main(): Promise<void> {
  const cases = LIMIT > 0 ? ALL_CASES.slice(0, LIMIT) : ALL_CASES;
  process.stdout.write(`\nJenz eval — ${cases.length} case(s)${LIMIT ? ` (limited from ${ALL_CASES.length})` : ''}\n`);

  const modes: ModeSummary[] = [];
  const rawResults: Record<string, CaseResult[]> = {};

  // ── Mode 1: regex-only baseline (key removed for the pass) ──
  const savedKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  process.stdout.write('\n[1/2] regex-only baseline (L1 prefilter + host scoreRisk)…\n');
  const baselineResults = await runSequential(cases);
  if (savedKey) process.env.OPENROUTER_API_KEY = savedKey;

  const baseline = scoreMode(baselineResults, 'regex-only');
  modes.push(baseline);
  rawResults['regex-only'] = baselineResults;
  process.stdout.write(compactTable(baseline) + '\n');

  // ── Mode 2: full open-weight engine (only if a key exists and not skipped) ──
  const runFull = Boolean(savedKey) && !REGEX_ONLY;
  if (runFull) {
    process.stdout.write('\n[2/2] full engine (L1 + DeepSeek V4 ×2)…\n');
    const fullResults = await runPooled(cases, FULL_CONCURRENCY);
    const full = scoreMode(fullResults, 'full');
    modes.unshift(full); // full first for the report's headline
    rawResults['full'] = fullResults;
    process.stdout.write(compactTable(full) + '\n');
  } else {
    const why = !savedKey
      ? 'no OPENROUTER_API_KEY — regex-only only'
      : 'EVAL_REGEX_ONLY=1 — full pass skipped';
    process.stdout.write(`\n[2/2] skipped (${why}).\n`);
  }

  // ── Persist ──
  const meta: ReportMeta = {
    generatedAt: new Date().toISOString(),
    model: process.env.AUDIT_MODEL ?? 'deepseek/deepseek-chat',
    corpusSize: ALL_CASES.length,
    modes,
    targets: TARGETS,
  };

  writeFileSync(join(evalDir, 'results.json'), JSON.stringify({ meta, rawResults }, null, 2));
  const report = renderReport(meta);
  writeFileSync(join(evalDir, 'REPORT.md'), report);

  // Headline = full if it ran, else baseline.
  const headline = modes.find((m) => m.mode === 'full') ?? modes[0];
  process.stdout.write('\n' + report.split('\n').slice(0, 4).join('\n') + '\n');
  process.stdout.write(`\nWrote eval/REPORT.md + eval/results.json\n`);

  if (STRICT && headline) {
    const recallOk = headline.recall >= TARGETS.recall;
    const fpOk = headline.falsePositiveRate <= TARGETS.fpRate;
    if (!recallOk || !fpOk) {
      process.stderr.write(
        `\nEVAL_STRICT: targets missed (recall ${(headline.recall * 100).toFixed(1)}% / FP ${(headline.falsePositiveRate * 100).toFixed(1)}%).\n`,
      );
      process.exit(1);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`eval runner failed: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
