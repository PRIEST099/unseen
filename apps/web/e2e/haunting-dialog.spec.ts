import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
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
    await expect(dialog.getByRole('heading', { level: 3, name: 'Who is affected' })).toBeVisible()
    await expect(dialog.getByRole('heading', { level: 3, name: "What's wrong" })).toBeVisible()
    await expect(dialog.locator('section', { has: page.getByRole('heading', { name: 'Who is affected' }) }).locator('.dialog-persona')).toHaveCount(1)

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

    // The close button sits beside the title, and its accessible name contains its visible text (WCAG 2.5.3).
    const close = dialog.getByRole('button', { name: 'Close dialog' })
    await expect(close).toHaveText('Close')
    await expect(dialog.locator('.dialog-header').getByRole('button', { name: 'Close dialog' })).toBeVisible()
    await expect(dialog.locator('.dialog-header h2')).toHaveText('Nameless Spirit')
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

  test('a drag from a code block onto the backdrop keeps the dialog open; a backdrop click closes it', async ({ page }) => {
    await openSpiritSight(page, HOME)
    const trigger = await openFromOverlay(page, 'Nameless Spirit')
    const dialog = page.getByRole('dialog')

    // Select text in the offending HTML and release the mouse over the backdrop.
    const code = dialog.locator('.dialog-code').first()
    // The panel scrolls; bring the code block into view so the press lands on visible text.
    await code.scrollIntoViewIfNeeded()
    const box = await code.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move((box?.x ?? 0) + 8, (box?.y ?? 0) + 8)
    await page.mouse.down()
    await page.mouse.move(4, 4, { steps: 8 })
    await page.mouse.up()
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0)

    // A press that starts on the backdrop and ends inside the dialog does not close it either.
    await page.mouse.move(4, 4)
    await page.mouse.down()
    await page.mouse.move((box?.x ?? 0) + 8, (box?.y ?? 0) + 8, { steps: 8 })
    await page.mouse.up()
    await expect(dialog).toBeVisible()

    // A true backdrop click closes it and focus returns to the trigger.
    await page.mouse.click(4, 4)
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('opened from the keyboard, the dialog takes focus without a doubled outline', async ({ page }) => {
    await openSpiritSight(page, HOME)
    const trigger = page.locator(`${OVERLAYS}[aria-label^="Nameless Spirit"]`).first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeFocused()
    expect(await dialog.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
    // Controls inside keep the focus ring.
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
  })

  test('keyboard focus is never hidden under the sticky dialog header', async ({ page }) => {
    // A short viewport makes the panel scroll, so content passes under the sticky header.
    await page.setViewportSize({ width: 1280, height: 480 })
    await openSpiritSight(page, HOME)
    await openFromOverlay(page, 'Nameless Spirit')
    const dialog = page.getByRole('dialog')
    const header = dialog.locator('.dialog-header')
    expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

    // Start at the bottom of the panel and walk focus back up with Shift+Tab.
    const tabbables = dialog.locator('a[href]:visible, button:not([disabled]):visible')
    const count = await tabbables.count()
    expect(count).toBeGreaterThan(2)
    await dialog.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await tabbables.last().focus()
    for (let step = 1; step < count; step += 1) {
      await page.keyboard.press('Shift+Tab')
      const focused = page.locator(':focus')
      // The Close button lives in the header itself.
      if (await focused.evaluate((el) => el.closest('.dialog-header') !== null)) continue
      const headerBox = await header.boundingBox()
      const focusedBox = await focused.boundingBox()
      expect(headerBox).not.toBeNull()
      expect(focusedBox).not.toBeNull()
      expect(focusedBox?.y ?? 0).toBeGreaterThanOrEqual((headerBox?.y ?? 0) + (headerBox?.height ?? 0) - 1)
    }
  })

  test('notes a shortened snippet, and only then', async ({ page }) => {
    await openSpiritSight(page, HOME)
    await page.locator('.group-toggle', { hasText: 'Nameless Spirit' }).click()
    const instances = page.locator('.instance-list:not([hidden]) .instance-button')
    const count = await instances.count()
    expect(count).toBeGreaterThan(1)
    const dialog = page.getByRole('dialog')
    let shortened = 0
    for (let index = 0; index < count; index += 1) {
      await instances.nth(index).click()
      await expect(dialog).toBeVisible()
      const snippet = (await dialog.locator('.dialog-code code').first().textContent()) ?? ''
      const note = dialog.getByText('Snippet shortened to its first 300 characters.', { exact: true })
      if (snippet.endsWith('…') || snippet.length >= 300) {
        shortened += 1
        await expect(note).toBeVisible()
      } else {
        await expect(note).toHaveCount(0)
      }
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
    // The cursed shop home page has long, cut-off Nameless Spirit snippets (inline SVG buttons).
    expect(shortened).toBeGreaterThan(0)
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

    const copy = dialog.getByRole('button', { name: 'Copy as Kiro prompt' })
    await copy.click()
    await expect(status).toHaveText('Copied the Kiro prompt to the clipboard.')

    // A second copy puts a fresh message node in the live region, so it is announced again.
    await status.locator('span').evaluate((el) => el.setAttribute('data-first', ''))
    await copy.click()
    await expect(status.locator('span[data-first]')).toHaveCount(0)
    await expect(status).toHaveText('Copied the Kiro prompt to the clipboard.')
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain('Fix this accessibility issue in the source code: Nameless Spirit')
    expect(copied).toContain('/cursed-shop/index.html')
    expect(copied).not.toContain('the-unseen.app')
    // A snippet at the 300-character cap gets the partial label, so accept both forms.
    expect(copied).toMatch(/Offending HTML( \(partial: shortened to its first 300 characters\))?:/)
    expect(copied).toContain('Suggested fix:')
    expect(copied).toContain('not a runtime patch or overlay')
  })
})
