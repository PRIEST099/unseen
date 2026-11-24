import type { RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_3_1_1 } from '../wcag.js'
import { findBox, hauntingId, snippet } from '../util.js'

export const BCP47_PRIMARY = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/

/** Detector 8: the html element has no lang, or a lang that is not a BCP 47 tag. */
export function detectSilentTongue(raw: RawAudit): UnclassifiedHaunting[] {
  const lang = raw.pageMetadata.htmlLang
  if (lang !== null && lang !== undefined && BCP47_PRIMARY.test(lang)) return []
  const htmlId = raw.pageMetadata.htmlBackendDOMNodeId
  return [
    {
      id: hauntingId('SilentTongue', htmlId),
      type: 'SilentTongue',
      wcag: [WCAG_3_1_1],
      nodeIds: [htmlId],
      box: findBox(raw.boundingBoxes, htmlId),
      speech: undefined,
      soundCue: 'garbled-whisper',
      htmlSnippet: snippet(raw, htmlId),
      explanation: generateExplanation('SilentTongue', { lang }),
      persona: generatePersona('SilentTongue'),
      fix: generateFix('SilentTongue'),
    },
  ]
}
