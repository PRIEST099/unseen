import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbRawAudit } from '../../tests/classifier/arbitraries.js'
import { baseRaw } from '../../tests/classifier/builders.js'
import type { AxeViolation, RawAudit } from '../types.js'
import { AXE_RULE_TO_TYPE, crossCheckAxe } from './axe-cross-check.js'
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

  it('a node with a null id falls back to the rule -> type table', () => {
    const fog = haunting('TheFog', [7])
    const out = crossCheckAxe([fog, haunting('NamelessSpirit', [5])], rawWith(violation('color-contrast', null)))
    expect(out.hauntingToAxe).toEqual({ [fog.id]: ['color-contrast'] })
  })

  it('rules mapped to none, and unknown rules, stay unmapped when the id is null', () => {
    const vs = [violation('scrollable-region-focusable', null), violation('nested-interactive', null), violation('region', null)]
    const out = crossCheckAxe([haunting('NamelessSpirit', [5])], rawWith(...vs))
    expect(out.unmapped).toEqual(vs)
  })

  it('has the Req 16.1 table', () => {
    expect(AXE_RULE_TO_TYPE).toEqual({
      'button-name': 'NamelessSpirit',
      'link-name': 'NamelessSpirit',
      'image-alt': 'HollowPortrait',
      'svg-img-alt': 'HollowPortrait',
      'role-img-alt': 'HollowPortrait',
      'color-contrast': 'TheFog',
      label: 'WhisperingField',
      'html-has-lang': 'SilentTongue',
      'html-lang-valid': 'SilentTongue',
      'aria-hidden-focus': 'TheVeiled',
      'scrollable-region-focusable': null,
      'nested-interactive': null,
    })
  })

  it('ShatteredOrder has no corroborating axe rule', () => {
    expect(Object.values(AXE_RULE_TO_TYPE)).not.toContain('ShatteredOrder')
  })
})
