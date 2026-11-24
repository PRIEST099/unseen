import type { HauntingType, UnclassifiedHaunting } from './types.js'

/** Highest precedence first. SilentTongue and ShatteredOrder never take part. */
export const PRECEDENCE_ORDER: readonly HauntingType[] = [
  'CursedLoop',
  'NamelessSpirit',
  'WhisperingField',
  'LostSoul',
  'HollowPortrait',
  'TheVeiled',
  'InvisibleWanderer',
  'TheFog',
]

export type ResolvedHaunting = UnclassifiedHaunting & { isPrimary: boolean; secondary: UnclassifiedHaunting[] }

const rank = (type: HauntingType): number => PRECEDENCE_ORDER.indexOf(type)
export const takesPartInPrecedence = (h: UnclassifiedHaunting): boolean => rank(h.type) !== -1

/**
 * Group hauntings that share any backendDOMNodeId in `nodeIds`. The first claimant in precedence order is
 * the primary; later colliders become `secondary` of the highest-precedence owner. Returns primaries only.
 * SilentTongue and ShatteredOrder are always primary.
 */
export function resolvePrecedence(hauntings: readonly UnclassifiedHaunting[]): ResolvedHaunting[] {
  const always = hauntings.filter((h) => !takesPartInPrecedence(h))
  const ordered = hauntings
    .map((h, index) => ({ h, index }))
    .filter(({ h }) => takesPartInPrecedence(h))
    .sort((a, b) => rank(a.h.type) - rank(b.h.type) || a.index - b.index)
    .map(({ h }) => h)

  const claimed = new Map<number, ResolvedHaunting>()
  const primaries: ResolvedHaunting[] = []
  for (const h of ordered) {
    const owners = [...new Set(h.nodeIds.map((id) => claimed.get(id)).filter((o): o is ResolvedHaunting => o !== undefined))]
    const owner = owners.sort((a, b) => rank(a.type) - rank(b.type) || primaries.indexOf(a) - primaries.indexOf(b))[0]
    if (owner === undefined) {
      const primary: ResolvedHaunting = { ...h, isPrimary: true, secondary: [] }
      primaries.push(primary)
      for (const id of h.nodeIds) claimed.set(id, primary)
    } else {
      owner.secondary.push(h)
    }
  }
  const pageLevel: ResolvedHaunting[] = always.map((h) => ({ ...h, isPrimary: true, secondary: [] }))
  return [...primaries, ...pageLevel]
}
