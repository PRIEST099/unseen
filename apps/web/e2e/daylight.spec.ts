import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Download, Page } from '@playwright/test'

const SAMPLE = '/sample/cursed-shop-index'
const DAYLIGHT = `${SAMPLE}/daylight`
// The committed sample records the relative URL /cursed-shop/index.html, shown as "Cursed Shop (sample)".
const HOSTNAME = 'Cursed Shop (sample)'

async function openDaylight(page: Page): Promise<void> {
  await page.goto(DAYLIGHT)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Daylight report: ${HOSTNAME}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Findings by WCAG criterion' })).toBeVisible()
}

async function readDownload(download: Download): Promise<string> {
  const path = await download.path()
  return readFile(path, 'utf8')
}

test.describe('Daylight report', () => {
  test('has the heading outline, a prominent coverage note and a criterion table', async ({ page }) => {
    await openDaylight(page)
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Findings by WCAG criterion', 'Needs manual check'])

    const note = page.getByRole('note', { name: 'Coverage note' })
    await expect(note).toBeVisible()
    const sample: { result: { automatedCoverageNote: string; score: number } } = await (await page.request.get(`/api/samples/cursed-shop-index`)).json()
    await expect(note).toContainText(sample.result.automatedCoverageNote)
    // The note comes before the findings.
    const noteBeforeFindings = await page.evaluate(() => {
      const found = document.querySelector('[role="note"]')
      const findings = document.getElementById('daylight-findings')
      return found !== null && findings !== null && Boolean(found.compareDocumentPosition(findings) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(noteBeforeFindings).toBe(true)

    // Real table semantics: a caption, column headers, and a row header per row.
    const table = page.getByRole('table', { name: 'Hauntings grouped by WCAG criterion' })
    await expect(table.getByRole('columnheader')).toHaveText(['Criterion', 'Name', 'Level', 'Affected elements', 'Highest severity'])
    const firstRow = table.getByRole('row').nth(1)
    await expect(firstRow.getByRole('rowheader')).toHaveText('1.1.1')
    const cells = firstRow.getByRole('cell')
    await expect(cells.nth(0)).toHaveText('Non-text Content')
    await expect(cells.nth(1)).toHaveText('A')
    await expect(cells.nth(2)).toHaveText(/^\d+$/)
    await expect(cells.nth(3)).toHaveText(/^(Wraith|Restless|Banished)$/)

    // Criterion ids are sorted numerically.
    const ids = await table.getByRole('rowheader').allTextContents()
    const sorted = [...ids].sort((a, b) => {
      const left = a.split('.').map(Number)
      const right = b.split('.').map(Number)
      return left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]!
    })
    expect(ids).toEqual(sorted)

    // Manual checks name their reason in words.
    await expect(page.getByRole('table', { name: 'Elements that need a manual check' })).toContainText(
      'Contrast uncertain: image or gradient background',
    )
  })

  test('exports Markdown and JSON downloads that carry the audit', async ({ page }) => {
    const cspViolations: string[] = []
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) cspViolations.push(message.text())
    })
    await openDaylight(page)
    const sample: { result: { score: number; hauntings: unknown[]; raw: { auditedUrl: string } } } = await (
      await page.request.get('/api/samples/cursed-shop-index')
    ).json()
    const { score } = sample.result
    const criterionIds = await page
      .getByRole('table', { name: 'Hauntings grouped by WCAG criterion' })
      .getByRole('rowheader')
      .allTextContents()
    expect(criterionIds.length).toBeGreaterThan(3)

    const markdownDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export as Markdown' }).click()
    const markdownFile = await markdownDownload
    expect(markdownFile.suggestedFilename()).toMatch(/^unseen-audit-cursed-shop-sample-\d+\.md$/)
    const markdown = await readDownload(markdownFile)
    expect(markdown).toContain(`**Haunting Score**: ${score}/100`)
    for (const id of criterionIds) expect(markdown).toMatch(new RegExp(`^### ${id.replace(/\./g, '\\.')} `, 'm'))
    expect(markdown).toContain('## Coverage Note')
    expect(markdown).toContain('not a statement that the site meets or fails WCAG 2.2')
    await expect(page.getByRole('status').filter({ hasText: 'Exported unseen-audit-' })).toBeVisible()

    const jsonDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export as JSON' }).click()
    const jsonFile = await jsonDownload
    expect(jsonFile.suggestedFilename()).toMatch(/^unseen-audit-cursed-shop-sample-\d+\.json$/)
    const parsed: { hauntings: unknown[]; score: number; raw: { auditedUrl: string; screenshotPng: string } } = JSON.parse(await readDownload(jsonFile))
    expect(parsed.hauntings).toHaveLength(sample.result.hauntings.length)
    expect(parsed.score).toBe(score)
    expect(parsed.raw.auditedUrl).toBe(sample.result.raw.auditedUrl)
    // The client's audit has its screenshot stripped; the export is the audit as received.
    expect(parsed.raw.screenshotPng).toBe('')

    expect(cspViolations).toEqual([])
  })

  test('says so when automated checks found nothing', async ({ page }) => {
    await page.route('**/api/samples/cursed-shop-index', async (route) => {
      const response = await route.fetch()
      const body: { result: { hauntings: unknown[]; score: number } } = await response.json()
      body.result.hauntings = []
      body.result.score = 0
      await route.fulfill({ response, json: body })
    })
    await openDaylight(page)
    await expect(page.getByText('No hauntings found by automated checks; a manual review is still needed.')).toBeVisible()
    await expect(page.getByRole('table', { name: 'Hauntings grouped by WCAG criterion' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Export as Markdown' })).toBeVisible()
  })

  test('is reachable from Spirit Sight and keeps motion off', async ({ page }) => {
    await page.goto(SAMPLE)
    await page.getByRole('link', { name: 'Daylight mode' }).click()
    await expect(page).toHaveURL(/\/daylight$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Daylight report: ${HOSTNAME}`)
    await expect(page.locator('img[alt="Audited page screenshot"]')).toHaveCount(0)
    await expect(page.locator('canvas#spirit-sight')).toHaveCount(0)
    const animated = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)
    expect(animated).toBe(0)
  })
})
