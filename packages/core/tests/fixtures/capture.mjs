// Captures the three Cursed Shop RawAudit fixtures and their selector sidecars.
// Run with: npm run capture:fixtures -w @the-unseen/core   (builds first)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { auditUrlWithHooks } from '../../dist/audit.js'
import { getPool } from '../../dist/index.js'
import { startShopServer } from './shop-server.ts'

const RAW_DIR = fileURLToPath(new URL('./raw/', import.meta.url))
const GOLDEN = fileURLToPath(new URL('../../../../apps/cursed-shop/expected-hauntings.json', import.meta.url))
const PAGES = ['index', 'product', 'checkout']
const EXPECTED_END_REASON = { index: 'body', product: 'body', checkout: 'trap' }

/** Recursively sort object keys so the committed JSON is stable. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]))
  }
  return value
}

function collectElementIds(node, out) {
  if (node.nodeType === 1) out.push(node.backendNodeId)
  for (const child of node.children ?? []) collectElementIds(child, out)
  return out
}

/** Resolve one selector to { self, subtree } backendDOMNodeId lists, through CDP. */
async function resolveSelector(cdp, rootNodeId, selector) {
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: rootNodeId, selector })
  const self = []
  const subtree = []
  for (const nodeId of nodeIds) {
    const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: -1 })
    self.push(node.backendNodeId)
    subtree.push(...collectElementIds(node, []))
  }
  return { self, subtree }
}

async function resolveGolden(page, golden, raw) {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    const total = await page.evaluate(() => document.querySelectorAll('*').length)
    if (total !== raw.boundingBoxes.length) {
      throw new Error(`${total} elements in the page but ${raw.boundingBoxes.length} bounding boxes`)
    }
    const boxIds = new Set(raw.boundingBoxes.map((b) => b.backendDOMNodeId))
    const resolveAll = async (selectors, mustBeSingle, label) => {
      const out = {}
      for (const selector of selectors) {
        const r = await resolveSelector(cdp, root.nodeId, selector)
        if (mustBeSingle && r.self.length !== 1) throw new Error(`${label}: "${selector}" matched ${r.self.length} elements`)
        if (r.self.length === 0) throw new Error(`${label}: "${selector}" matched nothing`)
        for (const id of r.self) if (!boxIds.has(id)) throw new Error(`${label}: id ${id} for "${selector}" is not in boundingBoxes`)
        out[selector] = r
      }
      return out
    }
    const hauntings = {}
    for (const [type, entry] of Object.entries(golden.hauntings)) {
      hauntings[type] = await resolveAll(entry.selectors, type !== 'CursedLoop', `${type}`)
    }
    const controls = {}
    for (const [name, entry] of Object.entries(golden.controls ?? {})) {
      controls[name] = await resolveAll(entry.selectors, true, `control ${name}`)
    }
    return { hauntings, controls }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

async function capturePage(shop, name, golden) {
  let sidecar
  const raw = await auditUrlWithHooks(
    `${shop.baseUrl}/${name}.html`,
    { allowPrivate: true },
    {
      beforeClose: async (page, audit) => {
        sidecar = await resolveGolden(page, golden[`${name}.html`], audit)
      },
    }
  )
  if (raw.collectionErrors.length !== 0) {
    throw new Error(`${name}: collectionErrors: ${JSON.stringify(raw.collectionErrors)}`)
  }
  if (raw.tabWalkResult.endReason !== EXPECTED_END_REASON[name]) {
    throw new Error(`${name}: endReason ${raw.tabWalkResult.endReason}, expected ${EXPECTED_END_REASON[name]}`)
  }
  const stored = sortKeys({ ...raw, screenshotPng: '' })
  await writeFile(`${RAW_DIR}${name}.json`, `${JSON.stringify(stored, null, 1)}\n`)
  await writeFile(`${RAW_DIR}${name}.selectors.json`, `${JSON.stringify(sortKeys(sidecar), null, 1)}\n`)
  console.log(`captured ${name}: ${raw.boundingBoxes.length} boxes, ${Object.keys(raw.domNodes).length} domNodes`)
}

async function main() {
  const golden = JSON.parse(await readFile(GOLDEN, 'utf8'))
  await mkdir(RAW_DIR, { recursive: true })
  const shop = await startShopServer()
  try {
    for (const name of PAGES) await capturePage(shop, name, golden)
  } finally {
    await getPool().close()
    await shop.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
