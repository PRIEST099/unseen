import { test, expect } from '@playwright/test'
import { BrowserPool, PageLoader } from '../src/runner/browser.js'
import { installSafeFetchPolicy } from '../src/runner/safe-fetch.js'
import type { SafeFetchPolicy } from '../src/types.js'
import { startTestServer, type TestServer } from './fixtures/test-server.js'

let pool: BrowserPool
let server: TestServer
test.beforeAll(async () => {
  pool = new BrowserPool({ maxConcurrency: 1 })
  server = await startTestServer((req, res) => {
    res.writeHead(200, { 'content-type': req.url === '/' ? 'text/html' : 'text/plain' })
    res.end(req.url === '/' ? '<!doctype html><html lang="en"><body><h1>ok</h1></body></html>' : 'data')
  })
})
test.afterAll(async () => {
  await pool.close()
  await server.close()
})

// Task 3 acceptance (finding 21): a policy whose shouldBlock throws aborts the request and does not crash the page.
test('a throwing policy blocks the request with BLOCKED_BY_CLIENT and leaves the page usable', async () => {
  const browser = await pool.acquire()
  const context = await new PageLoader().createContext(browser)
  try {
    const page = await context.newPage()
    const policy: SafeFetchPolicy = {
      shouldBlock: async (url) => {
        if (url.endsWith('/boom')) throw new Error('policy exploded')
        return { block: false, reason: '' }
      },
    }
    installSafeFetchPolicy(page, policy)
    await page.goto(`${server.baseUrl}/`)

    const failures: string[] = []
    page.on('requestfailed', (r) => failures.push(r.failure()?.errorText ?? ''))
    const outcome = await page.evaluate(async (url) => {
      try {
        await fetch(url)
        return 'fetched'
      } catch {
        return 'blocked'
      }
    }, `${server.baseUrl}/boom`)

    expect(outcome).toBe('blocked')
    expect(failures.some((f) => /BLOCKED_BY_CLIENT/.test(f))).toBe(true)
    expect(server.hits.get('/boom')).toBeUndefined()
    // the page is still alive and other requests still work
    expect(await page.evaluate(() => 1 + 1)).toBe(2)
    expect(await page.evaluate(async (url) => (await fetch(url)).status, `${server.baseUrl}/fine`)).toBe(200)
  } finally {
    await context.close()
    await pool.release(browser)
  }
})
