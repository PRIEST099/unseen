import { test, expect } from '@playwright/test'
import { BrowserPool, buildDomAxMapping, collectTextNodeStyles } from '../src/runner/browser.js'
import { collectAxTree } from '../src/runner/ax-tree.js'
import { startPagesServer, type PagesServer } from './fixtures/pages-server.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'
import { withPage } from './fixtures/load.js'
import { backendIdOf } from './fixtures/dom.js'

let pages: PagesServer
let shop: ShopServer
let pool: BrowserPool
test.beforeAll(async () => {
  pages = await startPagesServer()
  shop = await startShopServer()
  pool = new BrowserPool({ maxConcurrency: 1 })
})
test.afterAll(async () => {
  await pool.close()
  await pages.close()
  await shop.close()
})

const channels = (rgb: string): number[] => (rgb.match(/\d+/g) ?? []).map(Number)

// Findings 11, 12, 14 and 19: the effective background of text.
test('findings 11/14/19: backgrounds resolve through transparent layers and colour functions', async () => {
  await withPage(pool, `${pages.baseUrl}/fog-backgrounds.html`, async (page) => {
    const { textNodeStyles, errors } = await collectTextNodeStyles(page)
    expect(errors).toEqual([])
    const of = async (sel: string) => textNodeStyles[(await backendIdOf(page, sel))!]!

    // an oklch background is resolved (a light yellow-white, about rgb(242, 240, 224)), never skipped to the black parent
    const oklch = await of('#oklch')
    expect(oklch.backgroundUncertain).toBe(false)
    expect(channels(oklch.backgroundColor).every((c) => c > 200)).toBe(true)

    // color-mix() computes to color(srgb 1 1 1); it is white, not the black or fallback parent
    const mix = await of('#colormix')
    expect(mix.backgroundUncertain).toBe(false)
    expect(mix.backgroundColor).toBe('rgb(255, 255, 255)')

    // a transparent chain resolves to the exact opaque ancestor
    const chain = await of('#chain')
    expect(chain.backgroundUncertain).toBe(false)
    expect(chain.backgroundColor).toBe('rgb(10, 20, 30)')

    expect((await of('#translucent')).backgroundUncertain).toBe(true)
    expect((await of('#gradient')).backgroundUncertain).toBe(true)
  })
})

test('finding 12: a gradient painted by a pseudo-element makes the text uncertain', async () => {
  await withPage(pool, `${pages.baseUrl}/fog-backgrounds.html`, async (page) => {
    const { textNodeStyles } = await collectTextNodeStyles(page)
    expect(textNodeStyles[(await backendIdOf(page, '#pseudo-text'))!]!.backgroundUncertain).toBe(true)
  })
})

test('finding 14: invisible text is absent and more than 100 elements all produce entries', async () => {
  await withPage(pool, `${pages.baseUrl}/fog-backgrounds.html`, async (page) => {
    const { textNodeStyles, errors } = await collectTextNodeStyles(page)
    expect(errors).toEqual([])
    expect(textNodeStyles[(await backendIdOf(page, '#invisible-opacity'))!]).toBeUndefined()
    expect(textNodeStyles[(await backendIdOf(page, '#invisible-display'))!]).toBeUndefined()
    const bulk = await page.evaluate(() => document.querySelectorAll('.bulk').length)
    expect(bulk).toBe(150)
    // h1 + 6 case paragraphs + 150 bulk paragraphs, in two or more batches of 100
    expect(Object.keys(textNodeStyles).length).toBe(157)
  })
})

test('findings 12/14/19: the cursed-shop hero text sits on a ::before gradient and is uncertain', async () => {
  await withPage(pool, `${shop.baseUrl}/index.html`, async (page) => {
    const { textNodeStyles } = await collectTextNodeStyles(page)
    const hero = textNodeStyles[(await backendIdOf(page, '.hero h1'))!]
    expect(hero).toBeDefined()
    expect(hero!.backgroundUncertain).toBe(true)
    // the flag is not hard-coded: plenty of ordinary text is still certain
    const certain = Object.values(textNodeStyles).filter((s) => !s.backgroundUncertain)
    expect(certain.length).toBeGreaterThan(10)
  })
})

// Findings 13 and 22: The Veiled fields.
test('findings 13/22: containsFocusable ignores controls that cannot take focus', async () => {
  await withPage(pool, `${pages.baseUrl}/veiled-mapping.html`, async (page) => {
    const { mapping, errors } = await buildDomAxMapping(page, await collectAxTree(page))
    expect(errors).toEqual([])
    const byId = new Map(mapping.map((m) => [String(m.backendDOMNodeId), m]))
    const get = async (sel: string) => byId.get((await backendIdOf(page, sel))!)

    expect((await get('#real'))!.containsFocusable).toBe(true)
    expect((await get('#none'))!.containsFocusable).toBe(false)
    expect((await get('#hidden-link'))!.containsFocusable).toBe(false)
    expect((await get('#fieldset'))!.containsFocusable).toBe(false)
    // text beside a control that cannot take focus is still visible text
    expect((await get('#none'))!.hasVisibleText).toBe(true)

    const icon = (await get('#icon'))!
    expect(icon.isPresentational).toBe(true)
    expect(icon.hasVisibleText).toBe(false)
    expect(icon.containsFocusable).toBe(false)
  })
})

test('finding 22: an aria-hidden block positioned off screen is not visible', async () => {
  await withPage(pool, `${pages.baseUrl}/veiled-mapping.html`, async (page) => {
    const { mapping } = await buildDomAxMapping(page, await collectAxTree(page))
    const id = (await backendIdOf(page, '#offscreen'))!
    expect(mapping.find((m) => String(m.backendDOMNodeId) === id)).toBeUndefined()
  })
})

test('finding 22: the shop promo strip is aria-hidden, has no AX node and contains a focusable link', async () => {
  await withPage(pool, `${shop.baseUrl}/index.html`, async (page) => {
    const { mapping } = await buildDomAxMapping(page, await collectAxTree(page))
    const id = (await backendIdOf(page, '.promo-strip'))!
    const strip = mapping.find((m) => String(m.backendDOMNodeId) === id)
    expect(strip).toMatchObject({ ariaHidden: true, hasAxNode: false, hasVisibleText: true, containsFocusable: true })
  })
})
