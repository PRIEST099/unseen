import type { HauntingSeverity, HauntingType } from '@the-unseen/core'

/** Display names of the ten hauntings, as written in `.kiro/steering/hauntings.md`. */
export const HAUNTING_DISPLAY_NAMES: Record<HauntingType, string> = {
  NamelessSpirit: 'Nameless Spirit',
  HollowPortrait: 'Hollow Portrait',
  TheFog: 'The Fog',
  LostSoul: 'Lost Soul',
  CursedLoop: 'Cursed Loop',
  InvisibleWanderer: 'Invisible Wanderer',
  WhisperingField: 'Whispering Field',
  SilentTongue: 'Silent Tongue',
  ShatteredOrder: 'Shattered Order',
  TheVeiled: 'The Veiled',
}

/** Sidebar order of the ten groups. */
export const HAUNTING_TYPE_ORDER: readonly HauntingType[] = [
  'NamelessSpirit',
  'HollowPortrait',
  'TheFog',
  'LostSoul',
  'CursedLoop',
  'InvisibleWanderer',
  'WhisperingField',
  'SilentTongue',
  'ShatteredOrder',
  'TheVeiled',
]

export function hauntingDisplayName(type: HauntingType): string {
  return HAUNTING_DISPLAY_NAMES[type]
}

/** Most severe first. */
export const SEVERITY_ORDER: readonly HauntingSeverity[] = ['Wraith', 'Restless', 'Banished']

/** Severity colours as CSS custom properties (requirement 11.4). */
export const SEVERITY_COLORS: Record<HauntingSeverity, string> = {
  Wraith: 'var(--color-ember)',
  Restless: 'var(--color-candle)',
  Banished: 'var(--color-mist)',
}

export function severityRank(severity: HauntingSeverity): number {
  return SEVERITY_ORDER.indexOf(severity)
}

/** The most severe of a non-empty list; `Banished` for an empty one. */
export function mostSevere(severities: readonly HauntingSeverity[]): HauntingSeverity {
  return SEVERITY_ORDER.find((severity) => severities.includes(severity)) ?? 'Banished'
}
