import type { HauntingType, WCAGCriterion } from './types.js'

const BASE = 'https://www.w3.org/WAI/WCAG22/Understanding/'

export const WCAG_1_1_1: WCAGCriterion = { id: '1.1.1', level: 'A', title: 'Non-text Content', url: `${BASE}non-text-content` }
export const WCAG_1_3_1: WCAGCriterion = { id: '1.3.1', level: 'A', title: 'Info and Relationships', url: `${BASE}info-and-relationships` }
export const WCAG_1_4_3: WCAGCriterion = { id: '1.4.3', level: 'AA', title: 'Contrast (Minimum)', url: `${BASE}contrast-minimum` }
export const WCAG_2_1_1: WCAGCriterion = { id: '2.1.1', level: 'A', title: 'Keyboard', url: `${BASE}keyboard` }
export const WCAG_2_1_2: WCAGCriterion = { id: '2.1.2', level: 'A', title: 'No Keyboard Trap', url: `${BASE}no-keyboard-trap` }
export const WCAG_2_4_4: WCAGCriterion = { id: '2.4.4', level: 'A', title: 'Link Purpose (In Context)', url: `${BASE}link-purpose-in-context` }
export const WCAG_2_4_6: WCAGCriterion = { id: '2.4.6', level: 'AA', title: 'Headings and Labels', url: `${BASE}headings-and-labels` }
export const WCAG_2_4_7: WCAGCriterion = { id: '2.4.7', level: 'AA', title: 'Focus Visible', url: `${BASE}focus-visible` }
export const WCAG_2_4_13: WCAGCriterion = { id: '2.4.13', level: 'AAA', title: 'Focus Appearance', url: `${BASE}focus-appearance` }
export const WCAG_3_1_1: WCAGCriterion = { id: '3.1.1', level: 'A', title: 'Language of Page', url: `${BASE}language-of-page` }
export const WCAG_3_3_2: WCAGCriterion = { id: '3.3.2', level: 'A', title: 'Labels or Instructions', url: `${BASE}labels-or-instructions` }
export const WCAG_4_1_2: WCAGCriterion = { id: '4.1.2', level: 'A', title: 'Name, Role, Value', url: `${BASE}name-role-value` }

/**
 * The full criteria list per haunting type, primary first (hauntings.md). Detectors read it, so MCP and the
 * web app quote the same table. Nameless Spirit lists all three; a detector keeps the ones that apply to the node.
 * Invisible Wanderer lists 2.4.7 only; 2.4.13 is guidance (`Haunting.guidance`), never a requirement.
 */
export const WCAG_BY_TYPE: Readonly<Record<HauntingType, readonly WCAGCriterion[]>> = {
  NamelessSpirit: [WCAG_4_1_2, WCAG_2_4_4, WCAG_1_1_1],
  HollowPortrait: [WCAG_1_1_1],
  TheFog: [WCAG_1_4_3],
  LostSoul: [WCAG_2_1_1, WCAG_4_1_2],
  CursedLoop: [WCAG_2_1_2],
  InvisibleWanderer: [WCAG_2_4_7],
  WhisperingField: [WCAG_1_3_1, WCAG_3_3_2, WCAG_4_1_2],
  SilentTongue: [WCAG_3_1_1],
  ShatteredOrder: [WCAG_1_3_1, WCAG_2_4_6],
  TheVeiled: [WCAG_1_3_1, WCAG_4_1_2],
}

/** Sound cue names carried on hauntings. Only these two types have one. */
export const SOUND_CUE_BY_TYPE: Readonly<Partial<Record<HauntingType, string>>> = {
  CursedLoop: 'chime',
  SilentTongue: 'garbled-whisper',
}

export const ALL_WCAG: readonly WCAGCriterion[] = [
  WCAG_1_1_1,
  WCAG_1_3_1,
  WCAG_1_4_3,
  WCAG_2_1_1,
  WCAG_2_1_2,
  WCAG_2_4_4,
  WCAG_2_4_6,
  WCAG_2_4_7,
  WCAG_2_4_13,
  WCAG_3_1_1,
  WCAG_3_3_2,
  WCAG_4_1_2,
]
