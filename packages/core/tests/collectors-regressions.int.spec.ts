import { test, expect } from '@playwright/test'
import {
  BrowserPool,
  buildDomAxMapping,
  collectEventListeners,
  collectPageMetadata,
  collectTextNodeStyles,
} from '../src/runner/browser.js'
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

// Findings 12, 19, 31 (run 19b): layers that are not ancestors, the white fallback, and opacity on an ancestor.
test('findings 12/19: text over a positioned sibling svg or gradient is uncertain; plain text is not', async () => {
  await withPage(pool, `${pages.baseUrl}/fog-layers.html`, async (page) => {
    const { textNodeStyles, errors } = await collectTextNodeStyles(page)
    expect(errors).toEqual([])
    const of = async (sel: string) => textNodeStyles[(await backendIdOf(page, sel))!]!

    // the layers sit beside the text in the DOM, but paint under it (one with pointer-events: none)
    expect((await of('#over-svg')).backgroundUncertain).toBe(true)
    expect((await of('#over-gradient')).backgroundUncertain).toBe(true)
    // the same black container with nothing under the text stays certain
    const plain = await of('#over-nothing')
    expect(plain.backgroundUncertain).toBe(false)
    expect(plain.backgroundColor).toBe('rgb(0, 0, 0)')
    // neighbouring blocks with their own backgrounds do not mark each other
    expect((await of('#left')).backgroundUncertain).toBe(false)
    expect((await of('#left')).backgroundColor).toBe('rgb(20, 20, 20)')
    expect((await of('#right')).backgroundUncertain).toBe(false)
  })
})

test('finding 14: with no background anywhere the fallback is white and certain', async () => {
  await withPage(pool, `${pages.baseUrl}/fog-layers.html`, async (page) => {
    const { textNodeStyles } = await collectTextNodeStyles(page)
    const plain = textNodeStyles[(await backendIdOf(page, '#plain'))!]!
    expect(plain.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(plain.backgroundUncertain).toBe(false)
    expect(plain.color).toBe('rgb(119, 119, 119)')
  })
})

test('finding 31: text inside an opacity 0 container is not collected', async () => {
  await withPage(pool, `${pages.baseUrl}/fog-layers.html`, async (page) => {
    const { textNodeStyles } = await collectTextNodeStyles(page)
    expect(textNodeStyles[(await backendIdOf(page, '#faded'))!]).toBeUndefined()
    expect(textNodeStyles[(await backendIdOf(page, '#title'))!]).toBeDefined()
  })
})

// Finding 32: the page cannot blind the collectors through window globals, and a failing expression is an error.
test('finding 32: a page that sabotages window globals does not empty the collectors', async () => {
  await withPage(pool, `${pages.baseUrl}/hostile-globals.html`, async (page) => {
    const styles = await collectTextNodeStyles(page)
    expect(styles.errors).toEqual([])
    expect(Object.keys(styles.textNodeStyles).length).toBeGreaterThanOrEqual(3)
    const mapping = await buildDomAxMapping(page, await collectAxTree(page))
    expect(mapping.errors).toEqual([])
    expect(mapping.mapping.length).toBeGreaterThan(3)
  })
})

// Finding 30: ids and alt values come from the same snapshot.
test('finding 30: alt values stay with their element while the page keeps reordering images', async () => {
  await withPage(pool, `${pages.baseUrl}/metadata-churn.html`, async (page) => {
    const cdp = await page.context().newCDPSession(page)
    let mismatches = 0
    let checked = 0
    for (let run = 0; run < 10; run++) {
      const { imgAltAttributes } = await collectPageMetadata(page, await collectAxTree(page))
      for (const [id, alt] of Object.entries(imgAltAttributes)) {
        try {
          const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: Number(id) })) as { object: { objectId: string } }
          const { result } = (await cdp.send('Runtime.callFunctionOn', {
            objectId: object.objectId,
            functionDeclaration: 'function(){ return this.getAttribute("alt") }',
            returnByValue: true,
          })) as { result: { value: string | null } }
          checked++
          if (result.value !== alt) mismatches++
        } catch {
          /* the churn image was removed again: nothing to compare */
        }
      }
    }
    expect(checked).toBe(30)
    expect(mismatches).toBe(0)
  })
})

// Req 8.3: a listener on a parent is not attributed to its child.
test('Req 8.3: a click listener on a parent is signalled for the parent only', async () => {
  await withPage(pool, `${pages.baseUrl}/listener-parent.html`, async (page) => {
    const { signals, errors } = await collectEventListeners(page)
    expect(errors).toEqual([])
    const parent = Number((await backendIdOf(page, '#parent'))!)
    expect(signals.map((s) => s.backendDOMNodeId)).toEqual([parent])
  })
})

// Findings 33 and 46: time limits and failures are recorded as CollectionErrors, never thrown.
test('finding 33/46: a batch that exceeds its time limit is a CollectionError, not a throw', async () => {
  await withPage(pool, `${pages.baseUrl}/fog-backgrounds.html`, async (page) => {
    const styles = await collectTextNodeStyles(page, [], { batchTimeoutMs: 1 })
    expect(styles.errors.length).toBeGreaterThan(0)
    expect(styles.errors.every((e) => e.step === 'text-styles' && /timed out after 1ms/.test(e.message))).toBe(true)
    const mapping = await buildDomAxMapping(page, await collectAxTree(page), { batchTimeoutMs: 1 })
    expect(mapping.errors.length).toBeGreaterThan(0)
    expect(mapping.errors.every((e) => e.step === 'dom-ax-mapping' && /timed out after 1ms/.test(e.message))).toBe(true)
  })
})

test('finding 33/46: a CDP session failure is recorded by every collector, not thrown', async () => {
  await withPage(pool, `${pages.baseUrl}/fog-backgrounds.html`, async (page) => {
    const axNodes = await collectAxTree(page)
    await page.close()
    const styles = await collectTextNodeStyles(page)
    expect(styles.errors[0]).toMatchObject({ step: 'text-styles' })
    const listeners = await collectEventListeners(page)
    expect(listeners.errors[0]).toMatchObject({ step: 'event-listeners' })
    const mapping = await buildDomAxMapping(page, axNodes)
    expect(mapping.errors[0]).toMatchObject({ step: 'dom-ax-mapping' })
  })
})

// Req 8: nodes past the cap are reported, not silently skipped.
test('Req 8: a page with more elements than the node cap records a CollectionError', async () => {
  await withPage(pool, `${pages.baseUrl}/listener-parent.html`, async (page) => {
    const parent = Number((await backendIdOf(page, '#parent'))!)
    const capped = await collectEventListeners(page, { maxNodes: 5 })
    expect(capped.signals).toEqual([])
    expect(capped.errors).toHaveLength(1)
    expect(capped.errors[0]).toMatchObject({ step: 'event-listeners' })
    expect(capped.errors[0]!.message).toMatch(/node cap reached: only the first 5 of \d+ elements/)
    const full = await collectEventListeners(page, { maxNodes: 5000 })
    expect(full.errors).toEqual([])
    expect(full.signals.map((s) => s.backendDOMNodeId)).toEqual([parent])
  })
})

// Findings 13 and 22 (run 19b): the element's own isFocusable, and inert subtrees.
test('findings 13/22: isFocusable is pinned directly, and an inert subtree holds no focusable', async () => {
  await withPage(pool, `${pages.baseUrl}/veiled-mapping.html`, async (page) => {
    const { mapping } = await buildDomAxMapping(page, await collectAxTree(page))
    const byId = new Map(mapping.map((m) => [String(m.backendDOMNodeId), m]))
    const get = async (sel: string) => byId.get((await backendIdOf(page, sel))!)
    expect((await get('#real-btn'))!.isFocusable).toBe(true)
    expect((await get('#disabled-btn'))!.isFocusable).toBe(false)
    expect((await get('#inert-btn'))!.isFocusable).toBe(false)
    expect((await get('#disabled-box'))!.containsFocusable).toBe(false)
    expect((await get('#inert-box'))!.containsFocusable).toBe(false)
    // the plain page structure is not focusable either
    expect((await get('#real'))!.isFocusable).toBe(false)
  })
})