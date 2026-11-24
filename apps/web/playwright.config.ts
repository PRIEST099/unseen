import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e/',
  testMatch: '**/*.spec.ts',
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    channel: process.env.UNSEEN_CHROMIUM_CHANNEL ?? 'chromium',
  },
  webServer: {
    command: 'npm run build && npm run start:test',
    port: 3000,
    // An inherited PORT (e.g. from the shell) would move the server off the port Playwright waits on.
    env: { PORT: '3000' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
