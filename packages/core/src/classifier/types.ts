import type { AxeViolation, BoundingBox, RawAudit } from '../types.js'

export type HauntingType =
  | 'NamelessSpirit'
  | 'HollowPortrait'
  | 'TheFog'
  | 'LostSoul'
  | 'CursedLoop'
  | 'InvisibleWanderer'
  | 'WhisperingField'
  | 'SilentTongue'
  | 'ShatteredOrder'
  | 'TheVeiled'

export const HAUNTING_TYPES: readonly HauntingType[] = [
  'NamelessSpirit',
  'HollowPortrait',
  'TheFog',
  'LostSoul',
  'CursedLoop',
  'InvisibleWanderer',
  'WhisperingField',
  'SilentTongue',
  'ShatteredOrder',
  'TheVeiled',
]

export type HauntingSeverity = 'Wraith' | 'Restless' | 'Banished'

export type ShatteredOrderKind = 'no-h1' | 'heading-skip' | 'no-main'

export type WCAGCriterion = {
  id: string // e.g. "4.1.2"
  level: 'A' | 'AA' | 'AAA'
  title: string
  url: string
}

export type HauntingFix = {
  instruction: string // plain-language fix steps
  codeSnippet: string // HTML/ARIA template
}

export type Haunting = {
  id: string // stable hash of type + backendDOMNodeId + kind
  type: HauntingType
  kind?: string // ShatteredOrder only: "no-h1" | "heading-skip" | "no-main"
  severity: HauntingSeverity
  wcag: WCAGCriterion[] // full criteria list from hauntings.md, primary first
  guidance?: WCAGCriterion // Invisible Wanderer only: 2.4.13 (never 2.4.11)
  nodeIds: number[] // backendDOMNodeIds of the affected elements; never empty
  box: BoundingBox | null // the primary element's box; null when none is recorded
  speech?: string // screen-reader announcement
  speechNote?: string // e.g. "name disappears when typing"
  soundCue?: string // e.g. "garbled-whisper", "chime"; never part of speech
  htmlSnippet: string // at most 300 chars
  explanation: string // what is wrong (1-2 sentences)
  persona: string // who is affected (one sentence starting with "As a")
  fix: HauntingFix
  isPrimary: boolean // true for primary hauntings (scored)
  secondary: Haunting[] // lower-precedence hauntings on colliding nodeIds
}

/** One utterance of the Whisper Walk: what a screen reader says for a visible AX node, in tree order. */
export type SpeechLine = {
  backendDOMNodeId: number // 0 when the AX node has no DOM mapping
  text: string // announce(node, raw)
  note?: string // announceNote(node), e.g. "name disappears when typing"
  box: BoundingBox | null // from raw.boundingBoxes; null when none is recorded
}

export type UnclassifiedHaunting = Omit<Haunting, 'severity' | 'isPrimary' | 'secondary'>

export type ManualCheckNode = {
  backendDOMNodeId: number // 0 when the walk step recorded no element
  reason: 'contrast-uncertain' | 'off-screen-content' | 'focus-style-unavailable'
  htmlSnippet: string
}

export type AxeCrossCheck = {
  hauntingToAxe: Record<string, string[]> // haunting.id -> axe rule ids
  unmapped: AxeViolation[] // axe violations with no corresponding haunting
}

export type ClassifiedAudit = {
  hauntings: Haunting[] // primary hauntings only, each with its secondary array
  score: number // 0-100
  countsByType: Record<HauntingType, number> // primary only (drives the score)
  detectedCountsByType: Record<HauntingType, number> // primary + secondary, one per element
  needsManualCheck: ManualCheckNode[]
  automatedCoverageNote: string
  axeCrossCheck: AxeCrossCheck
  raw: RawAudit
}

export type DetectorFunction = (raw: RawAudit) => UnclassifiedHaunting[]

export const AUTOMATED_COVERAGE_NOTE =
  'Automated checks find approximately 30–40% of WCAG issues. Manual testing is required for complete coverage.'
