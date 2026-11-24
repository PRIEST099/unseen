import { test, expect } from '@playwright/test'
import { auditHtml, auditUrl, auditUrlWithHooks } from '../src/audit.js'
import type { RawAudit } from '../src/types.js'
import { DOM_ATTR_NAMES } from '../src/types.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'

let shop: ShopServer
test.beforeAll(async () => {
  shop = await startShopServer()
})
test.afterAll(async () => {
  await shop.close()
})

const PAGES = ['index.html', 'product.html', 'checkout.html'] as const

/** Every backendDOMNodeId that any RawAudit field refers to, with the field it came from. */
function referencedIds(raw: RawAudit): Map<number, string> {
  const out = new Map<number, string>()
  const add = (id: number | string | null | undefined, from: string): void => {
    const n = typeof id === 'string' ? Number(id) : id
    if (n !== null && n !== undefined && Number.isFinite(n) && n > 0 && !out.has(n)) out.set(n, from)
  }
  raw.boundingBoxes.forEach((b) => add(b.backendDOMNodeId, 'boundingBoxes'))
  raw.axNodes.forEach((n) => add(n.backendDOMNodeId, 'axNodes'))
  Object.keys(raw.textNodeStyles).forEach((k) => add(k, 'textNodeStyles'))
  Object.keys(raw.elementCursorStyles).forEach((k) => add(k, 'elementCursorStyles'))
  Object.keys(raw.imgAltAttributes).forEach((k) => add(k, 'imgAltAttributes'))
  Object.keys(raw.imgSrcAttributes).forEach((k) => add(k, 'imgSrcAttributes'))
  raw.eventListenerSignals.forEach((s) => add(s.backendDOMNodeId, 'eventListenerSignals'))
  raw.tabWalkResult.steps.forEach((s) => add(s.backendDOMNodeId, 'tabWalkResult.steps'))
  raw.tabWalkResult.trapRegionNodeIds.forEach((i) => add(i, 'tabWalkResult.trapRegionNodeIds'))
  raw.tabWalkResult.cycles.forEach((c) => c.nodeIds.forEach((i) => add(i, 'tabWalkResult.cycles')))
  raw.domAxMapping.forEach((m) => add(m.backendDOMNodeId, 'domAxMapping'))
  add(raw.pageMetadata.htmlBackendDOMNodeId, 'pageMetadata.html')
  add(raw.pageMetadata.bodyBackendDOMNodeId, 'pageMetadata.body')
  raw.pageMetadata.headings.forEach((h) => add(h.backendDOMNodeId, 'pageMetadata.headings'))
  for (const v of [...raw.axeViolations, ...raw.axeIncomplete]) v.nodes.forEach((n) => add(n.backendDOMNodeId, 'axe'))
  return out
}

for (const page of PAGES) {
  test(`domNodes covers every referenced id and is well formed: ${page}`, async () => {
    test.setTimeout(120_000)
    const raw = await auditUrl(`${shop.baseUrl}/${page}`, { allowPrivate: true })
    const nodes = raw.domNodes

    const missing = [...referencedIds(raw)].filter(([id]) => nodes[String(id)] === undefined).map(([id, from]) => `${id} (${from})`)
    expect(missing).toEqual([])

    // every parent chain reaches <body> (or is <html> itself)
    const body = raw.pageMetadata.bodyBackendDOMNodeId
    const html = raw.pageMetadata.htmlBackendDOMNodeId
    expect(body).not.toBeNull()
    for (const [key, info] of Object.entries(nodes)) {
      expect(info.outerHTMLSnippet.length).toBeLessThanOrEqual(300)
      if (info.tag === '#document') continue // the root document sits above <html>; the AX WebArea refers to it
      const id = Number(key)
      let cur: number | null = id
      let steps = 0
      while (cur !== null && cur !== body && cur !== html && steps++ < 10_000) cur = nodes[String(cur)]?.parentId ?? null
      expect(cur === body || cur === html, `${key} <${info.tag}> must reach body or html`).toBe(true)
    }

    expect(nodes[String(html)]?.tag).toBe('html')
    expect(nodes[String(body)]?.tag).toBe('body')
    for (const h of raw.pageMetadata.headings) {
      expect(nodes[String(h.backendDOMNodeId)]?.tag).toBe(h.tagName)
      expect(h.tagName).toMatch(/^h[1-6]$/)
    }

    // every axe node with a single-string target resolved; every other target is null
    for (const v of [...raw.axeViolations, ...raw.axeIncomplete]) {
      for (const n of v.nodes) {
        if (n.target.length === 1) expect(n.backendDOMNodeId, `${v.id} ${n.target[0]}`).not.toBeNull()
      }
    }
    expect(raw.collectionErrors).toEqual([])
  })
}

test('imgSrcAttributes holds the src of every <img> and domNodes records its attributes', async () => {
  test.setTimeout(120_000)
  const raw = await auditUrl(`${shop.baseUrl}/index.html`, { allowPrivate: true })
  const imgs = Object.entries(raw.domNodes).filter(([, n]) => n.tag === 'img')
  expect(imgs.length).toBeGreaterThan(0)
  for (const [id, n] of imgs) {
    expect(raw.imgSrcAttributes[id]).toBe(n.attrs.src ?? null)
    expect(raw.imgAltAttributes[id]).toBe(n.attrs.alt ?? null)
  }
  const allowed = new Set<string>(DOM_ATTR_NAMES)
  for (const n of Object.values(raw.domNodes)) {
    for (const name of Object.keys(n.attrs)) expect(allowed.has(name), name).toBe(true) // only the recorded names are kept
  }
})

test('a checked radio keeps checked: "true" in axNodes', async () => {
  test.setTimeout(120_000)
  const html =
    '<!doctype html><html lang="en"><body><main><h1>R</h1><form><label><input type="radio" name="g" checked> One</label>' +
    '<label><input type="radio" name="g"> Two</label></form></main></body></html>'
  const raw = await auditHtml(html, { allowPrivate: true })
  const radios = raw.axNodes.filter((n) => n.role.value === 'radio')
  expect(radios).toHaveLength(2)
  const checked = radios.map((r) => r.properties.find((p) => p.name === 'checked')?.value.value)
  expect(checked).toEqual(['true', 'false'])
})

test('beforeClose runs with the page still open and the assembled audit', async () => {
  test.setTimeout(120_000)
  let seen: { open: boolean; boxes: number } | undefined
  const raw = await auditUrlWithHooks(`${shop.baseUrl}/product.html`, { allowPrivate: true }, {
    beforeClose: async (page, audit) => {
      seen = { open: !page.isClosed() && (await page.evaluate(() => document.title)).length > 0, boxes: audit.boundingBoxes.length }
    },
  })
  expect(seen).toEqual({ open: true, boxes: raw.boundingBoxes.length })
}) 
