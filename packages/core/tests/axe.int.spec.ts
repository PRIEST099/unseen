import { test, expect } from '@playwright/test'
import { BrowserPool, PageLoader } from '../src/runner/browser.js'
import { runAxe } from '../src/runner/axe.js'
import { PermissiveSafeFetchPolicy } from '../src/runner/safe-fetch.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'

let shop: ShopServer
let pool: BrowserPool
test.beforeAll(async () => {
  shop = await startShopServer()
  pool = new BrowserPool({ maxConcurrency: 1 })
})
test.afterAll(async () => {
  await pool.close()
  await shop.close()
})

test('index: axe returns normalised violations', async () => {
  const browser = await pool.acquire()
  const loader = new PageLoader()
  const context = await loader.createContext(browser)
  try {
    const { page } = await loader.loadPage(context, `${shop.baseUrl}/index.html`, new PermissiveSafeFetchPolicy())
    const { violations, incomplete, error } = await runAxe(page)
    expect(error).toBeUndefined()
    expect(violations.length).toBeGreaterThan(0)
    for (const v of [...violations, ...incomplete]) {
      expect(typeof v.id).toBe('string')
      expect([null, 'minor', 'moderate', 'serious', 'critical']).toContain(v.impact)
      expect(v.nodes.length).toBeGreaterThan(0)
      for (const n of v.nodes) expect(n.target.every((t) => typeof t === 'string')).toBe(true)
    }
    expect(violations.some((v) => v.id === 'button-name')).toBe(true)
  } finally {
    await context.close()
    await pool.release(browser)
  }
})

test('runAxe reports a timeout as a CollectionError instead of throwing', async () => {
  const browser = await pool.acquire()
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent('<main><button></button></main>')
    const r = await runAxe(page, 1)
    expect(r.violations).toEqual([])
    expect(r.error?.step).toBe('axe')
  } finally {
    await context.close()
    await pool.release(browser)
  }
})
