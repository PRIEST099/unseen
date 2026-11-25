import type { RawAudit } from '../../types.js'
import { generateExplanation, generateFix, generatePersona } from '../explanation.js'
import type { UnclassifiedHaunting } from '../types.js'
import { SOUND_CUE_BY_TYPE, WCAG_BY_TYPE } from '../wcag.js'
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
      wcag: [...WCAG_BY_TYPE.CursedLoop],
      nodeIds,
      box: findBox(raw.boundingBoxes, region),
      speech: undefined,
      soundCue: SOUND_CUE_BY_TYPE.CursedLoop,
      htmlSnippet: snippet(raw, region),
      explanation: generateExplanation('CursedLoop', { trapSize: nodeIds.length - 1 }),
      persona: generatePersona('CursedLoop'),
      fix: generateFix('CursedLoop'),
    },
  ]
}
