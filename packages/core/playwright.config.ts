import { defineConfig } from '@playwright/test'

const channel = process.env.UNSEEN_CHROMIUM_CHANNEL

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.int.spec.ts',
  timeout: 60_000,
  workers: 1,
  use: {
    channel: channel ? channel : undefined,
  },
})
