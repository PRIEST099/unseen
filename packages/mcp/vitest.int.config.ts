import { defineConfig } from 'vitest/config'

// Integration tests: real Chromium, the Cursed Shop on an ephemeral port, the built CLI.
export default defineConfig({
  test: {
    include: ['tests/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 180000,
    hookTimeout: 60000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
})
