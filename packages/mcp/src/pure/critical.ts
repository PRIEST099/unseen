import type { HauntingSeverity, HauntingType } from '@the-unseen/core'

/** Types the steering says must never ship, even outside a form. */
export const ALWAYS_CRITICAL_TYPES: ReadonlySet<HauntingType> = new Set<HauntingType>([
  'NamelessSpirit',
  'WhisperingField',
  'CursedLoop',
])

export function isCritical(h: { severity: HauntingSeverity; type: HauntingType }): boolean {
  return h.severity === 'Wraith' || ALWAYS_CRITICAL_TYPES.has(h.type)
}
