import type { RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { UnclassifiedHaunting } from '../types.js'
import { WCAG_2_1_2 } from '../wcag.js'
import { findBox, hauntingId, snippet } from '../util.js'

/**
 * Detector 5: at most one keyboard trap. It needs `trapDetected` and a cycle that is not escapable and does
 * not include every focusable. The haunting covers the trap region (first) and the cycle members.
 */
export function detectCursedLoop(raw: RawAudit): UnclassifiedHaunting[] {
  const walk = raw.tabWalkResult
  if (!walk.trapDetected) return []
  if (!walk.cycles.some((c) => c.escapable === false && !c.includesAllFocusables)) return []
  const nodeIds = walk.trapRegionNodeIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
  const region = nodeIds[0]
  if (region === undefined) return []
  return [
    {
      id: hauntingId('CursedLoop', region),
      type: 'CursedLoop',
      wcag: [WCAG_2_1_2],
      nodeIds,
      box: findBox(raw.boundingBoxes, region),
      speech: undefined,
      soundCue: 'chime',
      htmlSnippet: snippet(raw, region),
      explanation: generateExplanation('CursedLoop', { trapSize: nodeIds.length - 1 }),
      persona: generatePersona('CursedLoop'),
      fix: generateFix('CursedLoop'),
    },
  ]
}
