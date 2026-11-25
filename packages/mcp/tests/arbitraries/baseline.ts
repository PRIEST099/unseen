import * as fc from 'fast-check'
import type { Haunting } from '@the-unseen/core'
import { fingerprints } from '../../src/pure/baseline.js'
import { hauntingsArb } from './haunting.js'

export const fingerprintsArb: fc.Arbitrary<string[]> = fc.array(fc.string({ maxLength: 40 }), { maxLength: 12 })

/** Same hauntings with every node id and haunting id replaced, as a second audit of the same page would produce. */
export function renumber(hauntings: readonly Haunting[], offset: number): Haunting[] {
  return hauntings.map((h) => ({ ...h, id: `r${offset}${h.id}`, nodeIds: h.nodeIds.map((n) => n + offset) }))
}

export const hauntingsWithBaselineArb: fc.Arbitrary<{ current: Haunting[]; baseline: string[] }> = fc
  .tuple(hauntingsArb, fc.nat(), fc.array(fc.boolean(), { maxLength: 16 }))
  .map(([current, , keep]) => {
    const prints = fingerprints(current)
    return { current, baseline: prints.filter((_, i) => keep[i] === true) }
  })
