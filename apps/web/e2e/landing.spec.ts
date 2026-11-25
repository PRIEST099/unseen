import { expect, test } from '@playwright/test'

test.describe('Landing view', () => {
  test('shows the title and tagline, tabs in order, and opens a sample', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.getByText('Which site do you dare to see through their eyes?')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Try a sample' })).toBeVisible()

    const samples = page.locator('.sample-cards button')
    await expect(samples).toHaveCount(3)

    const skipLink = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skipLink).not.toBeInViewport()

    await page.keyboard.press('Tab')
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeInViewport({ ratio: 1 })

    await page.keyboard.press('Tab')
    const wordmark = page.getByRole('banner').getByRole('link', { name: 'THE UNSEEN' })
    await expect(wordmark).toBeFocused()
    await expect(wordmark).toHaveAttribute('href', '/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Toggle sound' })).toBeFocused()
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
