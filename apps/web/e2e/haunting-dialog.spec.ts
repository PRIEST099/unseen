import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const HOME = '/sample/cursed-shop-index'
const CHECKOUT = '/sample/cursed-shop-checkout'
const OVERLAYS = '.haunting-overlay-button'

async function openSpiritSight(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Spirit Sight: ')
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
  await expect(page.locator('canvas#spirit-sight')).toBeAttached()
  const toggle = page.getByRole('button', { name: 'Open Spirit Sight' })
  await toggle.click()
  await expect(page.getByRole('status').filter({ hasText: 'Spirit Sight open:' })).toHaveText(/^Spirit Sight open: /, { timeout: 10_000 })
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
}

async function openFromOverlay(page: Page, namePrefix: string): Promise<Locator> {
  const trigger = page.locator(`${OVERLAYS}[aria-label^="${namePrefix}"]`).first()
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  return trigger
}

async function openFromSidebar(page: Page, groupName: string): Promise<Locator> {
  const group = page.locator('.group-toggle', { hasText: groupName })
  await group.click()
  const instance = page.locator('.instance-list:not([hidden]) .instance-button').first()
  await instance.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  return instance
}

test.describe('Haunting detail dialog', () => {
  test('shows name, severity, persona, criteria, HTML and fix, with no axe findings', async ({ page }) => {
    await openSpiritSight(page, HOME)
    await openFromOverlay(page, 'Nameless Spirit')
    const dialog = page.getByRole('dialog')

    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Nameless Spirit')
    await expect(dialog).toHaveAccessibleName('Nameless Spirit')
    await expect(dialog.locator('.severity-badge').first()).toHaveText(/^(Wraith|Restless|Banished)$/)
    await expect(dialog.locator('.dialog-persona')).toHaveText(/^As a /)

    // Primary criterion first, linked to its W3C Understanding page.
    const criteria = dialog.locator('.dialog-list').first().locator('li')
    await expect(criteria.first().locator('a')).toHaveAttribute('href', /^https:\/\/www\.w3\.org\/WAI\/WCAG22\/Understanding\//)
    await expect(criteria.first()).toContainText('4.1.2')
    await expect(criteria.first()).toContainText('Primary')
    await expect(criteria.first().locator('a')).toHaveAttribute('target', '_blank')
    await expect(criteria.first().locator('a')).toHaveAttribute('rel', /noopener/)

    // Offending HTML and fix code are in <pre><code> blocks; the fix instruction is shown.
    await expect(dialog.locator('pre > code')).toHaveCount(2)
    await expect(dialog.getByRole('heading', { level: 3, name: 'Offending HTML' })).toBeVisible()
    await expect(dialog.getByRole('heading', { level: 3, name: 'Suggested fix' })).toBeVisible()
    await expect(dialog.locator('pre > code').first()).not.toBeEmpty()

    // The accessible name of the close button contains its visible text (WCAG 2.5.3).
    const close = dialog.getByRole('button', { name: 'Close dialog' })
    await expect(close).toHaveText('Close')
    await expect(dialog.getByRole('button', { name: 'Copy as Kiro prompt' })).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
    expect(results.incomplete.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  })

  test('traps focus, and Escape, the close button and an outside click return focus to the trigger', async ({ page }) => {
    await openSpiritSight(page, HOME)
    const dialog = page.getByRole('dialog')

    const trigger = await openFromOverlay(page, 'Nameless Spirit')
    await expect(dialog).toBeFocused()
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.getElementById('haunting-dialog')?.contains(document.activeElement) ?? false)).toBe(true)
    }
    await page.keyboard.press('Shift+Tab')
    expect(await page.evaluate(() => document.getElementById('haunting-dialog')?.contains(document.activeElement) ?? false)).toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close dialog' }).click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(4, 4)
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('lists the guidance criterion for an Invisible Wanderer, after the primary one', async ({ page }) => {
    await openSpiritSight(page, HOME)
    await openFromSidebar(page, 'Invisible Wanderer')
    const criteria = page.getByRole('dialog').locator('.dialog-list').first().locator('li')
    await expect(criteria.first()).toContainText('2.4.7')
    await expect(criteria.first()).toContainText('Primary')
    await expect(criteria.last()).toContainText('2.4.13')
    await expect(criteria.last()).toContainText('Guidance only')
  })

  test('lists related issues for a haunting with secondary hauntings', async ({ page }) => {
    await openSpiritSight(page, CHECKOUT)
    await openFromSidebar(page, 'Cursed Loop')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { level: 3, name: 'Related issues' })).toBeVisible()
    await expect(dialog.getByText('Whispering Field', { exact: true })).toBeVisible()

    // A haunting without secondaries has no such section.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await openFromSidebar(page, 'Nameless Spirit')
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Nameless Spirit')
    await expect(dialog.getByRole('heading', { level: 3, name: 'Related issues' })).toHaveCount(0)
  })

  test('"Copy as Kiro prompt" puts a fix request on the clipboard and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openSpiritSight(page, HOME)
    await openFromOverlay(page, 'Nameless Spirit')
    const dialog = page.getByRole('dialog')
    const status = dialog.getByRole('status')
    await expect(status).toHaveText('')

    await dialog.getByRole('button', { name: 'Copy as Kiro prompt' }).click()
    await expect(status).toHaveText('Copied the Kiro prompt to the clipboard.')
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain('Fix this accessibility issue in the source code: Nameless Spirit')
    expect(copied).toContain('https://the-unseen.app/cursed-shop/index.html')
    expect(copied).toContain('Offending HTML:')
    expect(copied).toContain('Suggested fix:')
    expect(copied).toContain('not a runtime patch or overlay')
  })
})
