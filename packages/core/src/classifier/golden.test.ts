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
