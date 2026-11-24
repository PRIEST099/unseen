import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RawAudit } from '../types.js'
import { classify } from './classify.js'
import type { ClassifiedAudit, Haunting, HauntingType } from './types.js'
import { HAUNTING_TYPES } from './types.js'

type Resolved = { self: number[]; subtree: number[] }
type Sidecar = {
  hauntings: Record<string, Record<string, Resolved>>
  controls: Record<string, Record<string, Resolved>>
}
type GoldenEntry = { count: number; selectors: string[]; kinds?: string[] }
type GoldenPage = { hauntings: Record<string, GoldenEntry>; controls: Record<string, { selectors: string[] }> }

const RAW_DIR = new URL('../../tests/fixtures/raw/', import.meta.url)
const GOLDEN_URL = new URL('../../../../apps/cursed-shop/expected-hauntings.json', import.meta.url)

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, 'utf8'))
}

const golden = readJson(GOLDEN_URL) as Record<string, GoldenPage>

/** Control name -> the types (and for ShatteredOrder the kind) it must not be flagged as. */
const GUARDS: Record<string, Array<{ type: HauntingType; kind?: string }>> = {
  cookieBanner: [{ type: 'CursedLoop' }],
  decorativeImages: [{ type: 'HollowPortrait' }],
  accessibleCardLinks: [{ type: 'LostSoul' }, { type: 'NamelessSpirit' }],
  namedQuickView: [{ type: 'NamelessSpirit' }],
  visibleFocus: [{ type: 'InvisibleWanderer' }],
  decorativeIcons: [{ type: 'HollowPortrait' }, { type: 'TheVeiled' }],
  namedSocialLinks: [{ type: 'NamelessSpirit' }],
  hasMain: [{ type: 'ShatteredOrder', kind: 'no-main' }],
  hasH1: [{ type: 'ShatteredOrder', kind: 'no-h1' }],
  hasLang: [{ type: 'SilentTongue' }],
  decorativeAltNotHollow: [{ type: 'HollowPortrait' }],
  namedField: [{ type: 'WhisperingField' }],
  properLabels: [{ type: 'WhisperingField' }],
  visibleFocusInTrap: [{ type: 'InvisibleWanderer' }],
  mouseOnlyNativeExits: [{ type: 'LostSoul' }],
}

const PAGES = ['index', 'product', 'checkout'] as const
const PAGE_LEVEL: ReadonlySet<string> = new Set(['SilentTongue', 'ShatteredOrder'])
/** The Shattered Order kinds each page has, with the sidecar selector of the element each one sits on. */
const SHATTERED_ORDER: Record<(typeof PAGES)[number], Record<string, string>> = {
  index: {},
  product: { 'heading-skip': '.product-info h4.details-heading' }, // h1 -> h4: the h4 is the later heading
  checkout: { 'heading-skip': '.footer-content > .footer-col:nth-child(1) h4', 'no-main': 'body' },
}

/** Snapshots. Primary counts drive the score; the secondary counts are the hauntings the precedence rules fold away. */
const PRIMARY_COUNTS: Record<(typeof PAGES)[number], Partial<Record<HauntingType, number>>> = {
  index: { NamelessSpirit: 9, HollowPortrait: 4, TheFog: 7, LostSoul: 8, InvisibleWanderer: 18, TheVeiled: 1 },
  product: { NamelessSpirit: 3, HollowPortrait: 4, TheFog: 4, LostSoul: 10, InvisibleWanderer: 6, ShatteredOrder: 1 },
  checkout: { NamelessSpirit: 3, HollowPortrait: 2, TheFog: 2, CursedLoop: 1, WhisperingField: 2, SilentTongue: 1, ShatteredOrder: 2, TheVeiled: 2 },
}
const SECONDARY_COUNTS: Record<(typeof PAGES)[number], Partial<Record<HauntingType, number>>> = {
  index: { InvisibleWanderer: 3 }, // the three unnamed controls that are also tabbed with no focus ring
  product: { InvisibleWanderer: 3 },
  checkout: { WhisperingField: 1 }, // the newsletter field inside the Cursed Loop
}
const SCORES: Record<(typeof PAGES)[number], number> = { index: 98, product: 85, checkout: 70 }

const nonZero = (counts: Partial<Record<HauntingType, number>>): Partial<Record<HauntingType, number>> =>
  Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
const countBy = (types: readonly HauntingType[]): Partial<Record<HauntingType, number>> => {
  const out: Partial<Record<HauntingType, number>> = {}
  for (const t of types) out[t] = (out[t] ?? 0) + 1
  return out
}

const flatten = (audit: ClassifiedAudit): Haunting[] => audit.hauntings.flatMap((h) => [h, ...h.secondary])
const ofType = (all: readonly Haunting[], type: string): Haunting[] => all.filter((h) => h.type === type)
const sorted = (xs: Iterable<number>): number[] => [...new Set(xs)].sort((a, b) => a - b)

describe('fixtures', () => {
  it.each(PAGES)('%s.json is a RawAudit with its selector sidecar', (page) => {
    const raw = readJson(new URL(`${page}.json`, RAW_DIR)) as RawAudit
    expect(raw.schemaVersion).toBe('1')
    expect(raw.screenshotPng).toBe('')
    expect(raw.collectionErrors).toEqual([])
    expect(raw.boundingBoxes.length).toBeGreaterThan(100)
    expect(Object.keys(raw.domNodes).length).toBeGreaterThanOrEqual(raw.boundingBoxes.length)
    expect(raw.pageMetadata.htmlBackendDOMNodeId).toBeGreaterThan(0)
    const sidecar = readJson(new URL(`${page}.selectors.json`, RAW_DIR)) as Sidecar
    expect(Object.keys(sidecar.hauntings).sort()).toEqual(Object.keys(golden[`${page}.html`]!.hauntings).sort())
  })
})

describe.each(PAGES)('golden: %s.html', (page) => {
  const raw = readJson(new URL(`${page}.json`, RAW_DIR)) as RawAudit
  const sidecar = readJson(new URL(`${page}.selectors.json`, RAW_DIR)) as Sidecar
  const expected = golden[`${page}.html`]!
  const audit = classify(raw)
  const all = flatten(audit)

  it.each(HAUNTING_TYPES)('%s: detectedCountsByType equals the golden count', (type) => {
    expect(audit.detectedCountsByType[type]).toBe(expected.hauntings[type]?.count ?? 0)
  })

  it.each(HAUNTING_TYPES.filter((t) => !PAGE_LEVEL.has(t) && t !== 'CursedLoop'))(
    '%s: the elements are exactly the golden selectors',
    (type) => {
      const selectorIds = Object.values(sidecar.hauntings[type] ?? {}).flatMap((r) => r.self)
      expect(sorted(ofType(all, type).map((h) => h.nodeIds[0]!))).toEqual(sorted(selectorIds))
    }
  )

  it('CursedLoop: every node of the trap lies inside the golden selector subtree', () => {
    const loops = ofType(all, 'CursedLoop')
    const subtree = new Set(Object.values(sidecar.hauntings.CursedLoop ?? {}).flatMap((r) => r.subtree))
    expect(loops).toHaveLength(expected.hauntings.CursedLoop?.count ?? 0)
    for (const loop of loops) {
      for (const id of loop.nodeIds) expect(subtree.has(id), `node ${id}`).toBe(true)
    }
  })

  it('page-level hauntings match by type, kind and count', () => {
    expect(ofType(all, 'SilentTongue')).toHaveLength(expected.hauntings.SilentTongue?.count ?? 0)
    const kinds = ofType(all, 'ShatteredOrder').map((h) => h.kind).sort()
    expect(kinds).toHaveLength(expected.hauntings.ShatteredOrder?.count ?? 0)
    const wanted = expected.hauntings.ShatteredOrder?.kinds
    if (wanted) expect(kinds).toEqual([...wanted].sort())
  })

  it('Silent Tongue sits on the <html> element, from the sidecar', () => {
    const selfIds = Object.values(sidecar.hauntings.SilentTongue ?? {}).flatMap((r) => r.self)
    expect(sorted(ofType(all, 'SilentTongue').map((h) => h.nodeIds[0]!))).toEqual(sorted(selfIds))
    for (const h of ofType(all, 'SilentTongue')) expect(h.nodeIds).toEqual([raw.pageMetadata.htmlBackendDOMNodeId])
  })

  it('Shattered Order: each kind sits on the element the sidecar names (body for no-main, the later heading for a skip)', () => {
    const wanted = SHATTERED_ORDER[page]
    const found = ofType(all, 'ShatteredOrder').map((h) => ({ kind: h.kind, node: h.nodeIds[0] }))
    const selfOf = (selector: string): number => sidecar.hauntings.ShatteredOrder?.[selector]?.self[0] ?? -1
    expect(found.sort((a, b) => String(a.kind).localeCompare(String(b.kind)))).toEqual(
      Object.entries(wanted).map(([kind, selector]) => ({ kind, node: selfOf(selector) })).sort((a, b) => a.kind.localeCompare(b.kind))
    )
    expect(Object.values(wanted).sort()).toEqual(Object.keys(sidecar.hauntings.ShatteredOrder ?? {}).sort())
    for (const h of ofType(all, 'ShatteredOrder').filter((x) => x.kind === 'no-main')) expect(h.nodeIds).toEqual([raw.pageMetadata.bodyBackendDOMNodeId])
  })

  it('countsByType (primary) is the snapshot, and primary + secondary equals the detected count of each type', () => {
    expect(nonZero(audit.countsByType)).toEqual(PRIMARY_COUNTS[page])
    const secondaries = audit.hauntings.flatMap((h) => h.secondary)
    for (const type of HAUNTING_TYPES) {
      expect(audit.countsByType[type] + secondaries.filter((s) => s.type === type).length, type).toBe(audit.detectedCountsByType[type])
    }
  })

  it('score is the snapshot', () => {
    expect(audit.score).toBe(SCORES[page])
  })

  it('secondaries sit on the primary that owns their element', () => {
    for (const p of audit.hauntings) {
      for (const s of p.secondary) expect(s.nodeIds.some((id) => p.nodeIds.includes(id)), `${s.type} under ${p.type}`).toBe(true)
    }
    expect(nonZero(countBy(audit.hauntings.flatMap((h) => h.secondary.map((s) => s.type))))).toEqual(SECONDARY_COUNTS[page])
  })
  it('controls are not flagged as the type they name', () => {
    for (const [name, selectors] of Object.entries(sidecar.controls)) {
      const guards = GUARDS[name]
      expect(guards, `no guard defined for control ${name}`).toBeDefined()
      const selfIds = new Set(Object.values(selectors).flatMap((r) => r.self))
      for (const guard of guards ?? []) {
        const flagged = all.filter((h) => h.type === guard.type && (guard.kind === undefined || h.kind === guard.kind))
        for (const h of flagged) {
          const hit = h.nodeIds.filter((id) => selfIds.has(id))
          expect(hit, `${name} flagged as ${guard.type}`).toEqual([])
        }
      }
    }
  })

  it('every haunting has the documented shape', () => {
    for (const h of all) {
      expect(h.nodeIds.length).toBeGreaterThan(0)
      expect(h.htmlSnippet.length).toBeLessThanOrEqual(300)
      expect(h.wcag.length).toBeGreaterThan(0)
      expect(h.persona.startsWith('As a')).toBe(true)
    }
  })
})

describe('golden: placement the precedence rules decide', () => {
  const load = (page: string): { audit: ClassifiedAudit; sidecar: Sidecar } => ({
    audit: classify(readJson(new URL(`${page}.json`, RAW_DIR)) as RawAudit),
    sidecar: readJson(new URL(`${page}.selectors.json`, RAW_DIR)) as Sidecar,
  })

  it('index: 18 Invisible Wanderers are primary, and 3 more are secondaries of the Nameless Spirits', () => {
    const { audit } = load('index')
    expect(audit.countsByType.InvisibleWanderer).toBe(18)
    expect(audit.detectedCountsByType.InvisibleWanderer).toBe(21)
    const owners = audit.hauntings.filter((h) => h.secondary.some((s) => s.type === 'InvisibleWanderer'))
    expect(owners.map((h) => h.type)).toEqual(['NamelessSpirit', 'NamelessSpirit', 'NamelessSpirit'])
  })

  it('checkout: the newsletter Whispering Field is a secondary of the Cursed Loop, and 2 Whispering Fields stay primary', () => {
    const { audit, sidecar } = load('checkout')
    const newsletter = sidecar.hauntings.WhisperingField?.['#newsletterForm input[type=email]']?.self[0]
    const loop = audit.hauntings.find((h) => h.type === 'CursedLoop')
    expect(loop?.secondary.map((s) => [s.type, s.nodeIds[0]])).toEqual([['WhisperingField', newsletter]])
    expect(loop?.secondary[0]?.isPrimary).toBe(false)
    expect(audit.countsByType.WhisperingField).toBe(2)
    expect(audit.hauntings.filter((h) => h.type === 'WhisperingField').map((h) => h.nodeIds[0])).not.toContain(newsletter)
  })
})