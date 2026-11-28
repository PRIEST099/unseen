import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

test.describe('Landing view', () => {
  test('shows the title and tagline, tabs in order, and opens a sample', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByText('Which site do you dare to see through their eyes?')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Try a sample' })).toBeVisible()
    // The hero title is the brand on Landing: the header keeps its landmark but does not repeat the name.
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('banner').getByRole('link', { name: 'THE UNSEEN' })).toHaveCount(0)
    await expect(page.getByRole('main')).toBeVisible()

    const samples = page.locator('.sample-cards button')
    await expect(samples).toHaveCount(3)

    const skipLink = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skipLink).not.toBeInViewport()

    await page.keyboard.press('Tab')
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeInViewport({ ratio: 1 })

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Toggle sound' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Hide ghosts' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Keyboard help' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Enter a URL to audit')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Begin audit' })).toBeFocused()
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Tab')
      await expect(samples.nth(index)).toBeFocused()
    }

    await page.getByRole('button', { name: /Cursed Shop — Home/ }).click()
    await expect(page).toHaveURL(/\/sample\/cursed-shop-index$/)
    // Away from Landing the header wordmark is back, and it links home.
    const wordmark = page.getByRole('banner').getByRole('link', { name: 'THE UNSEEN' })
    await expect(wordmark).toBeVisible()
    await expect(wordmark).toHaveAttribute('href', '/')
  })

  test('the skip link moves focus to the main landmark without the header wordmark', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(page.locator('main#main')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Enter a URL to audit')).toBeFocused()
  })

  test('sample cards say what the Haunting Score means', async ({ page }) => {
    await page.goto('/')
    const explanation = 'Haunting Score out of 100; higher means more accessibility barriers.'
    await expect(page.getByText(explanation)).toBeVisible()
    const samples = page.locator('.sample-cards button')
    await expect(samples).toHaveCount(3)
    for (let index = 0; index < 3; index += 1) {
      const card = samples.nth(index)
      // Visible text such as "98 / 100 · heavily haunted"; the name keeps every visible word (label in name).
      await expect(card.locator('.sample-card-score')).toHaveText(/^Haunting Score \d{1,3} \/ 100 · \w/)
      await expect(card.locator('.sample-card-band')).toHaveText(
        /^(no hauntings detected|lightly haunted|haunted|badly haunted|heavily haunted)$/,
      )
      await expect(card).toHaveAccessibleName(/Haunting Score \d{1,3} \/ 100 · (no hauntings detected|.*haunted)$/)
      await expect(card).toHaveAccessibleDescription(explanation)
    }
    await expect(page.getByRole('button', { name: /Cursed Shop — Home/ })).toContainText('98 / 100 · heavily haunted')
  })

  test('the hero is a framed manor painting under a solid plaque that axe can measure, and moves only without reduced motion', async ({ page }) => {
    await page.goto('/')
    const painting = page.locator('.hero-painting img')
    await expect(painting).toHaveAttribute('alt', '')
    await expect.poll(() => painting.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    const read = () =>
      page.evaluate(() => {
        const plaque = document.querySelector('.hero-plaque')
        const img = document.querySelector('.hero-painting img')
        const flame = document.querySelector('.landing-candle-flame')
        if (plaque === null || img === null || flame === null) return null
        const plaqueStyle = getComputedStyle(plaque)
        return {
          // Every word sits on the plaque: a solid colour, no image, no gradient.
          plaqueBackground: [plaqueStyle.backgroundColor, plaqueStyle.backgroundImage],
          frame: getComputedStyle(document.querySelector('.hero-painting') as Element).borderImageSource,
          animations: [getComputedStyle(img).animationName, getComputedStyle(flame).animationName],
        }
      })
    const styles = await read()
    expect(styles?.plaqueBackground[0]).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    expect(styles?.plaqueBackground[1]).toBe('none')
    expect(styles?.frame).toContain('gilt-frame')
    expect(styles?.animations).toEqual(['manor-drift', 'candle-flicker'])
    await expect(page.locator('.landing-candle')).toHaveAttribute('aria-hidden', 'true')

    const axe = await new AxeBuilder({ page }).analyze()
    expect(axe.violations.map((rule) => rule.id)).toEqual([])
    expect(axe.incomplete.filter((rule) => rule.id === 'color-contrast')).toEqual([])

    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect((await read())?.animations).toEqual(['none', 'none'])
  })

  test('sound starts off and the toggle reports its state', async ({ page }) => {
    await page.goto('/')
    const toggle = page.getByRole('button', { name: 'Toggle sound' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  test('keyboard help traps focus, closes on Escape and returns focus', async ({ page }) => {
    await page.goto('/')
    const trigger = page.getByRole('button', { name: 'Keyboard help' })
    await trigger.click()

    const dialog = page.getByRole('dialog', { name: 'Keyboard help' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(page.getByRole('button', { name: 'Close keyboard help' })).toBeFocused()

    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Tab')
      const inside = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)
      expect(inside).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('shows submit errors in a live region', async ({ page }) => {
    await page.route('**/api/audit', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'RATE_LIMIT', message: 'Too many requests', retryAfter: 7 }),
      }),
    )
    await page.goto('/')
    const input = page.getByLabel('Enter a URL to audit')
    const status = page.locator('#url-error')
    await expect(status).toHaveAttribute('aria-live', 'assertive')

    await input.fill('not a url')
    await page.getByRole('button', { name: 'Begin audit' }).click()
    await expect(status).toContainText('valid http or https URL')
    await expect(input).toHaveAttribute('aria-invalid', 'true')

    await input.fill('https://example.com')
    await page.getByRole('button', { name: 'Begin audit' }).click()
    await expect(status).toContainText('wait 7 seconds')
  })

  test('submitting a valid URL navigates to the séance', async ({ page }) => {
    await page.route('**/api/audit', (route) =>
      route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'job-1' }) }),
    )
    await page.goto('/')
    await page.getByLabel('Enter a URL to audit').fill('https://example.com')
    await page.getByRole('button', { name: 'Begin audit' }).click()
    await expect(page).toHaveURL(/\/seance\/job-1$/)
    await expect(page.locator('main#main')).toBeFocused()
  })

  test('unknown routes show the 404 view', async ({ page }) => {
    await page.goto('/nonexistent')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page).toHaveTitle('Page not found – THE UNSEEN')
  })
})
