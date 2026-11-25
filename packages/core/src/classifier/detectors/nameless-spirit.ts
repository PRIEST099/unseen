import type { AXNode, RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import { announce } from '../speech.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_BY_TYPE } from '../wcag.js'
import { axName, axRole, domDescendants, findBox, hauntingId, snippet } from '../util.js'

export const NAMELESS_ROLES: ReadonlySet<string> = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'checkbox',
  'radio',
  'switch',
  'option',
  'combobox',
  'listbox',
  'treeitem',
  'gridcell',
])

const IMAGE_TAGS = new Set(['img', 'svg', 'picture'])

/** True when the control has descendants, at least one of them an image, and no text of its own. */
function onlyContentIsImage(raw: RawAudit, node: AXNode): boolean {
  const descendants = domDescendants(raw, node.backendDOMNodeId)
  if (!descendants.some((d) => IMAGE_TAGS.has(raw.domNodes[String(d)]?.tag ?? ''))) return false
  const hasText = descendants.some((d) => raw.domNodes[String(d)]?.tag === '#text')
  const axText = raw.axNodes.some(
    (n) => !n.ignored && n.role.value === 'StaticText' && axName(n) !== '' && descendants.includes(n.backendDOMNodeId)
  )
  return !hasText && !axText
}

/** Detector 1: an AX node with an interactive role and an empty accessible name. */
export function detectNamelessSpirit(raw: RawAudit): UnclassifiedHaunting[] {
  const out: UnclassifiedHaunting[] = []
  const seen = new Set<number>()
  for (const node of raw.axNodes) {
    const role = axRole(node)
    const id = node.backendDOMNodeId
    if (node.ignored || id <= 0 || seen.has(id) || !NAMELESS_ROLES.has(role) || axName(node) !== '') continue
    seen.add(id)
    out.push({
      id: hauntingId('NamelessSpirit', id),
      type: 'NamelessSpirit',
      wcag: WCAG_BY_TYPE.NamelessSpirit.filter(
        (c) => c.id === '4.1.2' || (c.id === '2.4.4' && role === 'link') || (c.id === '1.1.1' && onlyContentIsImage(raw, node))
      ),
      nodeIds: [id],
      box: findBox(raw.boundingBoxes, id),
      speech: announce(node, raw),
      htmlSnippet: snippet(raw, id),
      explanation: generateExplanation('NamelessSpirit', { role }),
      persona: generatePersona('NamelessSpirit'),
      fix: generateFix('NamelessSpirit', { role }),
    })
  }
  return out
}
