import { test, expect } from '@playwright/test'
import { BrowserPool, buildDomAxMapping, collectEventListeners, collectPageMetadata, collectTextNodeStyles } from '../src/runner/browser.js'
import { collectAxTree } from '../src/runner/ax-tree.js'
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

test('task 9: text styles, uncertain backgrounds and large text', async () => {
  await withPage(pool, `${shop.baseUrl}/index.html`, async (page) => {
    const { textNodeStyles, errors } = await collectTextNodeStyles(page)
    expect(errors).toEqual([])
    const entries = Object.values(textNodeStyles)
    expect(entries.length).toBeGreaterThan(10)
    // every colour is a well-formed rgb() with integer channels 0-255 (the old check accepted any "rgb(" prefix)
    const rgb = /^rgba?\((\d{1,3}), (\d{1,3}), (\d{1,3})(?:, ([\d.]+))?\)$/
    const channelsOk = (c: string): boolean => {
      const m = rgb.exec(c)
      return m !== null && [m[1], m[2], m[3]].every((n) => Number(n) <= 255)
    }
    const certain = entries.filter((s) => !s.backgroundUncertain)
    expect(certain.every((s) => channelsOk(s.backgroundColor))).toBe(true)
    expect(entries.every((s) => channelsOk(s.color))).toBe(true)
    // real backgrounds are resolved, not just the white fallback
    expect(certain.some((s) => s.backgroundColor !== 'rgb(255, 255, 255)')).toBe(true)
    expect(certain.some((s) => s.backgroundColor === 'rgb(255, 255, 255)')).toBe(true)
    expect(entries.some((s) => s.isLargeText)).toBe(true)
    expect(entries.some((s) => s.backgroundUncertain)).toBe(true)
    expect(entries.some((s) => !s.backgroundUncertain)).toBe(true)
  })
})

test('task 10: event listeners find the 8 index Lost Soul candidates, with cursors', async () => {
  await withPage(pool, `${shop.baseUrl}/index.html`, async (page) => {
    const { signals, errors } = await collectEventListeners(page)
    expect(errors).toEqual([])
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => s.eventTypes.length > 0)).toBe(true)
    const divs = signals.filter((s) => s.tagName === 'div')
    expect(divs.length).toBeGreaterThanOrEqual(8)
    const { elementCursorStyles } = await collectTextNodeStyles(page, signals)
    expect(Object.keys(elementCursorStyles).length).toBe(signals.length)
  })
})

test('task 11: page metadata (index has main, checkout has none and no lang)', async () => {
  const index = await withPage(pool, `${shop.baseUrl}/index.html`, async (page) =>
    collectPageMetadata(page, await collectAxTree(page))
  )
  expect(index.metadata.htmlLang).toBe('en')
  expect(index.metadata.headings.length).toBeGreaterThan(0)
  expect(index.metadata.headings[0]!.accessibleName).not.toBe('')
  expect(index.metadata.landmarkRoles).toContain('main')
  expect(index.metadata.hasMainLandmark).toBe(true)
  expect(Object.values(index.imgAltAttributes)).toContain(null)
  expect(Object.values(index.imgAltAttributes)).toContain('')

  const checkout = await withPage(pool, `${shop.baseUrl}/checkout.html`, async (page) =>
    collectPageMetadata(page, await collectAxTree(page))
  )
  expect(checkout.metadata.htmlLang).toBeNull()
  expect(checkout.metadata.hasMainLandmark).toBe(false)
})

test('task 12: DOM-AX mapping flags the aria-hidden promo strip with visible text', async () => {
  await withPage(pool, `${shop.baseUrl}/index.html`, async (page) => {
    const axNodes = await collectAxTree(page)
    const { mapping, errors } = await buildDomAxMapping(page, axNodes)
    expect(errors).toEqual([])
    expect(mapping.length).toBeGreaterThan(0)
    const hidden = mapping.filter((m) => m.ariaHidden)
    expect(hidden.length).toBeGreaterThan(0)
    expect(hidden.some((m) => m.hasVisibleText && !m.hasAxNode)).toBe(true)
  })
})

test('task 12: empty AX tree is reported, not thrown', async () => {
  await withPage(pool, `${shop.baseUrl}/index.html`, async (page) => {
    const r = await buildDomAxMapping(page, [])
    expect(r.mapping).toEqual([])
    expect(r.errors[0]!.message).toContain('axTreeUnavailable')
  })
})
