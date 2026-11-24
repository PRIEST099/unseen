import { test, expect } from '@playwright/test'
import { BrowserPool, PageLoader } from '../src/runner/browser.js'
import { AXE_TAGS, runAxe } from '../src/runner/axe.js'
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
      // the WCAG tag filter is applied: every result carries at least one of the requested tags
      expect(v.tags.some((tag) => (AXE_TAGS as readonly string[]).includes(tag))).toBe(true)
    }
    // 'region' is a best-practice rule (no WCAG tag); dropping the tag filter would bring it back
    expect([...violations, ...incomplete].some((v) => v.id === 'region')).toBe(false)
    expect(violations.some((v) => v.id === 'button-name')).toBe(true)
  } finally {
    await context.close()
    await pool.release(browser)
  }
})

test('runAxe reports a timeout as a CollectionError instead of throwing', async () => {
  const browser = await pool.acquire()
  const loader = new PageLoader()
  const context = await loader.createContext(browser)
  try {
    // loaded through the real pipeline, with the (permissive) policy installed, like every other page
    const { page } = await loader.loadPage(context, `${shop.baseUrl}/index.html`, new PermissiveSafeFetchPolicy())
    const r = await runAxe(page, 1)
    expect(r.violations).toEqual([])
    expect(r.error?.step).toBe('axe')
    // a timeout, not any other axe failure
    expect(r.error?.message).toMatch(/axe timed out after 1ms/)
  } finally {
    await context.close()
    await pool.release(browser)
  }
})