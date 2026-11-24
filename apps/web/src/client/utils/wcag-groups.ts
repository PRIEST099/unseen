import type { Haunting, HauntingSeverity, WCAGCriterion } from '@the-unseen/core'
import { mostSevere } from './haunting-display'

export type CriterionGroup = {
  criterion: WCAGCriterion
  /** Every haunting that lists this criterion anywhere in its `wcag` array, in audit order. */
  hauntings: Haunting[]
  /** Hauntings whose primary (first) criterion is this one. */
  primaryCount: number
  highestSeverity: HauntingSeverity
}

/** Compares dotted criterion ids numerically: "1.4.3" before "1.4.10" before "2.1.1". */
export function compareCriterionIds(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Groups hauntings by WCAG criterion, following the design: a haunting is listed under EVERY criterion
 * in its `wcag` array, not only the primary one. A criterion repeated inside one haunting counts once.
 * Groups are sorted by criterion id, numerically.
 */
export function groupByWCAG(hauntings: readonly Haunting[]): CriterionGroup[] {
  const groups = new Map<string, CriterionGroup>()
  for (const haunting of hauntings) {
    const seen = new Set<string>()
    haunting.wcag.forEach((criterion, index) => {
      if (seen.has(criterion.id)) return
      seen.add(criterion.id)
      const existing = groups.get(criterion.id)
      const group: CriterionGroup = existing ?? {
        criterion,
        hauntings: [],
        primaryCount: 0,
        highestSeverity: 'Banished',
      }
      group.hauntings.push(haunting)
      if (index === 0) group.primaryCount += 1
      groups.set(criterion.id, group)
    })
  }
  const result = [...groups.values()]
  for (const group of result) group.highestSeverity = mostSevere(group.hauntings.map((haunting) => haunting.severity))
  return result.sort((a, b) => compareCriterionIds(a.criterion.id, b.criterion.id))
}
