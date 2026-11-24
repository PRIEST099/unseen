import { test, expect } from '@playwright/test'
import { BrowserPool, collectBoundingBoxes } from '../src/runner/browser.js'
import { startPagesServer, type PagesServer } from './fixtures/pages-server.js'
import { withPage } from './fixtures/load.js'
import { backendIdOf } from './fixtures/dom.js'

let pages: PagesServer
let pool: BrowserPool
test.beforeAll(async () => {
  pages = await startPagesServer()
  pool = new BrowserPool({ maxConcurrency: 1 })
})
test.afterAll(async () => {
  await pool.close()
  await pages.close()
})

// Run 22 defect: boxes were paired with ids by index across two snapshots, so a page that
// adds or removes elements while loading threw "DOM/CDP element count mismatch".
test('a page that adds and removes elements during load still loads, and boxes pair by identity', async () => {
  // loadPage itself calls collectBoundingBoxes while the churn timer is running.
  await withPage(pool, `${pages.baseUrl}/box-churn.html`, async (page) => {
    const expected: Record<string, { width: number; height: number }> = {
      '#stable-a': { width: 101, height: 11 },
      '#stable-b': { width: 102, height: 12 },
      '#stable-c': { width: 103, height: 13 },
    }
    // Several rounds: every round races the churn timer between the two snapshots.
    for (let round = 0; round < 5; round++) {
      const boxes = await collectBoundingBoxes(page)
      const ids = boxes.map((b) => b.backendDOMNodeId)
      expect(new Set(ids).size).toBe(ids.length)
      for (const [selector, size] of Object.entries(expected)) {
        const id = Number(await backendIdOf(page, selector))
        const box = boxes.find((b) => b.backendDOMNodeId === id)
        expect(box, selector).toBeDefined()
        expect(box!.width).toBeCloseTo(size.width, 0)
        expect(box!.height).toBeCloseTo(size.height, 0)
      }
    }
    // The temporary pairing attribute never leaks into the page.
    expect(await page.evaluate(() => document.querySelectorAll('[data-unseen-bb]').length)).toBe(0)
  })
})
