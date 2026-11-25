import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Product states (task 3.4): 404 routes, expired jobs, a clean audit, séance errors, network
 * failure with backoff, the error boundary and the keyboard help dialog. Each state ends with an
 * axe scan, and the audit API is stubbed with `page.route` where a state cannot be reached for real.
 */

const SAMPLE_ID = 'cursed-shop-index'
const SAMPLE = `/sample/${SAMPLE_ID}`
const CLEAN_MESSAGE = 'No hauntings found by automated checks; a manual review is still needed.'
const ENDED_MESSAGE = 'This séance has ended (results expire after 1 hour or when the server restarts).'
const JOB_URLS_KEY = 'unseen.job-urls'

type SampleBody = { result: Record<string, unknown> & { automatedCoverageNote: string; needsManualCheck: unknown[] } }

async function expectNoAxeFindings(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  expect(results.incomplete.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
}

async function fetchSample(page: Page): Promise<SampleBody> {
  const response = await page.request.get(`/api/samples/${SAMPLE_ID}`)
  return response.json()
}

/** Remembers a job URL the way the landing page does, in this tab's sessionStorage. */
async function rememberJob(page: Page, id: string, url: string): Promise<void> {
  await page.goto('/')
  await page.evaluate(([key, entry]) => sessionStorage.setItem(key, entry), [JOB_URLS_KEY, JSON.stringify([{ id, url }])])
}

test.describe('Not found states', () => {
  test('an unknown route shows "Page not found" with a link home', async ({ page }) => {
    await page.goto('/nonexistent')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page).toHaveTitle('Page not found – THE UNSEEN')
    await expect(page.getByRole('main').getByRole('link', { name: 'Return to home' })).toHaveAttribute('href', '/')
    await expectNoAxeFindings(page)

    await page.getByRole('main').getByRole('link', { name: 'Return to home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('THE UNSEEN')
  })

  test('an unknown lens under a real audit is a 404 too', async ({ page }) => {
    await page.goto(`${SAMPLE}/nope`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  })

  test('a sample that does not exist shows "Sample not found"', async ({ page }) => {
    await page.goto('/sample/no-such-sample')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sample not found')
    await expect(page).toHaveTitle('Sample not found – THE UNSEEN')
    await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
    await expect(page.getByRole('button', { name: 'Audit again' })).toHaveCount(0)
    await expectNoAxeFindings(page)
  })

  test('an expired job shows "Audit not found" and the séance-ended message with a way home', async ({ page }) => {
    await page.goto('/audit/expired-job')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit not found')
    await expect(page).toHaveTitle('Audit not found – THE UNSEEN')
    await expect(page.getByText(ENDED_MESSAGE)).toBeVisible()
    // This tab never started that job, so there is no URL to post again.
    await expect(page.getByRole('button', { name: 'Audit again' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
    await expectNoAxeFindings(page)
  })
})

test.describe('Expired job: Audit again', () => {
  test('re-posts the same URL and opens the new séance', async ({ page }) => {
    await rememberJob(page, 'gone-job', 'https://example.com/pricing')
    const posted: unknown[] = []
    await page.route('**/api/audit', async (route) => {
      posted.push(route.request().postDataJSON())
      await route.fulfill({ status: 202, json: { id: 'fresh-job' } })
    })
    await page.goto('/audit/gone-job')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit not found')
    await expect(page.getByText(ENDED_MESSAGE)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Audit again' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()
    await expectNoAxeFindings(page)

    await page.getByRole('button', { name: 'Audit again' }).click()
    await expect(page).toHaveURL(/\/seance\/fresh-job$/)
    expect(posted).toEqual([{ url: 'https://example.com/pricing' }])
    // The new job is remembered too, so it can be audited again in turn.
    const remembered = await page.evaluate((key) => sessionStorage.getItem(key), JOB_URLS_KEY)
    expect(remembered).toContain('fresh-job')
  })

  test('shows why the re-audit could not start and stays on the page', async ({ page }) => {
    await rememberJob(page, 'gone-job', 'https://example.com/')
    await page.route('**/api/audit', (route) =>
      route.fulfill({ status: 429, json: { error: 'RATE_LIMIT', message: 'Too many requests', retryAfter: 12 } }),
    )
    await page.goto('/audit/gone-job')
    await page.getByRole('button', { name: 'Audit again' }).click()
    await expect(page.locator('main [aria-live="assertive"]')).toHaveText('Too many requests. Please wait 12 seconds and try again.')
    await expect(page).toHaveURL(/\/audit\/gone-job$/)
    await expect(page.getByRole('button', { name: 'Audit again' })).toBeVisible()
  })

  test('a séance that ends while polling offers Audit again and Back to home', async ({ page }) => {
    await rememberJob(page, 'gone-job', 'https://example.com/')
    await page.goto('/seance/gone-job')
    await expect(page.locator('main [aria-live="assertive"]').first()).toHaveText(ENDED_MESSAGE)
    await expect(page.getByRole('button', { name: 'Audit again' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try another URL' })).toHaveCount(0)
    await expectNoAxeFindings(page)
  })
})

test.describe('Zero hauntings', () => {
  async function stubCleanSample(page: Page): Promise<void> {
    await page.route(`**/api/samples/${SAMPLE_ID}`, async (route) => {
      const response = await route.fetch()
      const body: SampleBody = await response.json()
      body.result.hauntings = []
      body.result.score = 0
      await route.fulfill({ response, json: body })
    })
  }

  test('Spirit Sight says so in the main view, shows the coverage note and the manual checks, and never claims compliance', async ({ page }) => {
    const sample = await fetchSample(page)
    await stubCleanSample(page)
    await page.goto(SAMPLE)
    const main = page.getByRole('main')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Spirit Sight: /)
    await expect(main.getByText(CLEAN_MESSAGE)).toBeVisible()
    await expect(main.getByText(sample.result.automatedCoverageNote)).toBeVisible()
    await expect(main.locator('.score-value')).toHaveText('0')
    // Nothing to reveal: no toggle, no overlays; the way to the next audit is the primary action.
    await expect(page.getByRole('button', { name: 'Open Spirit Sight' })).toHaveCount(0)
    await expect(page.locator('.haunting-overlay-button')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Audit another site' })).toBeVisible()

    expect(sample.result.needsManualCheck.length).toBeGreaterThan(0)
    await expect(main.getByRole('heading', { level: 3, name: /^Needs manual check/ })).toBeVisible()
    await expect(main.locator('.manual-check-list li')).toHaveCount(sample.result.needsManualCheck.length)

    await expect(main).not.toContainText(/compliant/i)
    await expectNoAxeFindings(page)
  })

  test('the séance announces a clean audit without a haunting count', async ({ page }) => {
    const sample = await fetchSample(page)
    sample.result.hauntings = []
    sample.result.score = 0
    await page.route('**/api/audit/job-clean', (route) =>
      route.fulfill({ json: { status: 'done', result: sample.result, stages: { queued: 1, loading: 2, tree: 3, walking: 4, classifying: 5, done: 6 } } }),
    )
    await page.goto('/seance/job-clean')
    await expect(page).toHaveURL(/\/audit\/job-clean$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(page.locator('#app-announcer')).toHaveText(`Audit complete: ${CLEAN_MESSAGE}`)
    await expect(page.getByRole('main').getByText(CLEAN_MESSAGE)).toBeVisible()
  })

  test('Daylight shows the same sentence', async ({ page }) => {
    await stubCleanSample(page)
    await page.goto(`${SAMPLE}/daylight`)
    await expect(page.getByText(CLEAN_MESSAGE)).toBeVisible()
    await expectNoAxeFindings(page)
  })
})

test.describe('Séance errors', () => {
  test('an SSRF block is read out assertively with a way to try again', async ({ page }) => {
    await page.route('**/api/audit/job-blocked', (route) =>
      route.fulfill({ json: { status: 'error', error: 'SSRF_BLOCKED', message: 'Cannot audit private or internal URLs' } }),
    )
    await page.goto('/seance/job-blocked')
    const alert = page.locator('main [aria-live="assertive"]')
    await expect(alert).toHaveText('Cannot audit private or internal URLs for security reasons.')
    await expect(page.getByRole('button', { name: 'Try another URL' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
    await expectNoAxeFindings(page)
  })

  test('each error code has its own message', async ({ page }) => {
    const cases: Array<[string, string]> = [
      ['RESOURCE_LIMIT', 'The page is too large to audit (50MB limit).'],
      ['NETWORK_ERROR', 'Could not load the page. Check the URL and try again.'],
    ]
    for (const [code, message] of cases) {
      const id = `job-${code.toLowerCase()}`
      await page.route(`**/api/audit/${id}`, (route) => route.fulfill({ json: { status: 'error', error: code, message: 'raw' } }))
      await page.goto(`/seance/${id}`)
      await expect(page.locator('main [aria-live="assertive"]')).toHaveText(message)
    }
  })
})

test.describe('Network failure while polling', () => {
  test('retries three times with exponential backoff, then shows an assertive error and a Retry button', async ({ page }) => {
    const attempts: number[] = []
    await page.route('**/api/audit/job-offline', async (route) => {
      attempts.push(Date.now())
      await route.abort('connectionrefused')
    })
    await page.goto('/seance/job-offline')

    const alert = page.locator('main [aria-live="assertive"]')
    await expect(alert).toHaveText('Could not reach the server. Check your connection and try again.', { timeout: 15_000 })
    const retry = page.getByRole('button', { name: 'Retry' })
    await expect(retry).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try another URL' })).toBeVisible()
    await expectNoAxeFindings(page)

    // First attempt plus three retries, 1 s, 2 s and 4 s apart.
    expect(attempts).toHaveLength(4)
    const gaps = attempts.slice(1).map((time, index) => time - (attempts[index] ?? 0))
    const expected = [1000, 2000, 4000]
    gaps.forEach((gap, index) => {
      expect(gap).toBeGreaterThanOrEqual((expected[index] ?? 0) - 100)
      expect(gap).toBeLessThan((expected[index] ?? 0) + 1500)
    })
    // Polling has stopped.
    await page.waitForTimeout(1500)
    expect(attempts).toHaveLength(4)

    // Retry starts over with a fresh budget, and the server now answers.
    await page.unroute('**/api/audit/job-offline')
    await page.route('**/api/audit/job-offline', (route) =>
      route.fulfill({ json: { status: 'error', error: 'TIMEOUT', message: 'raw' } }),
    )
    await retry.click()
    await expect(alert).toHaveText('The audit took too long (60s limit). The page may be too large or slow to load.')
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  })

  test('one dropped request does not stop the séance', async ({ page }) => {
    let calls = 0
    await page.route('**/api/audit/job-blip', async (route) => {
      calls += 1
      if (calls === 1) {
        await route.abort('connectionreset')
        return
      }
      await route.fulfill({ json: { status: 'tree', stages: { queued: 1000, loading: 2000, tree: 2500 } } })
    })
    await page.goto('/seance/job-blip')
    await expect(page.locator('main [role="status"]')).toHaveText('Walking the keyboard path…', { timeout: 10_000 })
    await expect(page.locator('main [aria-live="assertive"]')).toHaveText('')
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  })
})

test.describe('Error boundary', () => {
  test('a rendering error shows "An error occurred" inside the app shell and recovers on navigation', async ({ page }) => {
    // A haunting without the fields the view reads makes Spirit Sight throw while rendering.
    await page.route(`**/api/samples/${SAMPLE_ID}`, async (route) => {
      const response = await route.fetch()
      const body: SampleBody = await response.json()
      body.result.hauntings = [{ id: 'broken' }]
      await route.fulfill({ response, json: body })
    })
    await page.goto(SAMPLE)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('An error occurred')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page).toHaveTitle('An error occurred – THE UNSEEN')
    await expect(page.locator('main#main')).toBeFocused()
    // No internal detail on the page.
    await expect(page.getByRole('main')).not.toContainText(/TypeError|undefined|at \w+ \(/)
    await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
    // The shell is still there.
    await expect(page.getByRole('banner').getByRole('link', { name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Toggle sound' })).toBeVisible()
    await expectNoAxeFindings(page)

    // Navigating away clears the error.
    await page.getByRole('banner').getByRole('link', { name: 'THE UNSEEN' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('THE UNSEEN')
    await expect(page.getByRole('heading', { level: 2, name: 'Try a sample' })).toBeVisible()
  })
})

test.describe('Journey links', () => {
  test('the header wordmark links home from Spirit Sight, which also offers "Audit another site"', async ({ page }) => {
    await page.goto(SAMPLE)
    await expect(page.getByRole('link', { name: 'Audit another site' })).toHaveAttribute('href', '/')
    const wordmark = page.getByRole('banner').getByRole('link', { name: 'THE UNSEEN' })
    await expect(wordmark).toHaveAttribute('href', '/')
    await wordmark.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('THE UNSEEN')
  })
})

test.describe('Keyboard help dialog', () => {
  test('closes on a click outside the dialog and returns focus to its button', async ({ page }) => {
    await page.goto('/')
    const trigger = page.getByRole('button', { name: 'Keyboard help' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Keyboard help' })
    await expect(dialog).toBeVisible()
    await expectNoAxeFindings(page)

    // The top-left corner of the viewport is on the backdrop, outside the dialog panel.
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.x ?? 0).toBeGreaterThan(20)
    await page.mouse.click(5, 5)
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('a click inside the dialog keeps it open', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Keyboard help' }).click()
    const dialog = page.getByRole('dialog', { name: 'Keyboard help' })
    await dialog.getByRole('heading', { level: 2, name: 'Keyboard help' }).click()
    await expect(dialog).toBeVisible()
  })
})
