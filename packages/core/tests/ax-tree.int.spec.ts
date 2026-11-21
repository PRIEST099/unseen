import { test, expect } from '@playwright/test'
import { BrowserPool, PageLoader } from '../src/runner/browser.js'
import { collectAxTree, isInlineTextBox } from '../src/runner/ax-tree.js'
import { PermissiveSafeFetchPolicy } from '../src/runner/safe-fetch.js'
import { startShopServer, type ShopServer } from './fixtures/shop-server.js'

const INTERACTIVE = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox',
  'radio', 'switch', 'option', 'combobox', 'listbox', 'treeitem', 'gridcell',
])

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

async function axFor(path: string) {
  const browser = await pool.acquire()
  const loader = new PageLoader()
  const context = await loader.createContext(browser)
  try {
    const { page } = await loader.loadPage(context, `${shop.baseUrl}/${path}`, new PermissiveSafeFetchPolicy())
    return await collectAxTree(page)
  } finally {
    await context.close()
    await pool.release(browser)
  }
}

test('index: Nameless Spirit candidates are reachable (Req 15.2)', async () => {
  const nodes = await axFor('index.html')
  expect(nodes.length).toBeGreaterThan(0)
  const nameless = nodes.filter(
    (n) => !n.ignored && INTERACTIVE.has(String(n.role.value)) && String(n.name.value ?? '').trim() === ''
  )
  expect(nameless.length).toBeGreaterThan(0)
  // every non-InlineTextBox node carries a DOM id
  expect(nodes.filter((n) => !isInlineTextBox(n)).every((n) => n.backendDOMNodeId > 0)).toBe(true)
})

test('checkout: name.sources are kept verbatim, including placeholder', async () => {
  const nodes = await axFor('checkout.html')
  const placeholderNamed = nodes.filter((n) =>
    (n.name.sources ?? []).some((s) => s.attribute === 'placeholder' && s.value !== undefined && !s.superseded)
  )
  expect(placeholderNamed.length).toBeGreaterThanOrEqual(3)
})
