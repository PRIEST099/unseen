import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbRawAudit } from '../../tests/classifier/arbitraries.js'
import { baseRaw } from '../../tests/classifier/builders.js'
import type { AxeViolation, RawAudit } from '../types.js'
import { crossCheckAxe } from './axe-cross-check.js'
import { classify } from './classify.js'
import type { Haunting, HauntingType } from './types.js'
import { WCAG_4_1_2 } from './wcag.js'

const RUNS = { numRuns: 150 }

function haunting(type: HauntingType, nodeIds: number[], secondary: Haunting[] = []): Haunting {
  return {
    id: `${type}-${nodeIds.join('_')}`,
    type,
    severity: 'Banished',
    wcag: [WCAG_4_1_2],
    nodeIds,
    box: null,
    htmlSnippet: '',
    explanation: '',
    persona: 'As a user, I test.',
    fix: { instruction: '', codeSnippet: '' },
    isPrimary: true,
    secondary,
  }
}

const violation = (id: string, ...nodeIds: Array<number | null>): AxeViolation => ({
  id,
  impact: 'serious',
  tags: [],
  description: '',
  helpUrl: '',
  nodes: nodeIds.map((backendDOMNodeId) => ({ html: '', target: ['x'], failureSummary: '', backendDOMNodeId })),
})

const rawWith = (...violations: AxeViolation[]): RawAudit => baseRaw({ axeViolations: violations })

describe('crossCheckAxe properties', () => {
  // Feature: haunting-classifier, Property 16: Every axe violation is accounted for
  it('Property 16: every axe violation maps to a haunting or is unmapped, never both and never lost', () => {
    fc.assert(
      fc.property(arbRawAudit, (raw) => {
        const audit = classify(raw)
        const mappedRules = new Set(Object.values(audit.axeCrossCheck.hauntingToAxe).flat())
        const unmapped = audit.axeCrossCheck.unmapped
        for (const v of raw.axeViolations) {
          const isUnmapped = unmapped.includes(v)
          const isMapped = mappedRules.has(v.id)
          expect(isUnmapped || isMapped, `${v.id} was lost`).toBe(true)
        }
        for (const u of unmapped) expect(raw.axeViolations).toContain(u)
        // a violation that is not unmapped corroborates at least one haunting
        const all = audit.hauntings.flatMap((h) => [h, ...h.secondary])
        for (const v of raw.axeViolations.filter((x) => !unmapped.includes(x))) {
          expect(all.some((h) => audit.axeCrossCheck.hauntingToAxe[h.id]?.includes(v.id))).toBe(true)
        }
      }),
      RUNS
    )
  })

  it('every key of hauntingToAxe is the id of a haunting, and every value is an axe rule of the audit', () => {
    fc.assert(
      fc.property(arbRawAudit, (raw) => {
        const audit = classify(raw)
        const ids = new Set(audit.hauntings.flatMap((h) => [h.id, ...h.secondary.map((s) => s.id)]))
        const rules = new Set(raw.axeViolations.map((v) => v.id))
        for (const [id, list] of Object.entries(audit.axeCrossCheck.hauntingToAxe)) {
          expect(ids.has(id)).toBe(true)
          for (const rule of list) expect(rules.has(rule)).toBe(true)
        }
      }),
      RUNS
    )
  })
})

describe('crossCheckAxe examples', () => {
  it('maps an axe violation to the haunting that covers its node id', () => {
    const h = haunting('NamelessSpirit', [5])
    const out = crossCheckAxe([h], rawWith(violation('button-name', 5)))
    expect(out.hauntingToAxe).toEqual({ [h.id]: ['button-name'] })
    expect(out.unmapped).toEqual([])
  })

  it('matches on any id in nodeIds, not only the first', () => {
    const h = haunting('CursedLoop', [1, 2, 3])
    expect(crossCheckAxe([h], rawWith(violation('nested-interactive', 3))).hauntingToAxe[h.id]).toEqual(['nested-interactive'])
  })

  it('an axe violation with no haunting is unmapped', () => {
    const v = violation('color-contrast', 99)
    expect(crossCheckAxe([haunting('NamelessSpirit', [5])], rawWith(v))).toEqual({ hauntingToAxe: {}, unmapped: [v] })
  })

  it('several axe rules on one element all map to its haunting', () => {
    const h = haunting('NamelessSpirit', [5])
    const out = crossCheckAxe([h], rawWith(violation('button-name', 5), violation('color-contrast', 5), violation('button-name', 5)))
    expect(out.hauntingToAxe[h.id]).toEqual(['button-name', 'color-contrast'])
    expect(out.unmapped).toEqual([])
  })

  it('secondary hauntings are corroborated too', () => {
    const second = haunting('InvisibleWanderer', [5])
    const out = crossCheckAxe([haunting('NamelessSpirit', [5], [second])], rawWith(violation('focus-order', 5)))
    expect(Object.keys(out.hauntingToAxe)).toHaveLength(2)
  })

  it('a node with a null id is never corroborated by a haunting on another element (no rule-table fallback)', () => {
    const link = haunting('NamelessSpirit', [5])
    const v = violation('button-name', null)
    const out = crossCheckAxe([link, haunting('NamelessSpirit', [6])], rawWith(v))
    expect(out.hauntingToAxe).toEqual({})
    expect(out.unmapped).toEqual([v])
  })

  it('every unresolved node goes to unmapped, whatever its rule', () => {
    const vs = [violation('color-contrast', null), violation('scrollable-region-focusable', null), violation('region', null)]
    const out = crossCheckAxe([haunting('TheFog', [7])], rawWith(...vs))
    expect(out.hauntingToAxe).toEqual({})
    expect(out.unmapped).toEqual(vs)
  })

  it('a violation with one resolved and one unresolved node corroborates the first and is still reported unmapped', () => {
    const h = haunting('NamelessSpirit', [5])
    const v = violation('button-name', 5, null)
    const out = crossCheckAxe([h], rawWith(v))
    expect(out.hauntingToAxe).toEqual({ [h.id]: ['button-name'] })
    expect(out.unmapped).toEqual([v])
  })
})
