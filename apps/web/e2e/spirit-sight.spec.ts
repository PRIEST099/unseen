import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const SAMPLE = '/sample/cursed-shop-index'
const OVERLAY_NAME =
  /^(Nameless Spirit|Hollow Portrait|The Fog|Lost Soul|Cursed Loop|Invisible Wanderer|Whispering Field|Silent Tongue|The Veiled): .+, (Wraith|Restless|Banished)$/
const OVERLAYS = '.haunting-overlay-button'
const HAUNTED_FILTER = /grayscale\(0\.6\) brightness\(0\.7\)/

/** Share of sampled fog-canvas pixels that are painted (alpha above zero). */
async function paintedShare(page: Page): Promise<number> {
  return page.locator('canvas#spirit-sight').evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (context === null || canvas.width === 0 || canvas.height === 0) return 0
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let painted = 0
    let total = 0
    for (let y = 0; y < canvas.height; y += 13) {
      for (let x = 0; x < canvas.width; x += 13) {
        total += 1
        if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) > 0) painted += 1
      }
    }
    return total === 0 ? 0 : painted / total
  })
}

/** Height of the haunted veil as a share of the screenshot's height. */
async function veilShare(page: Page): Promise<number> {
  return page.locator('.haunted-veil').evaluate((veil) => {
    const stage = veil.parentElement?.getBoundingClientRect().height ?? 0
    return stage === 0 ? 0 : veil.getBoundingClientRect().height / stage
  })
}

async function openSample(page: Page): Promise<void> {
  await page.goto(SAMPLE)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Spirit Sight: ')
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
  // The layers appear once the screenshot's natural size is known.
  await expect(page.locator('canvas#spirit-sight')).toBeAttached()
}

test.describe('Spirit Sight', () => {
  test('starts clean, reveals overlays on activation, and opens a dialog from an overlay', async ({ page }) => {
    await openSample(page)

    // Mortal eyes: no overlays in the DOM, the fog canvas is transparent.
    await expect(page.locator(OVERLAYS)).toHaveCount(0)
    await expect(page.locator('canvas#spirit-sight')).toHaveCSS('opacity', '0')
    const toggle = page.getByRole('button', { name: 'Open Spirit Sight' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    // The skip link to the haunting list is the first focusable element.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to the haunting list' })).toBeFocused()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toBeFocused()
    await expect(page.locator('canvas#spirit-sight')).toHaveCSS('opacity', '1')
    await expect(page.getByRole('status').filter({ hasText: 'Spirit Sight open:' })).toHaveText(/^Spirit Sight open: \d+ hauntings, score \d+$/, {
      timeout: 5_000,
    })

    // The wave left fog behind: mist over the whole screenshot, which is dimmed and desaturated.
    await expect.poll(() => paintedShare(page)).toBeGreaterThan(0.95)
    await page.waitForTimeout(500)
    expect(await paintedShare(page)).toBeGreaterThan(0.95)
    await expect(page.locator('.haunted-veil')).toHaveCSS('backdrop-filter', HAUNTED_FILTER)
    expect(await veilShare(page)).toBeCloseTo(1, 2)
    // The overlays glow on top of the fog: the overlay layer comes after the canvas.
    const overlaysAboveFog = await page.evaluate(() => {
      const canvas = document.getElementById('spirit-sight')
      const overlay = document.querySelector('.haunting-overlay')
      return canvas !== null && overlay !== null && Boolean(canvas.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(overlaysAboveFog).toBe(true)

    // Overlay buttons: names follow "[Name]: [element or role], [severity]".
    const overlays = page.locator(OVERLAYS)
    expect(await overlays.count()).toBeGreaterThan(10)
    const names = await overlays.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''))
    for (const name of names) expect(name).toMatch(OVERLAY_NAME)

    // DOM order: the haunting list comes before every overlay button.
    const sidebarBeforeOverlays = await page.evaluate(() => {
      const sidebar = document.getElementById('haunting-list')
      const first = document.querySelector('.haunting-overlay-button')
      return sidebar !== null && first !== null && Boolean(sidebar.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(sidebarBeforeOverlays).toBe(true)

    // Tab through some overlay buttons: each has a matching accessible name and a 24x24 hit area.
    await overlays.first().focus()
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const element = document.activeElement
        const box = element?.getBoundingClientRect()
        return {
          isOverlay: element?.classList.contains('haunting-overlay-button') ?? false,
          label: element?.getAttribute('aria-label') ?? '',
          width: box?.width ?? 0,
          height: box?.height ?? 0,
        }
      })
      expect(focused.isOverlay).toBe(true)
      expect(focused.label).toMatch(OVERLAY_NAME)
      expect(focused.width).toBeGreaterThanOrEqual(24)
      expect(focused.height).toBeGreaterThanOrEqual(24)
    }

    // Activating an overlay opens the detail dialog; Escape closes it and returns focus.
    const trigger = page.locator(`${OVERLAYS}[aria-label^="Nameless Spirit"]`).first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Nameless Spirit')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    // Closing Spirit Sight clears the fog and the filter at once, and removes the overlays again.
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(await paintedShare(page)).toBe(0)
    expect(await veilShare(page)).toBe(0)
    await expect(page.locator(OVERLAYS)).toHaveCount(0)
  })

  test('the wave is a tall band that leaves fog above it while it sweeps', async ({ page }) => {
    await openSample(page)
    await page.getByRole('button', { name: 'Open Spirit Sight' }).click()
    // Part-way through the 800 ms wave, some of the screenshot is fogged and the rest is not yet.
    await expect.poll(() => veilShare(page), { intervals: [16] }).toBeGreaterThan(0.2)
    const midWave = await veilShare(page)
    if (midWave < 0.9) expect(await paintedShare(page)).toBeGreaterThan(0.1)
    await expect(page.getByRole('status').filter({ hasText: 'Spirit Sight open:' })).toBeVisible({ timeout: 5_000 })
    expect(await paintedShare(page)).toBeGreaterThan(0.95)
  })

  test('shows all ten groups, expands one, and opens a dialog from an instance', async ({ page }) => {
    await openSample(page)
    await expect(page.getByText('Haunting Score')).toBeVisible()
    await expect(page.locator('.group-list > li')).toHaveCount(10)

    const group = page.locator('.group-toggle', { hasText: 'Nameless Spirit' })
    await expect(group).toHaveAttribute('aria-expanded', 'false')
    await group.click()
    await expect(group).toHaveAttribute('aria-expanded', 'true')
    const instance = page.locator('.instance-list:not([hidden]) .instance-button').first()
    await expect(instance).toBeVisible()
    await instance.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(instance).toBeFocused()
  })

  test('links to the other lenses and shows not-found states', async ({ page }) => {
    await openSample(page)
    await page.getByRole('link', { name: 'Daylight mode' }).click()
    await expect(page).toHaveURL(/\/sample\/cursed-shop-index\/daylight$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Daylight report: ')
    await page.getByRole('link', { name: 'Whisper walk' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Whisper Walk: ')
    await page.getByRole('link', { name: 'Keyboard walk' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Keyboard Walk: ')

    await page.goto('/sample/does-not-exist')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sample not found')
    await page.goto('/audit/does-not-exist')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit not found')
  })

  test('reduced motion: overlays appear at once and the screenshot is filtered instantly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openSample(page)
    await expect(page.locator(OVERLAYS)).toHaveCount(0)
    await page.getByRole('button', { name: 'Open Spirit Sight' }).click()
    await expect(page.locator(OVERLAYS).first()).toBeAttached()
    const total = await page.locator('.group-list .group-count').evaluateAll((elements) =>
      elements.reduce((sum, element) => sum + Number(element.textContent), 0),
    )
    expect(await page.locator(OVERLAYS).count()).toBeGreaterThan(0)
    expect(total).toBeGreaterThan(0)
    // The final haunted state at once: the filter covers the whole screenshot and the mist is painted.
    await expect(page.locator('.haunted-veil')).toHaveCSS('backdrop-filter', HAUNTED_FILTER)
    expect(await veilShare(page)).toBeCloseTo(1, 2)
    await expect.poll(() => paintedShare(page)).toBeGreaterThan(0.95)
    await expect(page.getByRole('status').filter({ hasText: 'Spirit Sight open:' })).toBeVisible()
    // No running animation on the overlay layer.
    const animated = await page.evaluate(() =>
      document.getAnimations().filter((animation) => animation.playState === 'running').length,
    )
    expect(animated).toBe(0)
  })
})
