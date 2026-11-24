import type { RawAudit } from '../types.js'
import { crossCheckAxe } from './axe-cross-check.js'
import { detectCursedLoop } from './detectors/cursed-loop.js'
import { detectTheFog } from './detectors/fog.js'
import { detectHollowPortrait } from './detectors/hollow-portrait.js'
import { detectInvisibleWanderer, isInnerFocusUnreadable } from './detectors/invisible-wanderer.js'
import { detectLostSoul } from './detectors/lost-soul.js'
import { detectNamelessSpirit } from './detectors/nameless-spirit.js'
import { detectShatteredOrder } from './detectors/shattered-order.js'
import { detectSilentTongue } from './detectors/silent-tongue.js'
import { detectTheVeiled } from './detectors/veiled.js'
import { detectWhisperingField } from './detectors/whispering-field.js'
import { resolvePrecedence } from './precedence.js'
import { computeScore } from './score.js'
import { assignSeverity } from './severity.js'
import type { PrimaryHaunting } from './severity.js'
import { AUTOMATED_COVERAGE_NOTE } from './types.js'
import type {
  ClassifiedAudit,
  DetectorFunction,
  Haunting,
  HauntingType,
  ManualCheckNode,
  UnclassifiedHaunting,
} from './types.js'
import { snippet } from './util.js'

export const DETECTORS: readonly DetectorFunction[] = [
  detectNamelessSpirit,
  detectHollowPortrait,
  detectTheFog,
  detectLostSoul,
  detectCursedLoop,
  detectInvisibleWanderer,
  detectWhisperingField,
  detectSilentTongue,
  detectShatteredOrder,
  detectTheVeiled,
]

function zeroCounts(): Record<HauntingType, number> {
  return {
    NamelessSpirit: 0,
    HollowPortrait: 0,
    TheFog: 0,
    LostSoul: 0,
    CursedLoop: 0,
    InvisibleWanderer: 0,
    WhisperingField: 0,
    SilentTongue: 0,
    ShatteredOrder: 0,
    TheVeiled: 0,
  }
}

/** A detector that fails on malformed data contributes nothing; the others still run. */
function runDetector(detector: DetectorFunction, raw: RawAudit): UnclassifiedHaunting[] {
  try {
    return detector(raw)
  } catch {
    return []
  }
}

/** Per type, the number of distinct elements (nodeIds[0], plus the kind) across primaries and their secondaries. */
function detectedCounts(hauntings: readonly Haunting[]): Record<HauntingType, number> {
  const seen = new Map<HauntingType, Set<string>>()
  for (const h of hauntings.flatMap((p) => [p, ...p.secondary])) {
    const keys = seen.get(h.type) ?? new Set<string>()
    keys.add(`${h.nodeIds[0] ?? ''}|${h.kind ?? ''}`)
    seen.set(h.type, keys)
  }
  const counts = zeroCounts()
  for (const [type, keys] of seen) counts[type] = keys.size
  return counts
}

function primaryCounts(hauntings: readonly Haunting[]): Record<HauntingType, number> {
  const counts = zeroCounts()
  for (const h of hauntings) counts[h.type] += 1
  return counts
}

function contrastChecks(raw: RawAudit): ManualCheckNode[] {
  const out: ManualCheckNode[] = []
  for (const [key, style] of Object.entries(raw.textNodeStyles)) {
    const id = Number(key)
    if (style.backgroundUncertain && Number.isInteger(id)) {
      out.push({ backendDOMNodeId: id, reason: 'contrast-uncertain', htmlSnippet: snippet(raw, id) })
    }
  }
  return out
}

/** Tab steps whose focus styles could not be read: a CDP failure, or focus on a frame or host whose inside is out of reach. */
function focusChecks(raw: RawAudit): ManualCheckNode[] {
  const out: ManualCheckNode[] = []
  const listedHosts = new Set<number>()
  for (const step of raw.tabWalkResult.steps) {
    const id = step.backendDOMNodeId === '' ? NaN : Number(step.backendDOMNodeId)
    const known = Number.isInteger(id) && id > 0
    const unreadable = known && !step.cdpError && isInnerFocusUnreadable(raw, step)
    if (!unreadable && !step.cdpError && known) continue
    if (unreadable) {
      if (listedHosts.has(id)) continue
      listedHosts.add(id)
    }
    out.push({
      backendDOMNodeId: known ? id : 0,
      reason: 'focus-style-unavailable',
      htmlSnippet: known ? snippet(raw, id) : '',
    })
  }
  return out
}

/** Uncertain-contrast text, plus Tab steps whose focus styles could not be read. */
function manualChecks(raw: RawAudit): ManualCheckNode[] {
  return [...contrastChecks(raw), ...focusChecks(raw)]
}
function emptyAudit(raw: RawAudit): ClassifiedAudit {
  return {
    hauntings: [],
    score: 0,
    countsByType: zeroCounts(),
    detectedCountsByType: zeroCounts(),
    needsManualCheck: [],
    automatedCoverageNote: AUTOMATED_COVERAGE_NOTE,
    axeCrossCheck: { hauntingToAxe: {}, unmapped: [] },
    raw,
  }
}

function run(raw: RawAudit): ClassifiedAudit {
  const detected = DETECTORS.flatMap((d) => runDetector(d, raw))
  const primaries: PrimaryHaunting[] = resolvePrecedence(detected).map((p) => ({ ...p, isPrimary: true }))
  const hauntings = assignSeverity(primaries, raw)
  return {
    hauntings,
    score: computeScore(hauntings),
    countsByType: primaryCounts(hauntings),
    detectedCountsByType: detectedCounts(hauntings),
    needsManualCheck: manualChecks(raw),
    automatedCoverageNote: AUTOMATED_COVERAGE_NOTE,
    axeCrossCheck: crossCheckAxe(hauntings, raw),
    raw,
  }
}

/** Classify a RawAudit: detect, resolve precedence, assign severity, score, cross-check. Pure and total. */
export function classify(raw: RawAudit): ClassifiedAudit {
  try {
    return run(raw)
  } catch {
    return emptyAudit(raw)
  }
}
