import type { RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import { announce, announceNote } from '../speech.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_1_3_1, WCAG_3_3_2, WCAG_4_1_2 } from '../wcag.js'
import { axName, axRole, findBox, hauntingId, isPlaceholderSource, snippet, winningNameSource } from '../util.js'

export const FORM_FIELD_ROLES: ReadonlySet<string> = new Set(['textbox', 'searchbox', 'spinbutton', 'slider', 'combobox'])

/** Detector 7: a form field with no accessible name, or named only by its placeholder. */
export function detectWhisperingField(raw: RawAudit): UnclassifiedHaunting[] {
  const out: UnclassifiedHaunting[] = []
  const seen = new Set<number>()
  for (const node of raw.axNodes) {
    const id = node.backendDOMNodeId
    if (node.ignored || id <= 0 || seen.has(id) || !FORM_FIELD_ROLES.has(axRole(node))) continue
    const name = axName(node)
    const fieldCase = name === '' ? 'empty' : isPlaceholderSource(winningNameSource(node)) ? 'placeholder' : undefined
    if (fieldCase === undefined) continue
    seen.add(id)
    const note = announceNote(node)
    out.push({
      id: hauntingId('WhisperingField', id),
      type: 'WhisperingField',
      wcag: [WCAG_1_3_1, WCAG_3_3_2, WCAG_4_1_2],
      nodeIds: [id],
      box: findBox(raw.boundingBoxes, id),
      speech: announce(node, raw),
      ...(note !== undefined ? { speechNote: note } : {}),
      htmlSnippet: snippet(raw, id),
      explanation: generateExplanation('WhisperingField', { fieldCase, placeholder: name }),
      persona: generatePersona('WhisperingField'),
      fix: generateFix('WhisperingField', { fieldCase }),
    })
  }
  return out
}
