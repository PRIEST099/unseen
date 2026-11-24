import { test, expect } from '@playwright/test'
import { auditAndClassify, getPool } from '../src/index.js'
import type { ClassifiedAudit, Haunting, HauntingType } from '../src/classifier/types.js'
import { startPagesServer, type PagesServer } from './fixtures/pages-server.js'

// Classifier regressions found on pages the classifier had never seen
// (docs/brief/review-notes/classifier-unseen-pages-1.md). Each test loads a fixture that reproduces one finding.

let pages: PagesServer
test.beforeAll(async () => {
  pages = await startPagesServer()
})
test.afterAll(async () => {
  await getPool().close()
  await pages.close()
})

const audit = (file: string): Promise<ClassifiedAudit> => auditAndClassify(`${pages.baseUrl}/${file}`, { allowPrivate: true })

const all = (a: ClassifiedAudit): Haunting[] => a.hauntings.flatMap((h) => [h, ...h.secondary])
const attrOf = (a: ClassifiedAudit, h: Haunting, name: 'id' | 'class'): string => a.raw.domNodes[String(h.nodeIds[0])]?.attrs[name] ?? ''
const idsOf = (a: ClassifiedAudit, type: HauntingType): string[] =>
  all(a)
    .filter((h) => h.type === type)
    .map((h) => attrOf(a, h, 'id'))
    .sort()

test('item 3: a colour-only focus change is an Invisible Wanderer; an added underline or a 3:1 colour change is not', async () => {
  const a = await audit('focus-colour-only.html')
  expect(idsOf(a, 'InvisibleWanderer')).toEqual(['plain', 'shade', 'unpaintedborder'])
})

test('item 2: a cross-origin consent iframe is one manual check, never an Invisible Wanderer (score 0)', async () => {
  const a = await audit('iframe-cross-origin-consent.html')
  expect(a.hauntings).toEqual([])
  expect(a.score).toBe(0)
  expect(a.needsManualCheck).toHaveLength(1)
  expect(a.needsManualCheck[0]?.reason).toBe('focus-style-unavailable')
  expect(a.needsManualCheck[0]?.htmlSnippet).toContain('Cookie consent')
})

test('item 1: an unnamed button inside a same-origin iframe is a Nameless Spirit, corroborated by its own axe finding', async () => {
  const a = await audit('iframe-unnamed-button.html')
  expect(idsOf(a, 'NamelessSpirit')).toEqual(['A', 'B', 'inner-button'])

  const inner = all(a).find((h) => attrOf(a, h, 'id') === 'inner-button')!
  expect(a.raw.axNodes.some((n) => n.backendDOMNodeId === inner.nodeIds[0] && n.role.value === 'button')).toBe(true)
  expect(inner.speech).toBe('button')
  expect(a.axeCrossCheck.hauntingToAxe[inner.id]).toContain('button-name')
  // the links are corroborated by link-name only: the iframe button is not credited to them
  for (const link of all(a).filter((h) => ['A', 'B'].includes(attrOf(a, h, 'id')))) {
    expect(a.axeCrossCheck.hauntingToAxe[link.id]).toEqual(['link-name'])
  }
  expect(a.axeCrossCheck.unmapped).toEqual([])
})

test('item 4: The Veiled flags a tabbable link inside an aria-hidden container, on screen or off', async () => {
  const a = await audit('veiled-offscreen-focusable.html')
  expect(idsOf(a, 'TheVeiled')).toEqual(['offscreen', 'onscreen'])
})

test('item 5: core-task keywords match whole words, not substrings', async () => {
  const a = await audit('severity-keywords.html')
  const severityOf = (cls: string): string | undefined =>
    all(a).find((h) => h.type === 'NamelessSpirit' && attrOf(a, h, 'class') === cls)?.severity
  expect(severityOf('research-toggle')).toBe('Restless')
  expect(severityOf('paypal-express')).toBe('Restless')
  expect(severityOf('add-to-cart-btn')).toBe('Wraith')
})
