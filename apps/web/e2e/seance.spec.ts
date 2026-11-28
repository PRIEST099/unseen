import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

const DEMO_URL = 'http://localhost:3000/cursed-shop/index.html'

async function startDemoAudit(page: Page): Promise<string> {
  const response = await page.request.post('/api/audit', { data: { url: DEMO_URL } })
  expect(response.status()).toBe(202)
  const body: { id: string } = await response.json()
  return body.id
}

test.describe('Séance', () => {
  test('shows real stages, then hands over to Spirit Sight with focus and an announcement', async ({ page }) => {
    const id = await startDemoAudit(page)
    await page.goto(`/seance/${id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The séance')

    const status = page.locator('main [role="status"]')
    await expect(status).toHaveText('Loading page…')

    await expect(page).toHaveURL(new RegExp(`/audit/${id}$`), { timeout: 60_000 })
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toHaveText(/^Spirit Sight: /)
    await expect(heading).toBeFocused()
    await expect(page.locator('#app-announcer')).toHaveText(/^Audit complete: \d+ hauntings found, Haunting Score \d+$/)
    await expect(page.getByRole('button', { name: 'Open Spirit Sight' })).toBeVisible()
    // The séance left no entry behind that would bounce the back button straight back here.
    await page.goBack()
    await expect(page).not.toHaveURL(new RegExp(`/seance/${id}$`))
  })

  test('keeps the live region empty until the first poll, then only changes its text', async ({ page }) => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let polls = 0
    await page.route('**/api/audit/job-stages', async (route) => {
      polls += 1
      if (polls === 1) await gate
      const stages = { queued: 1000, loading: 2200, tree: 2700 }
      await route.fulfill({ json: polls === 1 ? { status: 'queued' } : { status: 'tree', stages } })
    })
    await page.goto('/seance/job-stages')
    const status = page.locator('main [role="status"]')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The séance')
    await expect(status).toHaveText('')
    const handle = await status.elementHandle()
    release()
    await expect(status).toHaveText('Loading page…')
    await expect(status).toHaveText('Reading accessibility tree…')
    // Same node throughout: only the text changed.
    expect(await handle?.evaluate((node) => node.isConnected)).toBe(true)
    await expect(page.getByRole('list', { name: 'Completed stages' }).getByRole('listitem')).toHaveText([
      'Loading page… 0.5s',
    ])
  })

  test('announces an error assertively, stops polling, and offers another URL', async ({ page }) => {
    let polls = 0
    await page.route('**/api/audit/job-failed', async (route) => {
      polls += 1
      await route.fulfill({ json: { status: 'error', error: 'TIMEOUT', message: 'Audit timed out after 60 seconds' } })
    })
    await page.goto('/seance/job-failed')
    const alert = page.locator('main [aria-live="assertive"]')
    await expect(alert).toHaveText('The audit took too long (60s limit). The page may be too large or slow to load.')
    await page.waitForTimeout(1500)
    const settledPolls = polls
    await page.waitForTimeout(1200)
    expect(polls).toBe(settledPolls)

    await page.getByRole('button', { name: 'Try another URL' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('THE UNSEEN')
  })

  test('says the séance has ended when the job is gone', async ({ page }) => {
    await page.goto('/seance/does-not-exist')
    // The first assertive region carries the message; the second one only reports a failed "Audit again".
    await expect(page.locator('main [aria-live="assertive"]').first()).toHaveText(
      'This séance has ended (results expire after 1 hour or when the server restarts).',
    )
    // This browser never started that job, so there is no URL to audit again: only the way home is offered.
    await expect(page.getByRole('button', { name: 'Audit again' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveCount(0)
  })

  test('offers Cancel while the audit runs; it goes home and stops polling', async ({ page }) => {
    let polls = 0
    await page.route('**/api/audit/job-cancel', async (route) => {
      polls += 1
      await route.fulfill({ json: { status: 'walking', stages: { queued: 1000, loading: 1500, tree: 2000, walking: 2600 } } })
    })
    await page.goto('/seance/job-cancel')
    await expect(page.locator('main [role="status"]')).toHaveText('Walking the keyboard path…')
    const cancel = page.getByRole('link', { name: 'Cancel' })
    await expect(cancel).toBeVisible()
    await expect(cancel).toHaveAttribute('href', '/')
    await expect(cancel).toHaveClass(/button-primary/)
    const scan = await new AxeBuilder({ page }).analyze()
    expect(scan.violations.map((v) => v.id)).toEqual([])

    await cancel.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('THE UNSEEN')
    const settled = polls
    await page.waitForTimeout(1200)
    expect(polls).toBe(settled)
  })

  test('Cancel is gone once the audit has failed', async ({ page }) => {
    await page.route('**/api/audit/job-cancel-failed', (route) =>
      route.fulfill({ json: { status: 'error', error: 'TIMEOUT', message: 'raw' } }),
    )
    await page.goto('/seance/job-cancel-failed')
    await expect(page.getByRole('button', { name: 'Try another URL' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveCount(0)
  })
})
