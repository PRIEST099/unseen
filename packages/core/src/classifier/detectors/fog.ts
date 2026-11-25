import type { RawAudit } from '../../types.js'
import { contrastRatio } from '../contrast.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_BY_TYPE } from '../wcag.js'
import { axByBackendId, axProp, blend, domAncestors, findBox, hauntingId, parseCssColor, snippet } from '../util.js'

export const NORMAL_TEXT_MIN_RATIO = 4.5
export const LARGE_TEXT_MIN_RATIO = 3

const isDecorativeRole = (role: string | undefined): boolean => role === 'none' || role === 'presentation'

/** Disabled text: the element or an ancestor is disabled (attribute, or AX `disabled` which covers aria-disabled). */
function isDisabled(raw: RawAudit, id: number): boolean {
  return [id, ...domAncestors(raw, id)].some((i) => {
    if (raw.domNodes[String(i)]?.attrs.disabled !== undefined) return true
    const ax = axByBackendId(raw, i)
    return ax !== undefined && axProp(ax, 'disabled') === 'true'
  })
}

function isDecorative(raw: RawAudit, id: number): boolean {
  return isDecorativeRole(raw.domNodes[String(id)]?.attrs.role)
}

/** Detector 3: text whose contrast is below 4.5:1 (3:1 for large text). Uncertain backgrounds are skipped. */
export function detectTheFog(raw: RawAudit): UnclassifiedHaunting[] {
  const out: UnclassifiedHaunting[] = []
  for (const [key, style] of Object.entries(raw.textNodeStyles)) {
    const id = Number(key)
    if (!Number.isInteger(id) || id <= 0 || style.backgroundUncertain) continue
    const bg = parseCssColor(style.backgroundColor)
    const fgRaw = parseCssColor(style.color)
    if (!bg || !fgRaw || bg.a < 1) continue
    if (isDisabled(raw, id) || isDecorative(raw, id)) continue
    const ratio = contrastRatio(blend(fgRaw, bg), bg)
    const threshold = style.isLargeText ? LARGE_TEXT_MIN_RATIO : NORMAL_TEXT_MIN_RATIO
    if (ratio >= threshold) continue
    out.push({
      id: hauntingId('TheFog', id),
      type: 'TheFog',
      wcag: [...WCAG_BY_TYPE.TheFog],
      nodeIds: [id],
      box: findBox(raw.boundingBoxes, id),
      speech: undefined,
      htmlSnippet: snippet(raw, id),
      explanation: generateExplanation('TheFog', { ratio, threshold }),
      persona: generatePersona('TheFog'),
      fix: generateFix('TheFog', { ratio, threshold }),
    })
  }
  return out
}
