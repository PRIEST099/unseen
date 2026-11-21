import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { auditUrl } from '../src/audit.js'
import type { RawAudit } from '../src/types.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'

let shop: ShopServer
test.beforeAll(async () => {
  shop = await startShopServer()
})
test.afterAll(async () => {
  await shop.close()
})

/**
 * Normalise run-specific values: timestamps, timings, and Chromium-allocated
 * ids (DOM backendNodeIds and AX nodeIds), which differ per renderer. Ids are
 * replaced by their first-seen order in a fixed traversal (bounding boxes are
 * in document order), so every relation between fields stays intact. Keyed
 * maps are re-keyed and sorted by canonical id.
 */
function normalise(a: RawAudit): Record<string, unknown> {
  const dom = new Map<string, string>()
  const ax = new Map<string, string>()
  const c = (m: Map<string, string>, p: string) => (v: unknown) => {
    const k = String(v)
    if (!m.has(k)) m.set(k, `${p}${m.size}`)
    return m.get(k)!
  }
  const d = c(dom, 'd')
  const x = c(ax, 'a')
  a.boundingBoxes.forEach((b) => d(b.backendDOMNodeId))
  a.axNodes.forEach((n) => x(n.nodeId))
  // CDP values keep nested ids verbatim (e.g. relatedNodes[].backendDOMNodeId)
  const deep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(deep)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, val]) => [k, k === 'backendDOMNodeId' || k === 'backendNodeId' ? d(val) : deep(val)])
      )
    }
    return v
  }
  const rekey = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [d(k), v] as const).sort(([p], [q]) => p.localeCompare(q)))
  return {
    ...a,
    auditedAt: '__PLACEHOLDER__',
    screenshotPng: '__COMPARED_SEPARATELY__',
    boundingBoxes: a.boundingBoxes.map((b) => ({ ...b, backendDOMNodeId: d(b.backendDOMNodeId) })),
    axNodes: a.axNodes.map((n) => ({
      ...n,
      nodeId: x(n.nodeId),
      backendDOMNodeId: n.backendDOMNodeId === 0 ? 0 : d(n.backendDOMNodeId),
      properties: deep(n.properties) as typeof n.properties,
      states: deep(n.states) as typeof n.states,
      ignoredReasons: deep(n.ignoredReasons) as typeof n.ignoredReasons,
      name: deep(n.name) as typeof n.name,
      description: deep(n.description) as typeof n.description,
      childIds: n.childIds.map(x),
      parentId: n.parentId === undefined ? undefined : x(n.parentId),
    })),
    textNodeStyles: rekey(a.textNodeStyles),
    elementCursorStyles: rekey(a.elementCursorStyles),
    imgAltAttributes: rekey(a.imgAltAttributes),
    eventListenerSignals: a.eventListenerSignals.map((s) => ({ ...s, backendDOMNodeId: d(s.backendDOMNodeId) })),
    domAxMapping: a.domAxMapping.map((m) => ({ ...m, backendDOMNodeId: d(m.backendDOMNodeId) })),
    tabWalkResult: {
      ...a.tabWalkResult,
      walkStartedAtMs: 0,
      steps: a.tabWalkResult.steps.map((s) => ({ ...s, backendDOMNodeId: d(s.backendDOMNodeId) })),
      trapRegionNodeIds: a.tabWalkResult.trapRegionNodeIds.map(d),
      cycles: a.tabWalkResult.cycles.map((cy) => ({ ...cy, nodeIds: cy.nodeIds.map(d) })),
    },
    resourceUsage: { ...a.resourceUsage, responseTimings: [] },
  }
}

test('two sequential audits of the same page are identical after normalisation', async () => {
  test.setTimeout(150_000)
  const url = `${shop.baseUrl}/index.html`
  const a = await auditUrl(url, { allowPrivate: true })
  const b = await auditUrl(url, { allowPrivate: true })
  const na = normalise(a) as Record<string, unknown>
  const nb = normalise(b) as Record<string, unknown>
  const differing = Object.keys(na).filter((k) => JSON.stringify(na[k]) !== JSON.stringify(nb[k]))
  const detail = differing.map((k) => {
    const pa = na[k] as unknown[]
    const pb = nb[k] as unknown[]
    if (!Array.isArray(pa) || !Array.isArray(pb)) return k
    const i = pa.findIndex((v, j) => JSON.stringify(v) !== JSON.stringify(pb[j]))
    return `${k}[${i}] (len ${pa.length} vs ${pb.length}): ${JSON.stringify(pa[i]).slice(0, 600)} || ${JSON.stringify(pb[i]).slice(0, 600)}`
  })
  expect(detail).toEqual([])
  const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'base64')).digest('hex')
  if (a.screenshotPng !== b.screenshotPng) {
    // Amendment 6: font rasterisation can make PNG bytes differ; record, do not fail.
    const note = `${sha(a.screenshotPng)} vs ${sha(b.screenshotPng)}`
    test.info().annotations.push({ type: 'screenshot-mismatch', description: note })
    console.warn(`screenshot SHA-256 mismatch: ${note}`)
  }
})
