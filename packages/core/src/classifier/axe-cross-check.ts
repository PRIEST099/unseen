import type { AxeViolation, RawAudit } from '../types.js'
import type { AxeCrossCheck, Haunting, HauntingType } from './types.js'

/** Requirement 16.1: axe rule -> haunting type, used only for axe nodes whose DOM id is unknown. */
export const AXE_RULE_TO_TYPE: Readonly<Record<string, HauntingType | null>> = {
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
}

function allHauntings(hauntings: readonly Haunting[]): Haunting[] {
  return hauntings.flatMap((h) => [h, ...h.secondary])
}

/** The hauntings one axe node corroborates: by DOM id when known, otherwise by the rule table. */
function matches(all: readonly Haunting[], rule: string, id: number | null): Haunting[] {
  if (id !== null) return all.filter((h) => h.nodeIds.includes(id))
  const type = Object.prototype.hasOwnProperty.call(AXE_RULE_TO_TYPE, rule) ? AXE_RULE_TO_TYPE[rule] : undefined
  return type ? all.filter((h) => h.type === type) : []
}

/**
 * Map each axe violation to the hauntings it corroborates. A violation with no matching haunting is
 * reported in `unmapped`, so none is lost.
 */
export function crossCheckAxe(hauntings: readonly Haunting[], raw: RawAudit): AxeCrossCheck {
  const all = allHauntings(hauntings)
  const hauntingToAxe: Record<string, string[]> = {}
  const unmapped: AxeViolation[] = []
  for (const violation of raw.axeViolations) {
    let mapped = false
    for (const node of violation.nodes) {
      for (const h of matches(all, violation.id, node.backendDOMNodeId)) {
        mapped = true
        const rules = hauntingToAxe[h.id] ?? []
        if (!rules.includes(violation.id)) rules.push(violation.id)
        hauntingToAxe[h.id] = rules
      }
    }
    if (!mapped) unmapped.push(violation)
  }
  return { hauntingToAxe, unmapped }
}
