import type { Haunting, HauntingSeverity, HauntingType } from '@the-unseen/core'
import { HAUNTING_TYPE_ORDER, mostSevere } from './haunting-display'

export type HauntingGroup = {
  type: HauntingType
  count: number // primary instances of this type
  severity: HauntingSeverity | null // most severe instance; null when the group is empty
  instances: Haunting[]
}

/**
 * One group per haunting type, in sidebar order (requirement 11.1). Empty groups are kept so
 * the sidebar always shows all ten types.
 */
export function groupHauntings(hauntings: readonly Haunting[]): HauntingGroup[] {
  return HAUNTING_TYPE_ORDER.map((type) => {
    const instances = hauntings.filter((haunting) => haunting.type === type)
    return {
      type,
      count: instances.length,
      severity: instances.length === 0 ? null : mostSevere(instances.map((haunting) => haunting.severity)),
      instances,
    }
  })
}
