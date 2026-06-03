import { defineConfig } from 'vitest/config';

/**
 * Eval-lane vitest config — scoped to the L4 eval unit tests.
 *
 * The package's `apps/api/vitest.config.ts` limits discovery to `src/**` +
 * `test/**` (so a `build` doesn't double-run tests from `dist/`), which means
 * the default `pnpm --filter @jenz/api test` does NOT pick up `eval/*.test.ts`.
 * We don't edit that file (out of the eval lane); instead the scorer unit test
 * runs against this config:
 *
 *   pnpm --filter @jenz/api exec vitest run --config eval/vitest.config.ts
 */
export default defineConfig({
  test: {
    include: ['eval/**/*.test.ts'],
  },
});
