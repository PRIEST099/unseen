import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { STABLE_HTML_ORIGIN, auditHtml, auditUrl } from '../src/audit.js'
import type { AxeViolation, RawAudit } from '../src/types.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'

let shop: ShopServer
test.beforeAll(async () => {
  shop = await startShopServer()
})
test.afterAll(async () => {
  await shop.close()
})

/** Canonicalise the DOM ids on axe nodes (null ids stay null). */
const canonAxe =
  (d: (v: unknown) => string) =>
  (v: AxeViolation): Record<string, unknown> => ({
    ...v,
    nodes: v.nodes.map((n) => ({ ...n, backendDOMNodeId: n.backendDOMNodeId === null ? null : d(n.backendDOMNodeId) })),
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
    imgSrcAttributes: rekey(a.imgSrcAttributes),
    domNodes: rekey(
      Object.fromEntries(
        Object.entries(a.domNodes).map(([k, v]) => [k, { ...v, parentId: v.parentId === null ? null : d(v.parentId) }])
      )
    ),
    pageMetadata: {
      ...a.pageMetadata,
      htmlBackendDOMNodeId: d(a.pageMetadata.htmlBackendDOMNodeId),
      bodyBackendDOMNodeId: a.pageMetadata.bodyBackendDOMNodeId === null ? null : d(a.pageMetadata.bodyBackendDOMNodeId),
      headings: a.pageMetadata.headings.map((h) => ({ ...h, backendDOMNodeId: h.backendDOMNodeId === 0 ? 0 : d(h.backendDOMNodeId) })),
    },
    axeViolations: a.axeViolations.map(canonAxe(d)),
    axeIncomplete: a.axeIncomplete.map(canonAxe(d)),
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

/** Names the top-level fields that differ, with the first differing entry of array fields. */
function differences(na: Record<string, unknown>, nb: Record<string, unknown>): string[] {
  const differing = Object.keys(na).filter((k) => JSON.stringify(na[k]) !== JSON.stringify(nb[k]))
  return differing.map((k) => {
    const pa = na[k]
    const pb = nb[k]
    if (!Array.isArray(pa) || !Array.isArray(pb)) return k
    const i = pa.findIndex((v, j) => JSON.stringify(v) !== JSON.stringify(pb[j]))
    return `${k}[${i}] (len ${pa.length} vs ${pb.length}): ${JSON.stringify(pa[i]).slice(0, 600)} || ${JSON.stringify(pb[i]).slice(0, 600)}`
  })
}

const sha = (s: string): string => createHash('sha256').update(Buffer.from(s, 'base64')).digest('hex')

test('two sequential audits of the same page are identical after normalisation', async () => {
  test.setTimeout(150_000)
  const url = `${shop.baseUrl}/index.html`
  const a = await auditUrl(url, { allowPrivate: true })
  const b = await auditUrl(url, { allowPrivate: true })
  expect(differences(normalise(a), normalise(b))).toEqual([])
  // Req 12.6: the screenshots are byte-identical. Drift is tolerated only behind an explicit opt-in,
  // for machines where font rasterisation is shown to differ between runs.
  if (process.env.UNSEEN_ALLOW_SCREENSHOT_DRIFT === '1') {
    if (a.screenshotPng !== b.screenshotPng) {
      test.info().annotations.push({ type: 'screenshot-mismatch', description: `${sha(a.screenshotPng)} vs ${sha(b.screenshotPng)}` })
    }
    return
  }
  expect(sha(a.screenshotPng)).toBe(sha(b.screenshotPng))
})

// Finding 39: auditHtml must also be deterministic, so the random local port must not leak into the audit.
test('two auditHtml runs of the same HTML are identical, with a stable origin', async () => {
  test.setTimeout(150_000)
  const html =
    '<!doctype html><html lang="en"><body><main><h1>Hi</h1><a href="/x">link</a><img src="http://127.0.0.1:1/x.png" alt=""></main></body></html>'
  const a = await auditHtml(html, { allowPrivate: true })
  const b = await auditHtml(html, { allowPrivate: true })
  expect(a.auditedUrl).toBe(`${STABLE_HTML_ORIGIN}/`)
  expect(a.auditedUrl).toBe(b.auditedUrl)
  expect(differences(normalise(a), normalise(b))).toEqual([])
  expect(sha(a.screenshotPng)).toBe(sha(b.screenshotPng))
  // the strict JSON round-trip of Req 12.3 holds for the whole audit
  expect(JSON.parse(JSON.stringify(a))).toStrictEqual(a)
})