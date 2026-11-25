import type { Haunting, HauntingSeverity } from '@the-unseen/core'

/**
 * Client-side "fix preview" helpers. They only recompute what the Haunting Score would be if some
 * hauntings were gone. Nothing here changes the audited site, and nothing re-runs the audit.
 *
 * `@the-unseen/core` exports no client-safe score function (its root pulls in Playwright and the
 * only subpath is `./speech`), so the documented formula from `.kiro/steering/hauntings.md` is
 * repeated here: weights Wraith 20, Restless 8, Banished 3 and
 * `score = round(100 * (1 - exp(-raw / 120)))` over primary hauntings only.
 */
export const SEVERITY_WEIGHTS: Readonly<Record<HauntingSeverity, number>> = {
  Wraith: 20,
  Restless: 8,
  Banished: 3,
}

const SCORE_DECAY = 120

/** The Haunting Score of a list of primary hauntings (`audit.hauntings` holds primaries only). */
export function previewScore(hauntings: readonly Haunting[]): number {
  const raw = hauntings.reduce((sum, haunting) => sum + SEVERITY_WEIGHTS[haunting.severity], 0)
  return Math.round(100 * (1 - Math.exp(-raw / SCORE_DECAY)))
}

/** The hauntings that are still there once the previewed ones are taken out. Order is kept. */
export function withoutPreviewed(hauntings: readonly Haunting[], previewed: ReadonlySet<string>): Haunting[] {
  return hauntings.filter((haunting) => !previewed.has(haunting.id))
}

export const TAKES_FORM_MS = 600
export const TAKES_FORM_REDUCED_MS = 100
export const TAKES_FORM_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/** 600 ms bounce normally, a 100 ms opacity fade under `prefers-reduced-motion`. */
export function takesFormDurationMs(reducedMotion: boolean): number {
  return reducedMotion ? TAKES_FORM_REDUCED_MS : TAKES_FORM_MS
}

/** The polite status text after a previewed fix. It says the result is a preview. */
export function exorcisedMessage(displayName: string, score: number): string {
  return `${displayName} exorcised: score now ${score} (preview, audit not re-run)`
}

/** The polite status text after the preview is reset to the audited result. */
export function previewResetMessage(score: number): string {
  return `Preview reset: score back to ${score}, as audited`
}

/**
 * Where focus should go once the previewed haunting's overlay is gone: the next remaining overlay
 * in reading order, else the closest one before it, else `null` (the caller then uses the sidebar).
 */
export function nextFocusId(orderedIds: readonly string[], fixedId: string, remaining: ReadonlySet<string>): string | null {
  const index = orderedIds.indexOf(fixedId)
  const after = index === -1 ? orderedIds : orderedIds.slice(index + 1)
  const before = index === -1 ? [] : orderedIds.slice(0, index).reverse()
  return after.find((id) => remaining.has(id)) ?? before.find((id) => remaining.has(id)) ?? null
}
