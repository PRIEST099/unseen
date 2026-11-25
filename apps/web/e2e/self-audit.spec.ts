import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { TestInfo } from '@playwright/test'
import { auditAndClassify } from '@the-unseen/core'
import type { ClassifiedAudit } from '@the-unseen/core'

/**
 * The app audits itself. Each test runs the real audit engine against the production build served by
 * Playwright's webServer (NODE_ENV=test) and requires zero hauntings and zero unmapped axe violations.
 * Before that, a presence marker read from the audit's own AX tree proves the page actually rendered,
 * so a blank page or an error page cannot pass vacuously.
 */

const SAMPLE = '/sample/cursed-shop-index'
// The committed sample records the relative URL /cursed-shop/index.html, shown as "Cursed Shop (sample)".
const HOSTNAME = 'Cursed Shop (sample)'
const AUDIT_TIMEOUT_MS = 180_000

type AxNode = ClassifiedAudit['raw']['axNodes'][number]

type Marker = {
  heading: string
  /** Accessible names of buttons that must exist in the audited AX tree. */
  buttons?: string[]
}

type Route = {
  title: string
  path: string
  marker: Marker
}

const ROUTES: Route[] = [
  { title: 'Landing', path: '/', marker: { heading: 'THE UNSEEN', buttons: ['Begin audit', 'Toggle sound'] } },
  {
    title: 'Spirit Sight',
    path: SAMPLE,
    marker: { heading: `Spirit Sight: ${HOSTNAME}`, buttons: ['Open Spirit Sight'] },
  },
  { title: 'Whisper Walk', path: `${SAMPLE}/whisper`, marker: { heading: `Whisper Walk: ${HOSTNAME}` } },
  { title: 'Keyboard Walk', path: `${SAMPLE}/keyboard`, marker: { heading: `Keyboard Walk: ${HOSTNAME}` } },
  { title: 'Daylight', path: `${SAMPLE}/daylight`, marker: { heading: `Daylight report: ${HOSTNAME}` } },
  { title: '404', path: '/nonexistent', marker: { heading: 'Page not found' } },
  // Product states that need no stubbing: an expired job and a missing sample.
  { title: 'Audit not found', path: '/audit/expired-job', marker: { heading: 'Audit not found' } },
  { title: 'Sample not found', path: '/sample/no-such-sample', marker: { heading: 'Sample not found' } },
]

function nameOf(node: AxNode): string {
  return String(node.name.value ?? '').trim()
}

function levelOf(node: AxNode): number | null {
  const level = node.properties.find((property) => property.name === 'level')?.value.value
  return typeof level === 'number' ? level : null
}

function hasHeading(audit: ClassifiedAudit, level: number, name: string): boolean {
  return audit.raw.axNodes.some(
    (node) => !node.ignored && node.role.value === 'heading' && levelOf(node) === level && nameOf(node) === name,
  )
}

function hasButton(audit: ClassifiedAudit, name: string): boolean {
  return audit.raw.axNodes.some((node) => !node.ignored && node.role.value === 'button' && nameOf(node) === name)
}

function h1Names(audit: ClassifiedAudit): string[] {
  return audit.raw.axNodes
    .filter((node) => !node.ignored && node.role.value === 'heading' && levelOf(node) === 1)
    .map(nameOf)
}

function describeHauntings(audit: ClassifiedAudit): string {
  return audit.hauntings
    .map(
      (haunting) =>
        `- ${haunting.type} (${haunting.severity}, ${haunting.wcag.map((criterion) => criterion.id).join(' ')}): ${haunting.explanation}\n    ${haunting.htmlSnippet}`,
    )
    .join('\n')
}

function describeUnmapped(audit: ClassifiedAudit): string {
  return audit.axeCrossCheck.unmapped
    .map(
      (violation) =>
        `- ${violation.id} (${violation.impact ?? 'no impact'}): ${violation.description}\n` +
        violation.nodes.map((node) => `    ${node.target.join(' ')}  ${node.html}`).join('\n'),
    )
    .join('\n')
}

function describeManualCheck(audit: ClassifiedAudit): string {
  return audit.needsManualCheck.map((node) => `- ${node.reason}: ${JSON.stringify(node)}`).join('\n')
}

async function attachFindings(info: TestInfo, audit: ClassifiedAudit): Promise<void> {
  if (audit.hauntings.length > 0) {
    await info.attach('hauntings', { body: describeHauntings(audit), contentType: 'text/plain' })
  }
  if (audit.axeCrossCheck.unmapped.length > 0) {
    await info.attach('unmapped-axe-violations', { body: describeUnmapped(audit), contentType: 'text/plain' })
  }
  if (audit.needsManualCheck.length > 0) {
    await info.attach('needs-manual-check', { body: describeManualCheck(audit), contentType: 'text/plain' })
  }
}

for (const route of ROUTES) {
  test(`${route.title} (${route.path}) has zero hauntings and zero unmapped axe violations`, async ({ baseURL }, info) => {
    test.setTimeout(AUDIT_TIMEOUT_MS)
    if (baseURL === undefined) throw new Error('Playwright baseURL is not configured')
    const url = new URL(route.path, baseURL).href

    const audit = await auditAndClassify(url, { allowPrivate: true })
    await attachFindings(info, audit)

    // Presence markers first: the page must really have rendered this view.
    expect(h1Names(audit), `Expected exactly one h1 on ${route.path}`).toEqual([route.marker.heading])
    expect(hasHeading(audit, 1, route.marker.heading), `h1 "${route.marker.heading}" missing from the AX tree`).toBe(true)
    for (const name of route.marker.buttons ?? []) {
      expect(hasButton(audit, name), `button "${name}" missing from the AX tree of ${route.path}`).toBe(true)
    }
    expect(audit.raw.collectionErrors, `Audit of ${route.path} had collection errors`).toEqual([])

    expect(audit.hauntings, `Hauntings on ${route.path}:\n${describeHauntings(audit)}`).toHaveLength(0)
    expect(audit.axeCrossCheck.unmapped, `Unmapped axe violations on ${route.path}:\n${describeUnmapped(audit)}`).toHaveLength(0)
    expect(audit.needsManualCheck, `Needs-manual-check nodes on ${route.path}:\n${describeManualCheck(audit)}`).toHaveLength(0)
    expect(audit.score).toBe(0)
  })
}

test('Spirit Sight after "Open Spirit Sight" has zero axe violations and zero incomplete items', async ({ page }, info) => {
  test.setTimeout(AUDIT_TIMEOUT_MS)
  await page.goto(SAMPLE)
  await expect(page.getByRole('heading', { level: 1, name: `Spirit Sight: ${HOSTNAME}` })).toBeVisible()
  await expect(page.locator('img[alt="Audited page screenshot"]')).toBeVisible()
  await expect(page.locator('canvas#spirit-sight')).toBeAttached()

  const toggle = page.getByRole('button', { name: 'Open Spirit Sight' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Spirit Sight open:' })).toHaveText(
    /^Spirit Sight open: \d+ hauntings, score \d+$/,
    { timeout: 10_000 },
  )

  // The overlay buttons are present, and every fade-in has finished so contrast is read at full opacity.
  const overlays = page.locator('.haunting-overlay-button')
  expect(await overlays.count(), 'Overlay buttons must be present after activation').toBeGreaterThan(10)
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))

  const results = await new AxeBuilder({ page }).analyze()
  const format = (items: typeof results.violations): string =>
    items.map((item) => `- ${item.id} (${item.impact ?? 'no impact'}): ${item.help}\n${item.nodes.map((node) => `    ${node.target.join(' ')}  ${node.html}`).join('\n')}`).join('\n')
  if (results.violations.length > 0) await info.attach('axe-violations', { body: format(results.violations), contentType: 'text/plain' })
  if (results.incomplete.length > 0) await info.attach('axe-incomplete', { body: format(results.incomplete), contentType: 'text/plain' })

  expect(results.violations, `axe violations with Spirit Sight open:\n${format(results.violations)}`).toEqual([])
  expect(results.incomplete, `axe incomplete items with Spirit Sight open:\n${format(results.incomplete)}`).toEqual([])
})
