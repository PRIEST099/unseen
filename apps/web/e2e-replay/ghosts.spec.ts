import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { test as seenTest } from '../e2e/fixtures'
import { analyzeWithPausedClock, forceIntro, pauseClock } from '../e2e/intro-clock'

/** The ghosts and the intro in the replay edition (served under /unseen/, like GitHub Pages). */
const BASE = '/unseen'

// The intro is skipped in automated browsers unless this flag is set: these specs test it in full.
test.beforeEach(async ({ page }) => forceIntro(page))

/** Records, with `performance.now()` in the page, when the intro first appears (its mount) and when it leaves. */
async function watchIntro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const present = document.querySelector('.lights-on') !== null
      if (present && Reflect.get(window, '__introMountedAt') === undefined) Reflect.set(window, '__introMountedAt', performance.now())
      else if (!present && Reflect.get(window, '__introMountedAt') !== undefined && Reflect.get(window, '__introGoneAt') === undefined) {
        Reflect.set(window, '__introGoneAt', performance.now())
      }
    }).observe(document, { childList: true, subtree: true })
  })
}

/** How long the intro was on the page: from its mount to its removal, in ms. */
async function introLifetime(page: Page): Promise<number> {
  await page.waitForFunction(() => Reflect.get(window, '__introGoneAt') !== undefined)
  return page.evaluate(() => Number(Reflect.get(window, '__introGoneAt')) - Number(Reflect.get(window, '__introMountedAt')))
}

test('the intro plays on a first visit, is gone within 4.8 s of its mount, and hands over to the peeking ghosts', async ({ page }) => {
  await watchIntro(page)
  await page.goto(`${BASE}/`)
  await expect(page.getByRole('status').filter({ hasText: 'Lighting the candles…' })).toBeVisible()
  await expect(page.locator('.lights-on')).toHaveCount(0, { timeout: 6_000 })
  const lifetime = await introLifetime(page)
  // At least the 3.2 s minimum and the 600 ms fade; gone by 4.8 s after mount.
  expect(lifetime).toBeGreaterThanOrEqual(3_700)
  expect(lifetime).toBeLessThanOrEqual(4_800)
  await expect(page.locator('.margin-ghost')).toHaveCount(3)
  await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
})

test('the intro is gone within 4.8 s of its mount even when the fonts never load', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fonts', { value: { ready: new Promise(() => undefined) }, configurable: true })
  })
  await watchIntro(page)
  await page.goto(`${BASE}/`)
  await expect(page.locator('.lights-on')).toHaveCount(0, { timeout: 6_000 })
  const lifetime = await introLifetime(page)
  // Only the time limit ends it: lights at 3.9 s, then the 600 ms fade (cut by the 4.6 s cap). An intro
  // that ignored the fonts would be gone after 3.2 + 0.6 = 3.8 s.
  expect(lifetime).toBeGreaterThanOrEqual(4_200)
  expect(lifetime).toBeLessThanOrEqual(4_800)
})

test('Tab reaches the skip link during the intro', async ({ page }) => {
  // Paused before the page loads: no intro timer can fire, so only the key press ends the dark.
  await pauseClock(page)
  await page.goto(`${BASE}/`)
  await expect(page.locator('.lights-on[data-phase="dark"]')).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await expect(page.locator('.lights-on')).toHaveCount(0)
})

test('no axe violations while the intro is in its dark phase', async ({ page }) => {
  // Paused before the page loads (`install` alone keeps time running): no intro timer fires while axe
  // runs, and axe's own timers are stepped through, never more than 600 ms of page time.
  await pauseClock(page)
  await page.goto(`${BASE}/`)
  await expect(page.locator('.lights-on[data-phase="dark"]')).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: 'Lighting the candles…' })).toBeVisible()
  const results = await analyzeWithPausedClock(page)
  // Still dark after the analysis: axe saw the dark layer and the status text.
  await expect(page.locator('.lights-on[data-phase="dark"] .lights-on-dark')).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: 'Lighting the candles…' })).toBeVisible()
  expect(results.violations.map((rule) => rule.id)).toEqual([])
  expect(results.incomplete.map((rule) => rule.id)).toEqual([])
  // It was the paused clock that held it: once time runs again, the time limit ends it.
  await page.clock.resume()
  await expect(page.locator('.lights-on')).toHaveCount(0, { timeout: 6_000 })
})

seenTest('a sample route shows the ghost in its painting, and the Daylight lens keeps only a sleepy one', async ({ page }) => {
  // Wide enough that the lenses have a wall: Daylight's zero margin ghosts then means something.
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`${BASE}/sample/cursed-shop-index`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Spirit Sight')
  const ghost = page.locator('svg.painting-ghost')
  await expect(ghost).toHaveCount(1)
  await expect(ghost).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.margin-ghost').first()).toBeAttached()
  await page.goto(`${BASE}/sample/cursed-shop-index/daylight`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Daylight report')
  await expect(page.locator('svg.painting-ghost')).toHaveAttribute('data-mood', 'sleepy')
  await expect(page.locator('.margin-ghost')).toHaveCount(0)
})

seenTest('"Hide ghosts" works in the replay edition and survives a reload; Daylight has no ghosts', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await expect(page.locator('.margin-ghost')).toHaveCount(3)
  await page.getByRole('button', { name: 'Hide ghosts' }).click()
  await expect(page.locator('.margin-ghost')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Hide ghosts' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.margin-ghost')).toHaveCount(0)
  await page.getByRole('button', { name: 'Hide ghosts' }).click()
  await expect(page.locator('.margin-ghost')).toHaveCount(3)

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`${BASE}/sample/cursed-shop-index/daylight`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Daylight report')
  await expect(page.locator('.margin-ghost')).toHaveCount(0)
})
