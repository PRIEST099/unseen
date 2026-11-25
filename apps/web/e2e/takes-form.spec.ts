import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const HOME = '/sample/cursed-shop-index'
const OVERLAYS = '.haunting-overlay-button'

type Observed = { name: string; duration: string; easing: string }
type ObservedWindow = Window & { __takesForm?: Observed[] }

async function openSpiritSight(page: Page): Promise<void> {
  await page.goto(HOME)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Spirit Sight: ')
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open Spirit Sight' }).click()
  await expect(page.locator('.status-line')).toHaveText(/^Spirit Sight open: /, { timeout: 10_000 })
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
}

/** Records the computed animation of every `.takes-form` element the moment it is added to the DOM. */
async function observeTakesForm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w: ObservedWindow = window
    w.__takesForm = []
    new MutationObserver((records) => {
      const record = (target: Element): void => {
        const style = getComputedStyle(target)
        w.__takesForm?.push({ name: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction })
      }
      for (const change of records) {
        // The overlay element keeps its place in the DOM and swaps its class to `takes-form`.
        if (change.type === 'attributes' && change.target instanceof Element && change.target.matches('.takes-form')) record(change.target)
        change.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.matches('.takes-form')) record(node)
          node.querySelectorAll('.takes-form').forEach(record)
        })
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  })
}

async function recorded(page: Page): Promise<Observed[]> {
  return page.evaluate(() => {
    const w: ObservedWindow = window
    return w.__takesForm ?? []
  })
}

async function scoreOf(page: Page): Promise<number> {
  return Number(await page.locator('.score-value').innerText())
}

async function previewFirstNamelessSpirit(page: Page): Promise<string> {
  const trigger = page.locator(`${OVERLAYS}[aria-label^="Nameless Spirit"]`).first()
  const id = (await trigger.getAttribute('data-haunting-id')) ?? ''
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Preview fix' }).click()
  await expect(dialog).toBeHidden()
  return id
}

test.describe('Takes form: previewed fix', () => {
  test('removes the overlay after a 600ms bounce, lowers the score, says it is a preview and can be reset', async ({ page }) => {
    await openSpiritSight(page)
    const auditedScore = await scoreOf(page)
    const overlaysBefore = await page.locator(OVERLAYS).count()
    await observeTakesForm(page)

    // The dialog says what the button does before it is used.
    await page.locator(`${OVERLAYS}[aria-label^="Nameless Spirit"]`).first().click()
    await expect(page.getByRole('dialog')).toContainText('Preview only')
    await expect(page.getByRole('dialog')).toContainText('the audit is not re-run')
    await page.keyboard.press('Escape')

    const fixedId = await previewFirstNamelessSpirit(page)

    // The score drops, the preview is announced and labelled as a preview.
    const previewScoreValue = await scoreOf(page)
    expect(previewScoreValue).toBeLessThan(auditedScore)
    await expect(page.locator('.status-line')).toHaveText(`Nameless Spirit exorcised: score now ${previewScoreValue} (preview, audit not re-run)`)
    const banner = page.locator('.preview-banner')
    await expect(banner).toContainText('Preview only')
    await expect(banner).toContainText('the audit has not been re-run')
    await expect(banner).toContainText(`audited score ${auditedScore}`)
    await expect(page.locator('.spirit-sidebar')).toContainText(`Audited score: ${auditedScore}/100`)
    await expect(page.locator('main')).not.toContainText(/compliant/i)

    // The visual used the 600ms bounce, then was removed from the DOM.
    const seen = await recorded(page)
    expect(seen).toContainEqual({ name: 'takes-form', duration: '0.6s', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' })
    await expect(page.locator('.takes-form')).toHaveCount(0)
    await expect(page.locator(OVERLAYS)).toHaveCount(overlaysBefore - 1)
    await expect(page.locator(`[data-haunting-id="${fixedId}"]`)).toHaveCount(0)

    // Focus moved to another overlay, not to the page body.
    const focused = await page.evaluate(() => {
      const active = document.activeElement
      return { isOverlay: active?.classList.contains('haunting-overlay-button') ?? false, id: active instanceof HTMLElement ? (active.dataset.hauntingId ?? '') : '' }
    })
    expect(focused.isOverlay).toBe(true)
    expect(focused.id).not.toBe(fixedId)

    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])

    // Reset puts the audited result back and moves focus to the sidebar heading.
    await banner.getByRole('button', { name: 'Reset preview' }).click()
    await expect(page.locator('.preview-banner')).toHaveCount(0)
    expect(await scoreOf(page)).toBe(auditedScore)
    await expect(page.locator(OVERLAYS)).toHaveCount(overlaysBefore)
    await expect(page.locator('.status-line')).toHaveText(`Preview reset: score back to ${auditedScore}, as audited`)
    await expect(page.locator('#haunting-list')).toBeFocused()
  })

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('uses a 100ms opacity fade and still removes the overlay', async ({ page }) => {
      await openSpiritSight(page)
      const overlaysBefore = await page.locator(OVERLAYS).count()
      await observeTakesForm(page)
      await previewFirstNamelessSpirit(page)

      const seen = await recorded(page)
      expect(seen).toContainEqual({ name: 'takes-form-fade', duration: '0.1s', easing: 'linear' })
      await expect(page.locator('.takes-form')).toHaveCount(0)
      await expect(page.locator(OVERLAYS)).toHaveCount(overlaysBefore - 1)
    })
  })
})
