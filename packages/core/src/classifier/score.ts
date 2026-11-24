import type { Haunting, HauntingSeverity } from './types.js'

export const SEVERITY_WEIGHTS: Readonly<Record<HauntingSeverity, number>> = {
  Wraith: 20,
  Restless: 8,
  Banished: 3,
}

/** Haunting Score, 0-100 (lower is better). Only primary hauntings count. */
export function computeScore(hauntings: readonly Haunting[]): number {
  let rawScore = 0
  for (const h of hauntings) {
    if (h.isPrimary) rawScore += SEVERITY_WEIGHTS[h.severity]
  }
  return Math.round(100 * (1 - Math.exp(-rawScore / 120)))
}
