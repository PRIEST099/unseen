import { defineConfig } from 'vitest/config'

// Unit, property and light tests. Browser-launching tests are `*.int.test.ts`, run by vitest.int.config.ts.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/**/*.int.test.ts', 'dist/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 180000,
    hookTimeout: 60000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
})
