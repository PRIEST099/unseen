import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const HOME = '/sample/cursed-shop-index'
const OVERLAYS = '.haunting-overlay-button'
const TOGGLE = 'Open Spirit Sight'

/** What is visible at one moment of the takes-form animation. */
type Sample = { t: number; group: number; treatment: number; outline: number; scaleX: number }
type Observed = { name: string; duration: string; easing: string; samples: Sample[] }
type ObservedWindow = Window & { __takesForm?: Observed[] }

async function openSpiritSight(page: Page): Promise<{ count: number; score: number }> {
  await page.goto(HOME)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Spirit Sight: ')
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
  await page.getByRole('button', { name: TOGGLE }).click()
  const status = page.locator('.status-line')
  await expect(status).toHaveText(/^Spirit Sight open: \d+ hauntings, score \d+$/, { timeout: 10_000 })
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
  const [, count, score] = /^Spirit Sight open: (\d+) hauntings, score (\d+)$/.exec(await status.innerText()) ?? []
  return { count: Number(count), score: Number(score) }
}

/**
 * Records the computed animation of every `.takes-form` element the moment it appears and, while it
 * is still in the DOM, seeks its animations to sample what is visible at 300 ms and at 590 ms.
 */
async function observeTakesForm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w: ObservedWindow = window
    w.__takesForm = []
    const seen = new WeakSet<Element>()
    const opacity = (element: Element | null): number => (element === null ? -1 : Number(getComputedStyle(element).opacity))
    const sampleAt = (group: Element, animations: Animation[], t: number): Sample => {
      animations.forEach((animation) => {
        animation.currentTime = t
      })
      const transform = getComputedStyle(group).transform
      const match = /^matrix\(([-\d.e]+)/.exec(transform)
      return {
        t,
        group: opacity(group),
        treatment: opacity(group.querySelector('.takes-form-treatment')),
        outline: opacity(group.querySelector('.v-takes-form-outline')),
        scaleX: match === null ? 1 : Number(match[1]),
      }
    }
    const record = (target: Element): void => {
      if (seen.has(target)) return
      seen.add(target)
      const style = getComputedStyle(target)
      const animations = target.getAnimations({ subtree: true })
      const original = animations.map((animation) => animation.currentTime)
      const samples = [sampleAt(target, animations, 300), sampleAt(target, animations, 590)]
      animations.forEach((animation, index) => {
        animation.currentTime = original[index] ?? 0
      })
      w.__takesForm?.push({ name: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction, samples })
    }
    new MutationObserver((records) => {
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

async function stageTop(page: Page): Promise<number> {
  return page.locator('.spirit-stage').evaluate((stage) => stage.getBoundingClientRect().top + window.scrollY)
}

type StageWindow = Window & { __stageTopsWhileForming?: number[] }

/**
 * Records where the stage is in the document every time the DOM changes while a haunting takes
 * form. The commit that starts the animation also mounts the preview notice, so the first record
 * is the stage position in that same frame.
 */
async function watchStageWhileForming(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w: StageWindow = window
    w.__stageTopsWhileForming = []
    const stage = document.querySelector('.spirit-stage')
    new MutationObserver(() => {
      if (stage === null || document.querySelector('.takes-form') === null) return
      w.__stageTopsWhileForming?.push(stage.getBoundingClientRect().top + window.scrollY)
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  })
}

async function stageTopsWhileForming(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w: StageWindow = window
    return w.__stageTopsWhileForming ?? []
  })
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
  test('removes the overlay after a visible 600ms bounce, lowers the score, says it is a preview and can be reset', async ({ page }) => {
    const opened = await openSpiritSight(page)
    const auditedScore = await scoreOf(page)
    expect(auditedScore).toBe(opened.score)
    const overlaysBefore = await page.locator(OVERLAYS).count()
    const topBefore = await stageTop(page)
    await observeTakesForm(page)

    // The dialog says what the button does before it is used.
    await page.locator(`${OVERLAYS}[aria-label^="Nameless Spirit"]`).first().click()
    await expect(page.getByRole('dialog')).toContainText('Preview only')
    await expect(page.getByRole('dialog')).toContainText('the audit is not re-run')
    await page.keyboard.press('Escape')

    const fixedId = await previewFirstNamelessSpirit(page)

    // The score drops, the preview is announced with the remaining count and labelled as a preview.
    const previewScoreValue = await scoreOf(page)
    expect(previewScoreValue).toBeLessThan(auditedScore)
    await expect(page.locator('.status-line')).toHaveText(
      `Nameless Spirit exorcised: ${opened.count - 1} hauntings left, score now ${previewScoreValue} (preview, audit not re-run)`,
    )
    // The notice sits in the sidebar under the score, so the screenshot does not move.
    const banner = page.locator('.spirit-sidebar .preview-banner')
    await expect(banner).toContainText('Preview only')
    await expect(banner).toContainText('the audit has not been re-run')
    await expect(page.locator('.spirit-sidebar')).toContainText(`Audited score: ${auditedScore}/100`)
    await expect(page.locator('main')).not.toContainText(/compliant/i)
    expect(await stageTop(page)).toBe(topBefore)

    // The bounce drives transform only; opacity has its own late ease-out fade.
    const seen = await recorded(page)
    expect(seen.length).toBeGreaterThan(0)
    const first = seen[0]
    expect(first?.name).toBe('takes-form-bounce, takes-form-vanish')
    expect(first?.duration).toBe('0.6s, 0.6s')
    expect(first?.easing).toBe('cubic-bezier(0.34, 1.56, 0.64, 1), linear')
    // Mid-animation the ghost is still there: bounced, opaque, and resolved into the crisp outline.
    const mid = first?.samples.find((sample) => sample.t === 300)
    expect(mid?.group).toBeGreaterThan(0.5)
    expect(mid?.outline).toBeGreaterThan(0.5)
    expect(mid?.treatment).toBeLessThan(0.5)
    expect(mid?.scaleX).toBeGreaterThan(1)
    // Near the end it has faded.
    const late = first?.samples.find((sample) => sample.t === 590)
    expect(late?.group).toBeLessThan(0.3)

    // Then it is removed from the DOM.
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
    await expect(page.locator('.spirit-sidebar .preview-hint')).toBeVisible()
    expect(await scoreOf(page)).toBe(auditedScore)
    await expect(page.locator(OVERLAYS)).toHaveCount(overlaysBefore)
    await expect(page.locator('.status-line')).toHaveText(`Preview reset: score back to ${auditedScore}, as audited`)
    await expect(page.locator('#haunting-list')).toBeFocused()
    expect(await stageTop(page)).toBe(topBefore)
  })

  test('preview, close, reopen, reset: the reopen says it is a preview and the overlay comes back', async ({ page }) => {
    const opened = await openSpiritSight(page)
    const overlaysBefore = await page.locator(OVERLAYS).count()
    const fixedId = await previewFirstNamelessSpirit(page)
    await expect(page.locator('.takes-form')).toHaveCount(0)
    const previewScoreValue = await scoreOf(page)

    const toggle = page.getByRole('button', { name: TOGGLE })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator(OVERLAYS)).toHaveCount(0)

    await toggle.click()
    await expect(page.locator('.status-line')).toHaveText(
      `Spirit Sight open (preview): ${opened.count - 1} hauntings, preview score ${previewScoreValue}, audited score ${opened.score}`,
      { timeout: 10_000 },
    )
    await expect(page.locator(OVERLAYS)).toHaveCount(overlaysBefore - 1)
    await expect(page.locator(`[data-haunting-id="${fixedId}"]`)).toHaveCount(0)

    await page.locator('.spirit-sidebar .preview-banner').getByRole('button', { name: 'Reset preview' }).click()
    await expect(page.locator(OVERLAYS)).toHaveCount(overlaysBefore)
    await expect(page.locator(`${OVERLAYS}[data-haunting-id="${fixedId}"]`)).toHaveCount(1)
    expect(await scoreOf(page)).toBe(opened.score)
  })

  test.describe('in the one-column layout', () => {
    // At 60rem and below the sidebar sits above the screenshot.
    test.use({ viewport: { width: 800, height: 900 } })

    test('the screenshot stays put before, during and after a preview, and a previewed instance keeps its row', async ({ page }) => {
      await openSpiritSight(page)
      const sidebarBox = await page.locator('.spirit-sidebar').boundingBox()
      const stageBox = await page.locator('.spirit-stage').boundingBox()
      expect((sidebarBox?.y ?? 0) + (sidebarBox?.height ?? 0)).toBeLessThanOrEqual(stageBox?.y ?? 0)

      // An expanded group, so the instance list is part of what sits above the stage.
      const group = page.locator('.group-toggle', { hasText: 'Nameless Spirit' })
      await group.click()
      await expect(group).toHaveAttribute('aria-expanded', 'true')
      const groupCount = Number(await group.locator('.group-count').innerText())
      await expect(page.locator('.spirit-sidebar .preview-hint')).toBeVisible()
      const topBefore = await stageTop(page)

      await watchStageWhileForming(page)
      const fixedId = await previewFirstNamelessSpirit(page)
      await expect(page.locator('.takes-form')).toHaveCount(0)
      const during = await stageTopsWhileForming(page)
      expect(during.length).toBeGreaterThan(0)
      for (const top of during) expect(top).toBe(topBefore)
      expect(await stageTop(page)).toBe(topBefore)

      // The notice took the hint's place; the previewed instance is struck through, not removed.
      await expect(page.locator('.spirit-sidebar .preview-banner')).toBeVisible()
      await expect(page.locator('.spirit-sidebar .preview-hint')).toHaveCount(0)
      await expect(group.locator('.group-count')).toHaveText(String(groupCount - 1))
      await expect(page.locator(`[data-haunting-id="${fixedId}"]`)).toHaveCount(0)
      await expect(page.locator('.instance-list:not([hidden]) .instance-taken-out')).toHaveCount(1)
      await expect(page.locator('.instance-list:not([hidden]) .instance-taken-out')).toContainText('taken out in this preview')

      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])

      await page.locator('.spirit-sidebar .preview-banner').getByRole('button', { name: 'Reset preview' }).click()
      await expect(page.locator('.preview-banner')).toHaveCount(0)
      await expect(page.locator('.instance-taken-out')).toHaveCount(0)
      await expect(group.locator('.group-count')).toHaveText(String(groupCount))
      expect(await stageTop(page)).toBe(topBefore)
    })
  })

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('uses a 100ms opacity fade and still removes the overlay', async ({ page }) => {
      await openSpiritSight(page)
      const overlaysBefore = await page.locator(OVERLAYS).count()
      await observeTakesForm(page)
      await previewFirstNamelessSpirit(page)

      const seen = await recorded(page)
      expect(seen.map(({ name, duration, easing }) => ({ name, duration, easing }))).toContainEqual({
        name: 'takes-form-fade',
        duration: '0.1s',
        easing: 'linear',
      })
      await expect(page.locator('.takes-form')).toHaveCount(0)
      await expect(page.locator(OVERLAYS)).toHaveCount(overlaysBefore - 1)
    })
  })
})
