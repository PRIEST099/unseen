import type { ComputedStyleMap, RawAudit } from '../../types.js'
import { contrastRatio } from '../contrast.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_2_4_7, WCAG_2_4_13 } from '../wcag.js'
import { blend, findBox, hauntingId, parseCssColor, snippet } from '../util.js'
import type { RGBA } from '../util.js'

export const MIN_INDICATOR_RATIO = 3

/** The nearest opaque ancestor background the step recorded, or null when it cannot be read. */
function adjacentBackground(after: ComputedStyleMap): RGBA | null {
  const bg = parseCssColor(after['adjacent-background-color'])
  return bg !== null && bg.a >= 1 ? bg : null
}

/** A value that is known on both sides and differs. An unreadable baseline never counts as a change. */
function changed(before: string | undefined, after: string | undefined): boolean {
  return before !== undefined && after !== undefined && before !== '' && before !== after
}

/** (a) outline-style is not none, outline-width is at least 1px, and the outline reaches 3:1 against the adjacent background. */
export function hasVisibleOutline(_before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const style = after['outline-style']
  if (style === undefined || style === 'none') return false // Chromium reports offset/width/colour even then: ignore them
  if (!(parseFloat(after['outline-width'] ?? '') >= 1)) return false
  const adj = adjacentBackground(after)
  const colour = parseCssColor(after['outline-color'])
  if (!adj || !colour) return false
  return contrastRatio(blend(colour, adj), adj) >= MIN_INDICATOR_RATIO
}

/** (b) box-shadow changed to a non-transparent shadow with a colour at 3:1 against the adjacent background. */
export function hasVisibleBoxShadow(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const shadow = after['box-shadow']
  if (shadow === undefined || shadow === 'none' || shadow === before['box-shadow']) return false
  const adj = adjacentBackground(after)
  if (!adj) return false
  const ratios = (shadow.match(/rgba?\([^)]*\)/g) ?? [])
    .map((c) => parseCssColor(c))
    .flatMap((c) => (c !== null && c.a > 0 ? [contrastRatio(blend(c, adj), adj)] : []))
  return ratios.length > 0 && Math.max(...ratios) >= MIN_INDICATOR_RATIO
}

/** (c) border-color or background-color changed, and before/after differ by 3:1 once blended over the adjacent background. */
export function hasVisibleColorChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const adj = adjacentBackground(after)
  if (!adj) return false
  return ['background-color', 'border-color'].some((prop) => {
    if (!changed(before[prop], after[prop])) return false
    const b = parseCssColor(before[prop])
    const a = parseCssColor(after[prop])
    return b !== null && a !== null && contrastRatio(blend(b, adj), blend(a, adj)) >= MIN_INDICATOR_RATIO
  })
}

/** (d) text-decoration changed (for example an underline appeared). */
export function hasTextDecorationChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  return changed(before['text-decoration'], after['text-decoration'])
}

export function hasVisibleIndicator(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  return (
    hasVisibleOutline(before, after) ||
    hasVisibleBoxShadow(before, after) ||
    hasVisibleColorChange(before, after) ||
    hasTextDecorationChange(before, after)
  )
}

/** Detector 6: a tabbed element with no visible focus indicator. One per element (its first readable step). */
export function detectInvisibleWanderer(raw: RawAudit): UnclassifiedHaunting[] {
  const out: UnclassifiedHaunting[] = []
  const seen = new Set<number>()
  for (const step of raw.tabWalkResult.steps) {
    const id = step.backendDOMNodeId === '' ? NaN : Number(step.backendDOMNodeId)
    if (step.cdpError || !Number.isInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    if (hasVisibleIndicator(step.focusSnapshot.before, step.focusSnapshot.after)) continue
    out.push({
      id: hauntingId('InvisibleWanderer', id),
      type: 'InvisibleWanderer',
      wcag: [WCAG_2_4_7],
      guidance: WCAG_2_4_13,
      nodeIds: [id],
      box: findBox(raw.boundingBoxes, id),
      speech: undefined,
      htmlSnippet: snippet(raw, id),
      explanation: generateExplanation('InvisibleWanderer'),
      persona: generatePersona('InvisibleWanderer'),
      fix: generateFix('InvisibleWanderer'),
    })
  }
  return out
}
