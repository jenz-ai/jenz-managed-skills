/**
 * prune-demo-library.ts — wipe smoke junk from the live library, keeping ONLY
 * the demo set. Use right before a demo: MCP `submit_skill` smokes and ad-hoc
 * imports leave stray rows (e.g. "poison exfil", "pretty formatter") that
 * clutter `list_managed_skills` and the dashboard folders.
 *
 * KEEP rule — a skill is kept iff:
 *   - its NAME matches one of the 6 red-team fixtures (src/fixtures/redteam), OR
 *   - its name starts with "agent-skills/" (the external corpus: deploy-preview,
 *     changelog-genie, …).
 * We match on name, not slug: seed-demo persists via the inline import path,
 * which derives the slug from the name (slugify(name)), so persisted slugs
 * diverge from the fixtures' own raw.slug — names are the stable key.
 * Everything else is treated as junk and deleted. SkillFile + Finding rows
 * cascade automatically (schema: onDelete: Cascade).
 *
 * SAFETY: DRY RUN BY DEFAULT — prints the keep/delete plan and writes nothing.
 * Pass --apply to actually delete. Reads DATABASE_URL from apps/api/.env (point
 * it at the prod Supabase pooled connection string to prune prod).
 *
 *   pnpm --filter @jenz/api exec tsx scripts/prune-demo-library.ts           # dry run
 *   pnpm --filter @jenz/api exec tsx scripts/prune-demo-library.ts --apply   # delete
 *
 * Or against prod env injected by Railway (no secrets in the shell):
 *   railway run -- pnpm --filter @jenz/api exec tsx scripts/prune-demo-library.ts --apply
 */
import 'dotenv/config'; // load apps/api/.env (DATABASE_URL) — Prisma Client doesn't at runtime
import { PrismaClient } from '@prisma/client';
import { redteamFixtures } from '../src/fixtures/redteam';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
// --all wipes the ENTIRE library (keep nothing) — used to reset to an empty,
// per-workspace start. Without it, the demo keep-set (fixtures + corpus) is kept.
const ALL = process.argv.includes('--all');

// The keep-set: red-team fixture NAMES ∪ anything from the agent-skills corpus.
// With --all, nothing is kept.
const keepNames = new Set(redteamFixtures.map((fx) => fx.raw.name));
const isCorpus = (name: string) => name.startsWith('agent-skills/');
const shouldKeep = (s: { slug: string; name: string }) =>
  !ALL && (keepNames.has(s.name) || isCorpus(s.name));

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

async function main(): Promise<void> {
  const skills = await prisma.skill.findMany({
    select: { id: true, slug: true, name: true, risk: true },
    orderBy: { createdAt: 'asc' },
  });

  const keepers = skills.filter(shouldKeep);
  const junk = skills.filter((s) => !shouldKeep(s));

  console.log(`\nLibrary: ${skills.length} skills — KEEP ${keepers.length}, DELETE ${junk.length}\n`);
  console.log('KEEP:');
  for (const s of keepers) console.log(`  ✓ ${pad(s.risk, 11)} ${pad(s.name, 38)} [${s.slug}]`);
  console.log('\nDELETE:');
  if (junk.length === 0) console.log('  (none)');
  for (const s of junk) console.log(`  ✘ ${pad(s.risk, 11)} ${pad(s.name, 38)} [${s.slug}]`);

  if (junk.length === 0) {
    console.log('\nLibrary is already clean — nothing to prune.');
    return;
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — no changes written. Re-run with --apply to delete ${junk.length} skill(s).`);
    return;
  }

  const res = await prisma.skill.deleteMany({ where: { id: { in: junk.map((s) => s.id) } } });
  console.log(`\n✓ Deleted ${res.count} skill(s) (findings + files cascaded). Library now ${keepers.length} skills.`);
}

main()
  .catch((e) => {
    console.error('prune-demo-library crashed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
