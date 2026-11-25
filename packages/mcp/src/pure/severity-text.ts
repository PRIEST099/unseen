import type { HauntingType } from '@the-unseen/core'

const CAN_BLOCK: ReadonlySet<HauntingType> = new Set<HauntingType>(['CursedLoop', 'NamelessSpirit', 'WhisperingField', 'LostSoul'])

const CORE_TASK =
  'part of a core task flow (inside a form or dialog, in a checkout or cart region, or a button or link named with a task word such as checkout, buy, pay, login, search)'

/** The severity rules for a type, quoted from hauntings.md ("Severity: which hauntings can block a task"). */
export function severityRules(type: HauntingType): string {
  const rest = 'Otherwise it is Restless when 3 or more instances of the type exist or the first WCAG criterion is level A, and Banished in every other case.'
  if (!CAN_BLOCK.has(type)) return `Never a Wraith: this type cannot make a core task impossible. It is Restless when 3 or more instances of the type exist or the first WCAG criterion is level A, and Banished in every other case.`
  const scope = type === 'NamelessSpirit' ? ' It can block a task only when the control is a button, menu item, menu item checkbox, menu item radio or tab.' : ''
  return `A Wraith when the element is ${CORE_TASK}.${scope} ${rest}`
}
