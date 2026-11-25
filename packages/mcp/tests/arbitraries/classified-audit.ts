import * as fc from 'fast-check'
import type { ClassifiedAudit, Haunting, HauntingType } from '@the-unseen/core'
import { syntheticRaw } from '../../src/pure/synthetic-raw.js'
import { hauntingsArb } from './haunting.js'

function counts(hauntings: readonly Haunting[]): Record<HauntingType, number> {
  const out: Record<HauntingType, number> = {
    NamelessSpirit: 0,
    HollowPortrait: 0,
    TheFog: 0,
    LostSoul: 0,
    CursedLoop: 0,
    InvisibleWanderer: 0,
    WhisperingField: 0,
    SilentTongue: 0,
    ShatteredOrder: 0,
    TheVeiled: 0,
  }
  for (const h of hauntings) out[h.type] += 1
  return out
}

export function classifiedFrom(hauntings: Haunting[], score: number, url = 'http://example.test/'): ClassifiedAudit {
  return {
    hauntings,
    score,
    countsByType: counts(hauntings),
    detectedCountsByType: counts(hauntings),
    needsManualCheck: [],
    automatedCoverageNote: 'Automated checks find approximately 30–40% of WCAG issues. Manual testing is required for complete coverage.',
    axeCrossCheck: { hauntingToAxe: {}, unmapped: [] },
    raw: syntheticRaw({ auditedUrl: url }),
  }
}

export const classifiedAuditArb: fc.Arbitrary<ClassifiedAudit> = fc
  .tuple(hauntingsArb, fc.integer({ min: 0, max: 100 }))
  .map(([hauntings, score]) => classifiedFrom(hauntings, score))
