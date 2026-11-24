import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbWcagHauntings, SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import { compareCriterionIds, groupByWCAG } from './wcag-groups'

describe('compareCriterionIds', () => {
  it('orders numerically, not as text', () => {
    const ids = ['4.1.2', '1.4.10', '1.4.3', '2.1.1', '1.1.1']
    expect([...ids].sort(compareCriterionIds)).toEqual(['1.1.1', '1.4.3', '1.4.10', '2.1.1', '4.1.2'])
  })
})

describe('groupByWCAG', () => {
  it('returns no groups for no hauntings', () => {
    expect(groupByWCAG([])).toEqual([])
  })

  it('lists a haunting under every criterion it names, and counts primaries separately', () => {
    const groups = groupByWCAG(SAMPLE_AUDIT.hauntings)
    const byId = new Map(groups.map((group) => [group.criterion.id, group]))
    // Taken from the committed sample: 4.1.2 is primary for 9 hauntings and secondary for 9 more.
    expect(byId.get('4.1.2')?.hauntings.length).toBe(18)
    expect(byId.get('4.1.2')?.primaryCount).toBe(9)
    expect(byId.get('2.4.4')?.primaryCount).toBe(0)
    expect(groups[0]?.criterion.id).toBe('1.1.1')
  })

  it('sorts by criterion id and every group is non-empty', () => {
    fc.assert(
      fc.property(arbWcagHauntings, (hauntings) => {
        const groups = groupByWCAG(hauntings)
        for (let index = 1; index < groups.length; index += 1) {
          expect(compareCriterionIds(groups[index - 1]!.criterion.id, groups[index]!.criterion.id)).toBeLessThan(0)
        }
        for (const group of groups) expect(group.hauntings.length).toBeGreaterThan(0)
      }),
    )
  })

  it('attributes every haunting to its primary criterion and totals match the criteria lists', () => {
    fc.assert(
      fc.property(arbWcagHauntings, (hauntings) => {
        const groups = groupByWCAG(hauntings)
        // Each haunting is counted once per distinct criterion it lists...
        const expectedTotal = hauntings.reduce((sum, haunting) => sum + new Set(haunting.wcag.map((c) => c.id)).size, 0)
        expect(groups.reduce((sum, group) => sum + group.hauntings.length, 0)).toBe(expectedTotal)
        // ...and exactly once under its primary criterion, so primary counts add up to the haunting count.
        expect(groups.reduce((sum, group) => sum + group.primaryCount, 0)).toBe(hauntings.length)
        for (const haunting of hauntings) {
          const primary = groups.find((group) => group.criterion.id === haunting.wcag[0]?.id)
          expect(primary?.hauntings).toContain(haunting)
        }
      }),
    )
  })

  it('reports the most severe severity of its hauntings', () => {
    fc.assert(
      fc.property(arbWcagHauntings, (hauntings) => {
        for (const group of groupByWCAG(hauntings)) {
          const severities = group.hauntings.map((haunting) => haunting.severity)
          const expected = severities.includes('Wraith') ? 'Wraith' : severities.includes('Restless') ? 'Restless' : 'Banished'
          expect(group.highestSeverity).toBe(expected)
        }
      }),
    )
  })
})
