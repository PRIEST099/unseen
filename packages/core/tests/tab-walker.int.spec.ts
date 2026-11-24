import { test, expect } from '@playwright/test'
import type { Page } from 'playwright'
import { BrowserPool } from '../src/runner/browser.js'
import { walkTabs } from '../src/runner/tab-walker.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'
import { withPage } from './fixtures/load.js'
import { backendIdOf } from './fixtures/dom.js'

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

/** Evaluate `fn` (a function declaration source, `this` = the node) on a backendDOMNodeId. */
async function onNode<T>(page: Page, id: string, fn: string): Promise<T> {
  const cdp = await page.context().newCDPSession(page)
  try {
    const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: Number(id) })) as { object: { objectId: string } }
    const { result } = (await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: fn,
      returnByValue: true,
    })) as { result: { value: T } }
    return result.value
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

// Findings 5 and 6: checkout's focusin-based restoreFocus pulls focus back into the modal input.
test('checkout: the modal input is the first step and its baseline is the unfocused look', async () => {
  await withPage(pool, `${shop.baseUrl}/checkout.html`, async (page) => {
    const r = await walkTabs(page)
    const first = r.steps[0]!
    expect(await onNode<boolean>(page, first.backendDOMNodeId, 'function(){ return this.matches("#newsletterModal input") }')).toBe(true)
    expect(first.cdpError).toBe(false)
    expect(first.focusSnapshot.before['outline-style']).toBe('none')
    expect(first.focusSnapshot.after['outline-style']).toBe('solid')
    expect(r.trapDetected).toBe(true)
  })
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
    // the region comes first and is the modal's dialog
    expect(await onNode<boolean>(page, r.trapRegionNodeIds[0]!, 'function(){ return !!this.closest("#newsletterModal") && this.matches("[role=dialog]") }')).toBe(true)
    expect(r.walkStartedAtMs).toBeGreaterThan(0)
  })
})

test('index: the cookie banner cycle is escapable and the walk reaches the footer', async () => {
  await withPage(pool, `${shop.baseUrl}/index.html`, async (page) => {
    const r = await walkTabs(page)
    expect(r.trapDetected).toBe(false)
    // the escapable cycle is the cookie banner's, not the wrap-around of the whole page
    const banner = r.cycles.find((c) => c.escapable && !c.includesAllFocusables)
    expect(banner).toBeDefined()
    for (const id of banner!.nodeIds) {
      expect(await onNode<boolean>(page, id, 'function(){ return !!this.closest("#cookieBanner") }')).toBe(true)
    }
    expect(r.endReason).toBe('body')
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
    for (const k of ['outline-style', 'outline-width', 'outline-color', 'outline-offset', 'box-shadow', 'border-style', 'border-width', 'border-color', 'background-color', 'text-decoration', 'adjacent-background-color']) {
      expect(step.focusSnapshot.after).toHaveProperty(k)
    }
    // finding 23: `before` is read too, has the same keys as `after`, and shows the real focus change
    for (const s of r.steps.filter((x) => !x.cdpError)) {
      expect(Object.keys(s.focusSnapshot.before).sort()).toEqual(Object.keys(s.focusSnapshot.after).sort())
    }
    const logoId = await backendIdOf(page, '.logo')
    const logo = r.steps.find((s) => s.backendDOMNodeId === logoId)
    expect(logo).toBeDefined()
    expect(logo!.focusSnapshot.before['outline-style']).toBe('none')
    expect(logo!.focusSnapshot.after['outline-style']).not.toBe('none')
  })
})
