import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { auditAndClassify } from '@the-unseen/core'
import type { ClassifiedAudit } from '@the-unseen/core'

/**
 * The replay edition, built by `npm run build:replay` and served like GitHub Pages: under /unseen/, no headers,
 * 404.html for unknown paths. The config sets UNSEEN_LIVE_URL=https://unseen.example.com/ for the notice.
 */

const BASE = '/unseen'
const SAMPLE = `${BASE}/sample/cursed-shop-index`
const HOSTNAME = 'Cursed Shop (sample)'
const LIVE_URL = 'https://unseen.example.com/'
const AUDIT_TIMEOUT_MS = 180_000

/** Records every request the page makes. */
function trackRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))
  return urls
}

function noApiRequests(urls: readonly string[]): void {
  const api = urls.filter((url) => new URL(url).pathname.includes('/api'))
  expect(api, `Requests to /api in replay mode:\n${api.join('\n')}`).toEqual([])
  // Everything came from the static site itself, under its base path.
  const strays = urls.filter((url) => {
    const { origin, pathname, protocol } = new URL(url)
    if (protocol === 'data:' || protocol === 'blob:') return false
    return origin !== 'http://127.0.0.1:4173' || (!pathname.startsWith(`${BASE}/`) && pathname !== '/favicon.ico')
  })
  expect(strays, `Requests outside the replay site:\n${strays.join('\n')}`).toEqual([])
}

test.describe('replay edition: landing', () => {
  test('disables the URL form and says why, with the live URL', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.getByRole('heading', { level: 1, name: 'THE UNSEEN' })).toBeVisible()
    await expect(page.getByLabel('Enter a URL to audit')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Begin audit' })).toBeDisabled()
    await expect(page.locator('#replay-note')).toHaveText(
      `This is the replay edition: pre-recorded audits of our haunted demo shop. The live auditor runs at ${LIVE_URL}.`,
    )
    await expect(page.locator('#replay-note').getByRole('link', { name: LIVE_URL })).toHaveAttribute('href', LIVE_URL)
    // The note is the field's description for assistive technology.
    await expect(page.getByLabel('Enter a URL to audit')).toHaveAccessibleDescription(/This is the replay edition/)
    await expect(page.locator('.sample-card')).toHaveCount(3)
    await expect(page.locator('.sample-card img').first()).toHaveJSProperty('complete', true)
  })

  test('a deep link opens through the 404.html fallback', async ({ page }) => {
    await page.goto(`${SAMPLE}/daylight`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Daylight report: ${HOSTNAME}`)
  })

  test('job routes do not exist: they show "Page not found"', async ({ page }) => {
    const urls = trackRequests(page)
    for (const path of [`${BASE}/seance/abc`, `${BASE}/audit/abc`]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
    }
    noApiRequests(urls)
  })
})

test.describe('replay edition: every view works, and nothing calls /api', () => {
  test('tour: Spirit Sight, dialog, Takes Form, keyboard walk, whisper walk, Daylight and exports', async ({ page }) => {
    const urls = trackRequests(page)
    const failed: string[] = []
    page.on('requestfailed', (request) => failed.push(request.url()))
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || /content security policy/i.test(message.text())) consoleErrors.push(message.text())
    })

    // Landing, then a sample card.
    await page.goto(`${BASE}/`)
    await page.locator('.sample-card', { hasText: 'Home' }).click()
    await expect(page).toHaveURL(new RegExp(`${SAMPLE}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Spirit Sight: ${HOSTNAME}`)
    await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
    await expect(page.locator('img[alt="Audited page screenshot"]')).toHaveJSProperty('complete', true)

    // Spirit Sight, the haunting dialog and Takes Form.
    await page.getByRole('button', { name: 'Open Spirit Sight' }).click()
    await expect(page.locator('.status-line')).toHaveText(/^Spirit Sight open: \d+ hauntings, score \d+$/, { timeout: 10_000 })
    const trigger = page.locator('.haunting-overlay-button[aria-label^="Nameless Spirit"]').first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Preview fix' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('.spirit-sidebar .preview-banner')).toContainText('Preview only')
    await expect(page.locator('.takes-form')).toHaveCount(0)

    // Keyboard walk, with Play.
    await page.getByRole('link', { name: 'Keyboard walk' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Keyboard Walk: ${HOSTNAME}`)
    await expect(page.locator('.walk-step')).toContainText('Step 1 of ')
    await page.getByRole('button', { name: 'Step forward' }).click()
    await expect(page.locator('.walk-step')).toContainText('Step 2 of ')

    // Whisper walk: the transcript comes from the bundled audit's speech track.
    await page.getByRole('link', { name: 'Whisper walk' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Whisper Walk: ${HOSTNAME}`)

    // Daylight and both exports.
    await page.getByRole('link', { name: 'Daylight mode' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Daylight report: ${HOSTNAME}`)
    const markdown = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export as Markdown' }).click()
    expect((await markdown).suggestedFilename()).toMatch(/\.md$/)
    const json = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export as JSON' }).click()
    expect((await json).suggestedFilename()).toMatch(/\.json$/)

    noApiRequests(urls)
    expect(failed.filter((url) => !url.endsWith('/favicon.ico')), 'failed requests').toEqual([])
    expect(consoleErrors.filter((text) => !/favicon/i.test(text)), 'console errors or CSP violations').toEqual([])
    // The tour really did read the bundled files.
    expect(urls.some((url) => url.endsWith(`${BASE}/replay-data/cursed-shop-index.json`))).toBe(true)
    expect(urls.some((url) => url.endsWith(`${BASE}/replay-data/cursed-shop-index.png`))).toBe(true)
  })

  test('Daylight shows the scan record', async ({ page }) => {
    await page.goto(`${SAMPLE}/daylight`)
    const record = page.getByRole('region', { name: 'Scan record' })
    await expect(record).toBeVisible()
    await expect(record.locator('dt')).toHaveText([
      'THE UNSEEN version',
      'axe-core version',
      'Chromium version',
      'Viewport',
      'Audited URL',
      'Audited at',
    ])
    await expect(record.locator('dd').nth(3)).toHaveText(/^\d+ × \d+ px$/)
    await expect(record.locator('dd').nth(4)).toHaveText('/cursed-shop/index.html')
  })
})

type AxNode = ClassifiedAudit['raw']['axNodes'][number]

function h1Names(audit: ClassifiedAudit): string[] {
  const level = (node: AxNode): unknown => node.properties.find((property) => property.name === 'level')?.value.value
  return audit.raw.axNodes
    .filter((node) => !node.ignored && node.role.value === 'heading' && level(node) === 1)
    .map((node) => String(node.name.value ?? '').trim())
}

function describe(audit: ClassifiedAudit): string {
  return audit.hauntings.map((haunting) => `- ${haunting.type} (${haunting.severity}): ${haunting.htmlSnippet}`).join('\n')
}

const AUDITED: Array<{ title: string; path: string; h1: string }> = [
  { title: 'Landing', path: `${BASE}/`, h1: 'THE UNSEEN' },
  { title: 'Spirit Sight', path: SAMPLE, h1: `Spirit Sight: ${HOSTNAME}` },
  { title: 'Whisper Walk', path: `${SAMPLE}/whisper`, h1: `Whisper Walk: ${HOSTNAME}` },
  { title: 'Keyboard Walk', path: `${SAMPLE}/keyboard`, h1: `Keyboard Walk: ${HOSTNAME}` },
  { title: 'Daylight', path: `${SAMPLE}/daylight`, h1: `Daylight report: ${HOSTNAME}` },
  { title: '404', path: `${BASE}/nonexistent`, h1: 'Page not found' },
]

test.describe('replay edition: self-audit', () => {
  for (const route of AUDITED) {
    test(`${route.title} (${route.path}) has zero hauntings`, async ({ baseURL }) => {
      test.setTimeout(AUDIT_TIMEOUT_MS)
      if (baseURL === undefined) throw new Error('Playwright baseURL is not configured')
      const audit = await auditAndClassify(new URL(route.path, baseURL).href, { allowPrivate: true })
      expect(h1Names(audit), `Expected exactly one h1 on ${route.path}`).toEqual([route.h1])
      expect(audit.raw.collectionErrors).toEqual([])
      expect(audit.hauntings, `Hauntings on ${route.path}:\n${describe(audit)}`).toHaveLength(0)
      expect(audit.axeCrossCheck.unmapped).toHaveLength(0)
      expect(audit.needsManualCheck).toHaveLength(0)
      expect(audit.score).toBe(0)
    })
  }

  test('Spirit Sight open has zero axe violations and zero incomplete items', async ({ page }) => {
    test.setTimeout(AUDIT_TIMEOUT_MS)
    await page.goto(SAMPLE)
    await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
    await page.getByRole('button', { name: 'Open Spirit Sight' }).click()
    await expect(page.locator('.status-line')).toHaveText(/^Spirit Sight open: /, { timeout: 10_000 })
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
    expect(results.incomplete.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  })

  test('Daylight with the scan record has zero axe violations', async ({ page }) => {
    await page.goto(`${SAMPLE}/daylight`)
    await expect(page.getByRole('region', { name: 'Scan record' })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  })
})
