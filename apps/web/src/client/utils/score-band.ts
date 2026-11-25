/**
 * Plain-language wording for a Haunting Score (0-100, higher means more accessibility barriers; see
 * `.kiro/steering/hauntings.md`). Used where a first-time visitor meets the number without context,
 * such as the landing sample cards. The wording never claims that a page is compliant.
 */

export const SCORE_MAX = 100

/** Shown next to the cards so the number is explained once, visibly and to screen readers. */
export const SCORE_EXPLANATION = 'Haunting Score out of 100; higher means more accessibility barriers.'

type ScoreBand = { min: number; label: string }

/**
 * Lower bounds, highest first. The score curve is `100 * (1 - exp(-raw / 120))`: one Wraith scores
 * about 15, five about 57 and twenty about 96, so the bands follow those landmarks.
 */
const SCORE_BANDS: readonly ScoreBand[] = [
  { min: 85, label: 'heavily haunted' },
  { min: 60, label: 'badly haunted' },
  { min: 30, label: 'haunted' },
  { min: 1, label: 'lightly haunted' },
  { min: 0, label: 'no hauntings detected' },
]

/** Clamps to 0-100 and rounds; anything that is not a finite number reads as 0. */
export function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.min(SCORE_MAX, Math.max(0, Math.round(score)))
}

/** Severity wording for a score, e.g. 98 → "heavily haunted". */
export function scoreBandLabel(score: number): string {
  const value = normalizeScore(score)
  return SCORE_BANDS.find((band) => value >= band.min)?.label ?? 'no hauntings detected'
}

/** "98 / 100", the score out of its maximum. */
export function scoreOutOf(score: number): string {
  return `${normalizeScore(score)} / ${SCORE_MAX}`
}
