import { defineConfig } from '@playwright/test'

// The replay edition, served like GitHub Pages (sub-path, 404.html fallback, no headers).
const PORT = 4173

export default defineConfig({
  testDir: 'e2e-replay/',
  testMatch: '**/*.spec.ts',
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.UNSEEN_CHROMIUM_CHANNEL ?? 'chromium',
  },
  webServer: {
    command: 'npm run build:replay && npm run serve:replay',
    url: `http://127.0.0.1:${PORT}/unseen/`,
    env: { PORT: String(PORT), UNSEEN_REPLAY_BASE: '/unseen/', UNSEEN_LIVE_URL: 'https://unseen.example.com/' },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
