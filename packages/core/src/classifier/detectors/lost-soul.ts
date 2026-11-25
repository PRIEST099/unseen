import type { RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_BY_TYPE } from '../wcag.js'
import {
  axAncestors,
  axByBackendId,
  axDescendants,
  axRole,
  domAncestors,
  domDescendants,
  filterOutermost,
  findBox,
  hauntingId,
  isNativeInteractive,
  snippet,
} from '../util.js'

export const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
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
  'textbox',
  'searchbox',
  'spinbutton',
  'slider',
])

const CLICK_EVENTS: ReadonlySet<string> = new Set(['click', 'mousedown', 'pointerdown', 'pointerup'])

function hasInteractiveRole(raw: RawAudit, id: number): boolean {
  const attrRole = raw.domNodes[String(id)]?.attrs.role
  if (attrRole !== undefined && INTERACTIVE_ROLES.has(attrRole)) return true
  const ax = axByBackendId(raw, id)
  return ax !== undefined && INTERACTIVE_ROLES.has(axRole(ax))
}

/** The element sits inside, or contains, a native interactive element (Req 5.7: AX tree plus DOM ancestry). */
function touchesNativeInteractive(raw: RawAudit, id: number): boolean {
  const related = [
    ...domAncestors(raw, id),
    ...domDescendants(raw, id),
    ...axAncestors(raw, id).map((n) => n.backendDOMNodeId),
    ...axDescendants(raw, id).map((n) => n.backendDOMNodeId),
  ]
  return related.some((r) => r > 0 && isNativeInteractive(raw, r))
}

function qualifies(raw: RawAudit, id: number, tabbed: ReadonlySet<number>): boolean {
  if (tabbed.has(id) || isNativeInteractive(raw, id) || hasInteractiveRole(raw, id)) return false
  return !touchesNativeInteractive(raw, id)
}

/** Detector 4: a click handler on an element the Tab walk never reaches and that is not natively interactive. */
export function detectLostSoul(raw: RawAudit): UnclassifiedHaunting[] {
  const tabbed = new Set(raw.tabWalkResult.steps.map((s) => Number(s.backendDOMNodeId)))
  const candidates = raw.eventListenerSignals
    .filter((s) => s.backendDOMNodeId > 0 && s.eventTypes.some((t) => CLICK_EVENTS.has(t)))
    .map((s) => s.backendDOMNodeId)
  const unique = [...new Set(candidates)].filter((id) => qualifies(raw, id, tabbed))
  return filterOutermost(raw, unique).map((id) => ({
    id: hauntingId('LostSoul', id),
    type: 'LostSoul',
    wcag: [...WCAG_BY_TYPE.LostSoul],
    nodeIds: [id],
    box: findBox(raw.boundingBoxes, id),
    speech: undefined,
    htmlSnippet: snippet(raw, id),
    explanation: generateExplanation('LostSoul'),
    persona: generatePersona('LostSoul'),
    fix: generateFix('LostSoul'),
  }))
}
