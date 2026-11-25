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
/** The bounce curve of the design system. It drives transform only, never opacity (it overshoots). */
export const TAKES_FORM_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/** 600 ms bounce normally, a 100 ms opacity fade under `prefers-reduced-motion`. */
export function takesFormDurationMs(reducedMotion: boolean): number {
  return reducedMotion ? TAKES_FORM_REDUCED_MS : TAKES_FORM_MS
}

/** "1 haunting", "2 hauntings": the count and the noun, in the right number. */
export function hauntingCount(count: number): string {
  return `${count} ${count === 1 ? 'haunting' : 'hauntings'}`
}

function hauntingsLeft(count: number): string {
  return `${hauntingCount(count)} left`
}

/**
 * The polite status text after a previewed fix. It says the result is a preview, and the remaining
 * count makes every message different: the score saturates near 100, so two previews in a row can
 * leave it unchanged, and an unchanged live region announces nothing.
 */
export function exorcisedMessage(displayName: string, remaining: number, score: number): string {
  return `${displayName} exorcised: ${hauntingsLeft(remaining)}, score now ${score} (preview, audit not re-run)`
}

/** The polite status text once Spirit Sight is open. During a preview it says so, next to the audited score. */
export function spiritSightOpenMessage(count: number, score: number, preview?: { auditedScore: number }): string {
  if (preview === undefined) return `Spirit Sight open: ${count} hauntings, score ${score}`
  // The audited form keeps the spec's wording ("N hauntings"); the preview form agrees in number
  // with the exorcised message, which says "1 haunting left".
  return `Spirit Sight open (preview): ${hauntingCount(count)}, preview score ${score}, audited score ${preview.auditedScore}`
}

/**
 * The text of the sidebar's preview notice: `takenOut` hauntings are previewed as fixed and
 * `remaining` are still in the view. It always says the result is a preview and that the audit has
 * not been re-run; with nothing left it also says that this tells nothing about the page itself.
 */
export function previewNoticeText(takenOut: number, remaining: number): string {
  const unchanged = 'The audited page is unchanged and the audit has not been re-run'
  if (remaining === 0) {
    const all = takenOut === 1 ? 'the only one is' : `all ${takenOut} are`
    return `Preview only. No hauntings are left in this view: ${all} taken out to show what source-code fixes would do. ${unchanged}, so this says nothing about the page itself.`
  }
  const taken = takenOut === 1 ? '1 haunting is' : `${takenOut} hauntings are`
  return `Preview only. ${taken} taken out of this view to show what a source-code fix would do. ${unchanged}.`
}

/**
 * A count with one more digit than `total`, made of a wide digit. The sidebar sizes its
 * always-rendered preview slot with it, so a real notice never needs more room than the slot has.
 */
export function reserveCount(total: number): number {
  return Number('8'.repeat(String(Math.max(0, Math.trunc(total))).length + 1))
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
