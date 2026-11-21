import { test, expect } from '@playwright/test'
import { BrowserPool } from '../src/runner/browser.js'
import { walkTabs } from '../src/runner/tab-walker.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'
import { withPage } from './fixtures/load.js'

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

test('checkout: the newsletter modal is a true trap', async () => {
  await withPage(pool, `${shop.baseUrl}/checkout.html`, async (page) => {
    const r = await walkTabs(page)
    expect(r.trapDetected).toBe(true)
    expect(r.trapRegionNodeIds.length).toBeGreaterThan(0)
    // every recorded trap node is #newsletterModal or a descendant of it
    const cdp = await page.context().newCDPSession(page)
    for (const id of r.trapRegionNodeIds) {
      const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: Number(id) })) as { object: { objectId: string } }
      const { result } = (await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: 'function(){ return !!this.closest("#newsletterModal") }',
        returnByValue: true,
      })) as { result: { value: boolean } }
      expect(result.value).toBe(true)
    }
    expect(r.walkStartedAtMs).toBeGreaterThan(0)
  })
})

test('index: the cookie banner cycle is escapable and the walk reaches the footer', async () => {
  await withPage(pool, `${shop.baseUrl}/index.html`, async (page) => {
    const r = await walkTabs(page)
    expect(r.trapDetected).toBe(false)
    expect(r.cycles.some((c) => c.escapable)).toBe(true)
    const footerIds = new Set<string>()
    const cdp = await page.context().newCDPSession(page)
    for (const s of r.steps) {
      const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: Number(s.backendDOMNodeId) })) as { object: { objectId: string } }
      const { result } = (await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: 'function(){ return !!this.closest("footer") }',
        returnByValue: true,
      })) as { result: { value: boolean } }
      if (result.value) footerIds.add(s.backendDOMNodeId)
    }
    expect(footerIds.size).toBeGreaterThan(5)
    const step = r.steps.find((s) => !s.cdpError)!
    for (const k of ['outline-style', 'outline-width', 'outline-color', 'box-shadow', 'border-color', 'background-color', 'text-decoration', 'adjacent-background-color']) {
      expect(step.focusSnapshot.after).toHaveProperty(k)
    }
  })
})
