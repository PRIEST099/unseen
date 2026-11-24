import type { ComputedStyleMap, RawAudit, TabStep } from '../../types.js'
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

/** Two colours differ by 3:1 once blended over the adjacent background. Unreadable colours never count. */
function colourShiftVisible(before: string | undefined, after: string | undefined, adj: RGBA): boolean {
  if (!changed(before, after)) return false
  const b = parseCssColor(before)
  const a = parseCssColor(after)
  return b !== null && a !== null && contrastRatio(blend(b, adj), blend(a, adj)) >= MIN_INDICATOR_RATIO
}

/** Expand a 1 to 4 value CSS shorthand into [top, right, bottom, left]. */
function sides(parts: readonly string[]): string[] {
  const [t = '', r = t, b = t, l = r] = parts
  return [t, r, b, l]
}

const COLOUR_FN = /(?:rgba?|color)\([^)]*\)|#[0-9a-f]+|[a-z]+/gi

/** Per side: the border is painted (style is not none/hidden and width is at least 1px) and its colour. */
function borderSides(style: ComputedStyleMap): Array<{ painted: boolean; colour: string }> {
  const styles = sides((style['border-style'] ?? '').split(/\s+/).filter((s) => s !== ''))
  const widths = sides((style['border-width'] ?? '').split(/\s+/).filter((s) => s !== ''))
  const colours = sides(style['border-color']?.match(COLOUR_FN) ?? [])
  return styles.map((s, i) => ({
    painted: s !== '' && s !== 'none' && s !== 'hidden' && parseFloat(widths[i] ?? '') >= 1,
    colour: colours[i] ?? '',
  }))
}

function borderColourVisible(before: ComputedStyleMap, after: ComputedStyleMap, adj: RGBA): boolean {
  const was = borderSides(before)
  return borderSides(after).some((side, i) => side.painted && colourShiftVisible(was[i]?.colour, side.colour, adj))
}

/**
 * (c) a painted border, the background or the text colour changed, and before/after differ by 3:1 once
 * blended over the adjacent background. A border-color change counts only where a border is painted:
 * `border-color` defaults to `currentColor`, so it moves with the text colour even with no border.
 */
export function hasVisibleColorChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const adj = adjacentBackground(after)
  if (!adj) return false
  return (
    colourShiftVisible(before['background-color'], after['background-color'], adj) ||
    colourShiftVisible(before['color'], after['color'], adj) ||
    borderColourVisible(before, after, adj)
  )
}

/** The decoration line and style. Older captures stored one `line style colour` string: its colour is dropped. */
function decoration(style: ComputedStyleMap): { line: string; style: string } | undefined {
  const line = style['text-decoration-line']
  if (line !== undefined) return { line, style: style['text-decoration-style'] ?? '' }
  const m = /^(.*?)\s+(solid|double|dotted|dashed|wavy)(?:\s|$)/.exec(style['text-decoration'] ?? '')
  return m ? { line: m[1] ?? '', style: m[2] ?? '' } : undefined
}

/**
 * (d) the text-decoration line or style changed (for example an underline appeared). Colour and thickness
 * are not compared: the colour is `currentColor` by default, so any text-colour change would pass.
 */
export function hasTextDecorationChange(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  const b = decoration(before)
  const a = decoration(after)
  return b !== undefined && a !== undefined && (b.line !== a.line || b.style !== a.style)
}
export function hasVisibleIndicator(before: ComputedStyleMap, after: ComputedStyleMap): boolean {
  return (
    hasVisibleOutline(before, after) ||
    hasVisibleBoxShadow(before, after) ||
    hasVisibleColorChange(before, after) ||
    hasTextDecorationChange(before, after)
  )
}

/** Focus sits on a frame or closed-shadow host: its inner focus ring cannot be read from here, so it is a manual check. */
export function isInnerFocusUnreadable(raw: RawAudit, step: TabStep): boolean {
  if (step.innerFocusUnreadable === true) return true
  const tag = raw.domNodes[step.backendDOMNodeId]?.tag
  return tag === 'iframe' || tag === 'frame'
}

/** Detector 6: a tabbed element with no visible focus indicator. One per element (its first readable step). */
export function detectInvisibleWanderer(raw: RawAudit): UnclassifiedHaunting[] {
  const out: UnclassifiedHaunting[] = []
  const seen = new Set<number>()
  for (const step of raw.tabWalkResult.steps) {
    const id = step.backendDOMNodeId === '' ? NaN : Number(step.backendDOMNodeId)
    if (step.cdpError || !Number.isInteger(id) || id <= 0 || seen.has(id) || isInnerFocusUnreadable(raw, step)) continue
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
