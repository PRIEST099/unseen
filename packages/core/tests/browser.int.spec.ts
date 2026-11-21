import { test, expect } from '@playwright/test'
import { BrowserPool, PageLoader, SETTLE_WINDOW_MS } from '../src/runner/browser.js'
import { PermissiveSafeFetchPolicy } from '../src/runner/safe-fetch.js'
import { NonHtmlContentError } from '../src/types.js'
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

test('loadPage returns a screenshot and bounding boxes with backendDOMNodeIds', async () => {
  const browser = await pool.acquire()
  const loader = new PageLoader()
  const context = await loader.createContext(browser)
  try {
    const t0 = Date.now()
    const { page, screenshotPng, boundingBoxes } = await loader.loadPage(
      context,
      `${shop.baseUrl}/index.html`,
      new PermissiveSafeFetchPolicy()
    )
    expect(Date.now() - t0).toBeGreaterThanOrEqual(SETTLE_WINDOW_MS)
    expect(screenshotPng.subarray(1, 4).toString()).toBe('PNG')
    expect(screenshotPng.length).toBeGreaterThan(1000)
    expect(boundingBoxes.length).toBe(await page.evaluate(() => document.querySelectorAll('*').length))
    expect(boundingBoxes.some((b) => b.backendDOMNodeId > 0 && b.width > 0)).toBe(true)
    expect(page.viewportSize()).toEqual({ width: 1280, height: 900 })
  } finally {
    await context.close()
    await pool.release(browser)
  }
})

test('loadPage rejects non-HTML content', async () => {
  const browser = await pool.acquire()
  const loader = new PageLoader()
  const context = await loader.createContext(browser)
  try {
    await expect(
      loader.loadPage(context, `${shop.baseUrl}/expected-hauntings.json`, new PermissiveSafeFetchPolicy())
    ).rejects.toBeInstanceOf(NonHtmlContentError)
  } finally {
    await context.close()
    await pool.release(browser)
  }
})
