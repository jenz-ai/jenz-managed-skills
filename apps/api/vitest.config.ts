import { defineConfig } from 'vitest/config';

// Only run TypeScript test sources. Without this, vitest's default globs also
// pick up compiled copies under dist/ after a `build`, running every test twice
// (and racing the DB-backed tests against shared rows). Keep it to src/ + test/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
