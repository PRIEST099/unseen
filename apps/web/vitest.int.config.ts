import { defineConfig } from 'vitest/config'

/**
 * Browser-backed integration tests (`*.int.test.ts`): each one drives a real Chromium audit, so
 * they run one file at a time in a single forked process with generous timeouts.
 * Run with `npm run test:int -w apps/web`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts', 'src/**/*.int.test.tsx'],
    exclude: ['e2e/**', 'dist/**', 'node_modules/**'],
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
