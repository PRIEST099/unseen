import type { ManualCheckNode } from '@the-unseen/core'

type Reason = ManualCheckNode['reason']

const REASON_LABELS: Record<Reason, string> = {
  'contrast-uncertain': 'Contrast uncertain: image or gradient background',
  'off-screen-content': 'Off-screen content: check that it is meant to be hidden',
  'focus-style-unavailable': 'Focus style unavailable: check the focus indicator by hand',
}

const REASON_HELP: Record<Reason, string> = {
  'contrast-uncertain': 'The background could not be resolved to one colour. Measure the text contrast by hand.',
  'off-screen-content': 'The element sits outside the visible page. Confirm that users who need it can still reach it.',
  'focus-style-unavailable': 'The focus style of this element could not be read. Tab to it and look for a visible indicator.',
}

function isReason(reason: string): reason is Reason {
  return Object.hasOwn(REASON_LABELS, reason)
}

/** Human-readable reason for a needs-manual-check node. An unknown reason is shown as written. */
export function manualCheckLabel(reason: string): string {
  return isReason(reason) ? REASON_LABELS[reason] : reason
}

export function manualCheckHelp(reason: string): string {
  return isReason(reason) ? REASON_HELP[reason] : 'This element could not be verified automatically.'
}
