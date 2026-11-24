import { test, expect } from '@playwright/test'
import type { Page } from 'playwright'
import { BrowserPool } from '../src/runner/browser.js'
import { walkTabs, walkTabsWithErrors } from '../src/runner/tab-walker.js'
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
    // the external stylesheet (allowed by style-src 'self') really sets a 3 s transition ...
    const before = await page.evaluate(() => getComputedStyle(document.querySelector('a')!).transitionDuration)
    expect(before).toBe('3s')
    const r = await walkTabs(page)
    expect(r.trapDetected).toBe(false)
    expect(r.steps.length).toBeGreaterThanOrEqual(3)
    // ... and the walk turned transitions off in spite of the CSP, so the check is not vacuous
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

// Findings 5 and 6 (run 19b): focus that comes back after prepare() is the first step, with an unfocused baseline.
for (const [name, first] of [
  ['focusin-trap.html', 'email'],
  ['focusin-trap-window.html', 'email'],
  ['dialog-modal.html', 'field'],
] as const) {
  test(`findings 5 and 6: ${name} starts at ${first} with before different from after`, async () => {
    await withPage(pool, `${pages.baseUrl}/${name}`, async (page) => {
      const r = await walkTabs(page)
      const labels = await stepLabels(page, r.steps.map((s) => s.backendDOMNodeId))
      expect(labels[0]).toBe(first)
      expect(labels).toContain('ok')
      const step = r.steps[0]!
      expect(step.cdpError).toBe(false)
      expect(step.focusSnapshot.before['outline-style']).toBe('none')
      expect(step.focusSnapshot.after['outline-style']).toBe('solid')
    })
  })
}

// Finding 7 (run 19b): a dialog that closes on Escape is not a Cursed Loop (hauntings.md §5).
for (const name of ['escape-removes-dialog.html', 'escape-hides-dialog.html']) {
  test(`finding 7: ${name} (closes on Escape) is escapable and the walk goes on`, async () => {
    await withPage(pool, `${pages.baseUrl}/${name}`, async (page) => {
      const r = await walkTabs(page)
      expect(r.trapDetected).toBe(false)
      expect(r.endReason).not.toBe('trap')
      expect(r.cycles[0]).toMatchObject({ escapable: true, includesAllFocusables: false })
      const labels = await stepLabels(page, r.steps.filter((s) => s.backendDOMNodeId !== '').map((s) => s.backendDOMNodeId))
      expect(labels).toContain('x')
      expect(labels).toContain('y')
    })
  })
}

// Finding 1 (run 19b): presses inside a composite host have their own budget.
test('finding 1: a 60-link cross-origin embed does not eat the step cap', async () => {
  await withPage(pool, `${pages.baseUrl}/iframe-big-cross-origin.html`, async (page) => {
    const { walk: r, errors } = await walkTabsWithErrors(page)
    const labels = await stepLabels(page, r.steps.map((s) => s.backendDOMNodeId))
    expect(labels).toEqual(expect.arrayContaining(['one', 'two', 'three', 'four']))
    expect(r.endReason).toBe('body')
    expect(r.stepCapReached).toBe(false)
    expect(r.trapDetected).toBe(false)
    expect(errors).toEqual([])
    // the embed has more links than the 50-press sub-cap, so its step is flagged
    expect(r.steps.filter((s) => s.compositeTruncated)).toHaveLength(1)
    expect(r.steps.length).toBeLessThanOrEqual(6)
  })
})

for (const name of ['iframe-trap-cross-origin.html', 'shadow-closed-trap.html']) {
  test(`finding 1: a keyboard trap inside ${name} ends with composite-stuck and a CollectionError`, async () => {
    await withPage(pool, `${pages.baseUrl}/${name}`, async (page) => {
      const { walk: r, errors } = await walkTabsWithErrors(page)
      expect(r.endReason).toBe('composite-stuck')
      expect(r.stepCapReached).toBe(false)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({ step: 'tab-walk' })
      expect(errors[0]!.message).toMatch(/frame or shadow root/)
    })
  })
}

// Run 19b, new edges around findings 8, 10 and 23.
test('finding 23: a focusable that only exists while focus is inside gets a real baseline', async () => {
  await withPage(pool, `${pages.baseUrl}/focus-within-menu.html`, async (page) => {
    const r = await walkTabs(page)
    const labels = await stepLabels(page, r.steps.map((s) => s.backendDOMNodeId))
    expect(labels).toEqual(['menu', 's1', 's2', 'end'])
    expect(r.endReason).toBe('body')
    for (const s of r.steps) {
      expect(s.cdpError).toBe(false)
      expect(s.baselineUnavailable).toBeUndefined()
      expect(Object.keys(s.focusSnapshot.before).sort()).toEqual(Object.keys(s.focusSnapshot.after).sort())
      expect(s.focusSnapshot.before['outline-style']).toBe('none')
      expect(s.focusSnapshot.after['outline-style']).toBe('solid')
    }
  })
})

test('finding 8: a cycle that can only be left backwards ends with cycle-repeated, not at the step cap', async () => {
  await withPage(pool, `${pages.baseUrl}/cycle-backwards-only.html`, async (page) => {
    const r = await walkTabs(page)
    expect(r.endReason).toBe('cycle-repeated')
    expect(r.stepCapReached).toBe(false)
    expect(r.trapDetected).toBe(false)
    expect(r.cycles).toHaveLength(2)
    expect(r.cycles.every((c) => c.escapable === true)).toBe(true)
  })
})

test('finding 10: a navigation during the walk ends it with navigated', async () => {
  await withPage(pool, `${pages.baseUrl}/navigate-on-focus.html`, async (page) => {
    const r = await walkTabs(page)
    expect(r.endReason).toBe('navigated')
    expect(r.trapDetected).toBe(false)
    expect(r.stepCapReached).toBe(false)
    expect(r.steps.length).toBeLessThanOrEqual(2)
  })
})