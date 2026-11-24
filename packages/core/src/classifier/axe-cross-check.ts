import type { AxeViolation, RawAudit } from '../types.js'
import type { AxeCrossCheck, Haunting } from './types.js'

function allHauntings(hauntings: readonly Haunting[]): Haunting[] {
  return hauntings.flatMap((h) => [h, ...h.secondary])
}

/**
 * Map each axe violation to the hauntings that cover the same element (by DOM id). An axe node whose
 * DOM id is unknown (a cross-origin frame, a shadow target) is never matched to a haunting on another
 * element: a violation with such a node, or with no matching haunting, is reported in `unmapped`.
 * A violation that has both kinds of node appears in `hauntingToAxe` and in `unmapped`.
 */
export function crossCheckAxe(hauntings: readonly Haunting[], raw: RawAudit): AxeCrossCheck {
  const all = allHauntings(hauntings)
  const hauntingToAxe: Record<string, string[]> = {}
  const unmapped: AxeViolation[] = []
  for (const violation of raw.axeViolations) {
    let mapped = false
    let unresolved = false
    for (const node of violation.nodes) {
      const id = node.backendDOMNodeId
      if (id === null) {
        unresolved = true
        continue
      }
      for (const h of all.filter((x) => x.nodeIds.includes(id))) {
        mapped = true
        const rules = hauntingToAxe[h.id] ?? []
        if (!rules.includes(violation.id)) rules.push(violation.id)
        hauntingToAxe[h.id] = rules
      }
    }
    if (!mapped || unresolved) unmapped.push(violation)
  }
  return { hauntingToAxe, unmapped }
}
