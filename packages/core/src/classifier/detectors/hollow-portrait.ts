import type { AXNode, RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_1_1_1 } from '../wcag.js'
import { axAncestors, axDescendants, axName, axRole, fileNameFromSrc, findBox, hauntingId, snippet } from '../util.js'

const WRAPPER_ROLES = new Set(['generic', 'none', 'presentation'])
const CONTROL_ROLES = new Set(['button', 'link'])
const isImage = (role: string): boolean => role === 'img' || role === 'image'

/** The nearest AX ancestor that is a real node (not ignored, not a bare wrapper). */
function nearestMeaningfulAncestor(raw: RawAudit, id: number): AXNode | undefined {
  return axAncestors(raw, id).find((a) => !a.ignored && !WRAPPER_ROLES.has(axRole(a)))
}

/** True when the control has no content other than `id`'s own subtree: no other text, no other image. */
function isSoleContent(raw: RawAudit, control: AXNode, id: number): boolean {
  const own = new Set<string>([...axDescendants(raw, id).map((n) => n.nodeId), ...raw.axNodes.filter((n) => n.backendDOMNodeId === id).map((n) => n.nodeId)])
  return !axDescendants(raw, control.backendDOMNodeId).some((n) => {
    if (own.has(n.nodeId) || n.ignored) return false
    const role = axRole(n)
    return (role === 'StaticText' && axName(n) !== '') || isImage(role)
  })
}

/** True when an unnamed image must not be reported as a Hollow Portrait. */
function isExcluded(raw: RawAudit, node: AXNode): boolean {
  const id = node.backendDOMNodeId
  if (raw.imgAltAttributes[String(id)] === '') return true // alt="" is decorative
  const info = raw.domNodes[String(id)]
  const isSvg = info?.tag === 'svg'
  if (info && isSvg && info.attrs.role !== 'img') return true // an inline SVG needs an explicit role="img"
  if (info?.attrs['aria-hidden'] === 'true') return true
  const control = nearestMeaningfulAncestor(raw, id)
  if (!control || !CONTROL_ROLES.has(axRole(control))) return false
  const controlNamed = axName(control) !== ''
  if (isSvg && controlNamed) return true // an icon inside a named control
  return !controlNamed && isSoleContent(raw, control, id) // the control is the Nameless Spirit
}

/** Detector 2: an unnamed image that is not decorative, hidden, or the sole content of an unnamed control. */
export function detectHollowPortrait(raw: RawAudit): UnclassifiedHaunting[] {
  const out: UnclassifiedHaunting[] = []
  const seen = new Set<number>()
  for (const node of raw.axNodes) {
    const id = node.backendDOMNodeId
    if (node.ignored || id <= 0 || seen.has(id) || !isImage(axRole(node)) || axName(node) !== '') continue
    if (isExcluded(raw, node)) continue
    seen.add(id)
    const file = fileNameFromSrc(raw.imgSrcAttributes[String(id)])
    out.push({
      id: hauntingId('HollowPortrait', id),
      type: 'HollowPortrait',
      wcag: [WCAG_1_1_1],
      nodeIds: [id],
      box: findBox(raw.boundingBoxes, id),
      speech: file === null ? 'unlabelled graphic' : `unlabelled graphic, ${file}`,
      htmlSnippet: snippet(raw, id),
      explanation: generateExplanation('HollowPortrait'),
      persona: generatePersona('HollowPortrait'),
      fix: generateFix('HollowPortrait'),
    })
  }
  return out
}
