import type { DomAxMapping, RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_BY_TYPE } from '../wcag.js'
import { axByBackendId, axName, axRole, domAncestors, findBox, hauntingId, snippet } from '../util.js'

const HIDDEN_REASONS = new Set(['ariaHiddenElement', 'presentationalRole'])

/** The element itself carries aria-hidden="true" or role presentation/none (or the AX tree says so). */
function isHiddenRoot(raw: RawAudit, m: DomAxMapping): boolean {
  const attrs = raw.domNodes[String(m.backendDOMNodeId)]?.attrs
  if (attrs?.['aria-hidden'] === 'true' || attrs?.role === 'presentation' || attrs?.role === 'none') return true
  const ax = axByBackendId(raw, m.backendDOMNodeId)
  return ax?.ignoredReasons.some((r) => HIDDEN_REASONS.has(r.name)) ?? false
}

/** Content below `rootId` that the AX tree still exposes (named text, an image, or a control). */
function exposedBelow(raw: RawAudit, rootId: number): boolean {
  return raw.axNodes.some((n) => {
    if (n.ignored || n.backendDOMNodeId <= 0 || n.backendDOMNodeId === rootId) return false
    if (axName(n) === '' && axRole(n) !== 'image') return false
    return domAncestors(raw, n.backendDOMNodeId).includes(rootId)
  })
}

function hasContent(m: DomAxMapping): boolean {
  return m.hasVisibleText || m.containsFocusable || m.isFocusable
}

function isCandidate(raw: RawAudit, m: DomAxMapping): boolean {
  if (!(m.ariaHidden || m.isPresentational) || m.hasAxNode || !hasContent(m)) return false
  if (!isHiddenRoot(raw, m)) return false
  // role="presentation" removes only the element's own role; its text and controls stay exposed.
  return m.ariaHidden || !exposedBelow(raw, m.backendDOMNodeId)
}

/** Detector 10: one instance per hidden subtree root with visible text or a focusable element inside. */
export function detectTheVeiled(raw: RawAudit): UnclassifiedHaunting[] {
  const rows = raw.domAxMapping.filter((m) => m.backendDOMNodeId > 0)
  const candidates = rows.filter((m) => isCandidate(raw, m))
  const candidateIds = new Set(candidates.map((m) => m.backendDOMNodeId))
  const roots = candidates.filter((m) => !domAncestors(raw, m.backendDOMNodeId).some((a) => candidateIds.has(a)))
  return roots.map((m) => {
    const focusable = rows
      .filter((d) => d.isFocusable && d.backendDOMNodeId !== m.backendDOMNodeId)
      .filter((d) => domAncestors(raw, d.backendDOMNodeId).includes(m.backendDOMNodeId))
      .map((d) => d.backendDOMNodeId)
    return {
      id: hauntingId('TheVeiled', m.backendDOMNodeId),
      type: 'TheVeiled' as const,
      wcag: [...WCAG_BY_TYPE.TheVeiled],
      nodeIds: [m.backendDOMNodeId, ...focusable],
      box: findBox(raw.boundingBoxes, m.backendDOMNodeId),
      speech: undefined,
      htmlSnippet: snippet(raw, m.backendDOMNodeId),
      explanation: generateExplanation('TheVeiled', { focusable: m.isFocusable || m.containsFocusable }),
      persona: generatePersona('TheVeiled'),
      fix: generateFix('TheVeiled', { focusable: m.isFocusable || m.containsFocusable }),
    }
  })
}
