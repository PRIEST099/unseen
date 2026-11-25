import { defineConfig } from 'vitest/config'

/**
 * The default unit run: fast, parallel and deterministic. Browser-backed `*.int.test.ts` files
 * launch a real Chromium and are slow under load, so they run separately (`npm run test:int`,
 * see vitest.int.config.ts).
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    exclude: ['e2e/**', 'dist/**', 'node_modules/**', 'src/**/*.int.test.ts', 'src/**/*.int.test.tsx'],
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['src/server/**', 'node'],
      ['scripts/**', 'node'],
    ],
  },
})
