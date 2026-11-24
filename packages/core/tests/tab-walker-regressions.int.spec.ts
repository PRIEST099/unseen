import { test, expect } from '@playwright/test'
import type { Page } from 'playwright'
import { BrowserPool } from '../src/runner/browser.js'
import { walkTabs } from '../src/runner/tab-walker.js'
import { startPagesServer, type PagesServer } from './fixtures/pages-server.js'
import { withPage } from './fixtures/load.js'

let pages: PagesServer
let pool: BrowserPool
test.beforeAll(async () => {
  pages = await startPagesServer({ headers: { 'csp-style-src.html': { 'content-security-policy': "style-src 'self'" } } })
  pool = new BrowserPool({ maxConcurrency: 1 })
})
test.afterAll(async () => {
  await pool.close()
  await pages.close()
})

/** Text content of each stepped element, via CDP. */
async function stepLabels(page: Page, ids: string[]): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page)
  const out: string[] = []
  for (const id of ids) {
    const { object } = (await cdp.send('DOM.resolveNode', { backendNodeId: Number(id) })) as { object: { objectId: string } }
    const { result } = (await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: 'function(){ return (this.textContent || this.id || this.tagName).trim() }',
      returnByValue: true,
    })) as { result: { value: string } }
    out.push(result.value)
  }
  return out
}

// Finding 1: focus moving inside a frame or a web component is not a cycle.
for (const name of ['iframe-same-origin.html', 'iframe-cross-origin.html', 'shadow-component.html']) {
  test(`finding 1: ${name} is not a keyboard trap`, async () => {
    await withPage(pool, `${pages.baseUrl}/${name}`, async (page) => {
      const r = await walkTabs(page)
      expect(r.trapDetected).toBe(false)
      expect(r.endReason).not.toBe('trap')
      const labels = await stepLabels(page, [...new Set(r.steps.map((s) => s.backendDOMNodeId))])
      expect(labels).toContain('one')
      expect(labels).toContain('three')
    })
  })
}

test('finding 1: same-origin frame and shadow contents are visited as steps', async () => {
  await withPage(pool, `${pages.baseUrl}/iframe-same-origin.html`, async (page) => {
    const r = await walkTabs(page)
    const labels = await stepLabels(page, r.steps.map((s) => s.backendDOMNodeId))
    for (const l of ['one', 'x', 'y', 'z', 'two', 'three']) expect(labels).toContain(l)
  })
  await withPage(pool, `${pages.baseUrl}/shadow-component.html`, async (page) => {
    const r = await walkTabs(page)
    const labels = await stepLabels(page, r.steps.map((s) => s.backendDOMNodeId))
    for (const l of ['one', 'Bold', 'Italic', 'Underline', 'two', 'three']) expect(labels).toContain(l)
  })
})

// Findings 2 and 17: a strict style-src CSP must not break the walk.
test('findings 2 and 17: the walk works under style-src CSP', async () => {
  await withPage(pool, `${pages.baseUrl}/csp-style-src.html`, async (page) => {
    const r = await walkTabs(page)
    expect(r.trapDetected).toBe(false)
    expect(r.steps.length).toBeGreaterThanOrEqual(3)
    // transitions really are off: nothing animates in the page
    const transition = await page.evaluate(() => getComputedStyle(document.querySelector('a')!).transitionDuration)
    expect(transition).toBe('0s')
  })
})

// Finding 5: the walk starts at the top of the document, not at the autofocused element.
test('finding 5: elements before an autofocused field are still walked', async () => {
  await withPage(pool, `${pages.baseUrl}/autofocus-start.html`, async (page) => {
    const r = await walkTabs(page)
    const labels = await stepLabels(page, r.steps.map((s) => s.backendDOMNodeId))
    expect(labels.slice(0, 3)).toEqual(['a', 'field', 'b'])
  })
})

// Finding 6: the baseline is the unfocused look, even for an element focused at load.
test('finding 6: an autofocused element has a different before and after background', async () => {
  await withPage(pool, `${pages.baseUrl}/autofocus-background.html`, async (page) => {
    const r = await walkTabs(page)
    const first = r.steps[0]!
    expect(first.focusSnapshot.before['background-color']).toBe('rgb(255, 255, 255)')
    expect(first.focusSnapshot.after['background-color']).toBe('rgb(0, 0, 0)')
  })
})

// Finding 9: CSS Color 4 ancestors are read as the adjacent background.
test('finding 9: an oklch ancestor is the adjacent background, a translucent one is skipped', async () => {
  await withPage(pool, `${pages.baseUrl}/oklch-adjacent.html`, async (page) => {
    const r = await walkTabs(page)
    const [dark, translucent] = r.steps
    expect(dark!.focusSnapshot.after['adjacent-background-color']).toMatch(/^oklch\(0\.2 0 0\)$/)
    expect(translucent!.focusSnapshot.after['adjacent-background-color']).toBe('rgb(255, 255, 255)')
  })
})

// Finding 7: no element focused after the escape test is a trap (Req 11.8).
test('finding 7: focus lost after Escape and Shift+Tab is declared a trap', async () => {
  await withPage(pool, `${pages.baseUrl}/escape-to-body.html`, async (page) => {
    const r = await walkTabs(page)
    expect(r.trapDetected).toBe(true)
    expect(r.endReason).toBe('trap')
    expect(r.cycles[0]!.escapable).toBe(false)
  })
})
