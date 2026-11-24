import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { PRECEDENCE_ORDER, resolvePrecedence } from './precedence.js'
import type { HauntingType, UnclassifiedHaunting } from './types.js'
import { HAUNTING_TYPES } from './types.js'
import { WCAG_4_1_2 } from './wcag.js'

const RUNS = { numRuns: 200 }

function h(type: HauntingType, ...nodeIds: number[]): UnclassifiedHaunting {
  return {
    id: `${type}-${nodeIds.join('_')}`,
    type,
    wcag: [WCAG_4_1_2],
    nodeIds,
    box: null,
    htmlSnippet: '',
    explanation: '',
    persona: 'As a user, I test.',
    fix: { instruction: '', codeSnippet: '' },
  }
}

const arbHaunting: fc.Arbitrary<UnclassifiedHaunting> = fc
  .tuple(fc.constantFrom(...HAUNTING_TYPES), fc.array(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 4 }))
  .map(([type, ids]) => h(type, ...ids))

describe('resolvePrecedence properties', () => {
  // Feature: haunting-classifier, Property 17: Primary haunting uniqueness
  it('Property 17: no backendDOMNodeId appears in two participating primaries', () => {
    fc.assert(
      fc.property(fc.array(arbHaunting, { maxLength: 25 }), (input) => {
        const seen = new Set<number>()
        for (const p of resolvePrecedence(input).filter((x) => PRECEDENCE_ORDER.includes(x.type))) {
          for (const id of new Set(p.nodeIds)) {
            expect(seen.has(id), `node ${id} claimed twice`).toBe(false)
            seen.add(id)
          }
        }
      }),
      RUNS
    )
  })

  it('every input haunting is kept: as a primary or as a secondary', () => {
    fc.assert(
      fc.property(fc.array(arbHaunting, { maxLength: 25 }), (input) => {
        const out = resolvePrecedence(input)
        const kept = out.flatMap((p) => [p, ...p.secondary])
        expect(kept).toHaveLength(input.length)
      }),
      RUNS
    )
  })

  it('a secondary shares a node with its primary, and its type ranks below it', () => {
    fc.assert(
      fc.property(fc.array(arbHaunting, { maxLength: 25 }), (input) => {
        for (const p of resolvePrecedence(input)) {
          for (const s of p.secondary) {
            expect(s.nodeIds.some((id) => p.nodeIds.includes(id))).toBe(true)
            expect(PRECEDENCE_ORDER.indexOf(s.type)).toBeGreaterThanOrEqual(PRECEDENCE_ORDER.indexOf(p.type))
          }
        }
      }),
      RUNS
    )
  })

  it('SilentTongue and ShatteredOrder are always primary and never take a secondary', () => {
    fc.assert(
      fc.property(fc.array(arbHaunting, { maxLength: 25 }), (input) => {
        const out = resolvePrecedence(input)
        for (const type of ['SilentTongue', 'ShatteredOrder'] as const) {
          expect(out.filter((p) => p.type === type)).toHaveLength(input.filter((x) => x.type === type).length)
        }
        for (const p of out.filter((x) => x.type === 'SilentTongue' || x.type === 'ShatteredOrder')) {
          expect(p.isPrimary).toBe(true)
          expect(p.secondary).toEqual([])
        }
      }),
      RUNS
    )
  })

  it('the highest-ranking participating haunting is always a primary', () => {
    fc.assert(
      fc.property(fc.array(arbHaunting, { minLength: 1, maxLength: 20 }), (input) => {
        const participating = input.filter((x) => PRECEDENCE_ORDER.includes(x.type))
        if (participating.length === 0) return
        const best = Math.min(...participating.map((x) => PRECEDENCE_ORDER.indexOf(x.type)))
        const primaries = resolvePrecedence(input).filter((p) => PRECEDENCE_ORDER.indexOf(p.type) === best)
        expect(primaries.length).toBeGreaterThan(0)
      }),
      RUNS
    )
  })

  it('does not mutate its input', () => {
    const input = [h('CursedLoop', 1, 2), h('WhisperingField', 2)]
    const copy = JSON.stringify(input)
    resolvePrecedence(input)
    expect(JSON.stringify(input)).toBe(copy)
  })
})

describe('resolvePrecedence examples', () => {
  const primaries = (input: UnclassifiedHaunting[]): string[] => resolvePrecedence(input).filter((p) => p.isPrimary).map((p) => p.type)

  it('lists the precedence order of the steering', () => {
    expect(PRECEDENCE_ORDER).toEqual(['CursedLoop', 'NamelessSpirit', 'WhisperingField', 'LostSoul', 'HollowPortrait', 'TheVeiled', 'InvisibleWanderer', 'TheFog'])
  })

  it('CursedLoop beats NamelessSpirit on the same element', () => {
    const [p] = resolvePrecedence([h('NamelessSpirit', 3), h('CursedLoop', 1, 3)])
    expect(p?.type).toBe('CursedLoop')
    expect(p?.secondary.map((s) => s.type)).toEqual(['NamelessSpirit'])
  })

  it('NamelessSpirit beats WhisperingField on the same element', () => {
    const [p] = resolvePrecedence([h('WhisperingField', 3), h('NamelessSpirit', 3)])
    expect(p?.type).toBe('NamelessSpirit')
    expect(p?.secondary.map((s) => s.type)).toEqual(['WhisperingField'])
  })

  it('hauntings at different nodes are both primary', () => {
    expect(primaries([h('NamelessSpirit', 3), h('WhisperingField', 4)]).sort()).toEqual(['NamelessSpirit', 'WhisperingField'])
  })

  it('a CursedLoop whose nodes include a WhisperingField input keeps it as a secondary', () => {
    const out = resolvePrecedence([h('WhisperingField', 7), h('CursedLoop', 5, 6, 7)])
    expect(out).toHaveLength(1)
    expect(out[0]?.type).toBe('CursedLoop')
    expect(out[0]?.secondary.map((s) => s.type)).toEqual(['WhisperingField'])
  })

  it('a lower-precedence haunting that touches two primaries goes to the higher one', () => {
    const out = resolvePrecedence([h('TheFog', 1, 2), h('NamelessSpirit', 1), h('CursedLoop', 2)])
    expect(out.map((p) => p.type).sort()).toEqual(['CursedLoop', 'NamelessSpirit'])
    expect(out.find((p) => p.type === 'CursedLoop')?.secondary.map((s) => s.type)).toEqual(['TheFog'])
  })

  it('page-level hauntings are always primary, even on shared body ids', () => {
    const out = resolvePrecedence([h('ShatteredOrder', 2), h('ShatteredOrder', 2), h('SilentTongue', 1), h('TheFog', 2)])
    expect(out.filter((p) => p.isPrimary)).toHaveLength(4)
  })

  it('multiple elements can each have a primary haunting', () => {
    expect(resolvePrecedence([h('TheFog', 1), h('TheFog', 2), h('TheFog', 3)]).filter((p) => p.isPrimary)).toHaveLength(3)
  })

  it('NamelessSpirit with IW and Fog on the same node: IW and Fog are secondaries', () => {
    const [p] = resolvePrecedence([h('TheFog', 4), h('InvisibleWanderer', 4), h('NamelessSpirit', 4)])
    expect(p?.type).toBe('NamelessSpirit')
    expect(p?.secondary.map((s) => s.type)).toEqual(['InvisibleWanderer', 'TheFog'])
  })
})
