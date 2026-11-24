import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/build-package.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['tests/**', 'dist/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 5000,
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    silent: true
  }
})
