import type { Haunting, HauntingType, WCAGCriterion } from '@the-unseen/core'
import { hauntingDisplayName } from './haunting-display'

/**
 * Persona lines used only when a haunting carries none. Each says who is affected and what they
 * experience; none claims anything about conformance.
 */
export const FALLBACK_PERSONAS: Record<HauntingType, string> = {
  NamelessSpirit: 'As a screen-reader user, I cannot tell what this control does.',
  HollowPortrait: 'As a screen-reader user, I cannot see this image and have no description of it.',
  TheFog: 'As a low-vision user, I strain to read this text.',
  LostSoul: 'As a keyboard user, I cannot reach or activate this control with the Tab key.',
  CursedLoop: 'As a keyboard user, I am trapped and cannot move on to the rest of the page.',
  InvisibleWanderer: 'As a keyboard user, I cannot see where focus is on this control.',
  WhisperingField: 'As a screen-reader user, I do not know what this field is for.',
  SilentTongue: 'As a screen-reader user, I hear text read with the wrong pronunciation.',
  ShatteredOrder: 'As a screen-reader user, I cannot navigate this page by its structure.',
  TheVeiled: 'As a screen-reader user, I do not know this content exists.',
}

/** The persona line of a haunting: the classifier's own line, else the per-type fallback. */
export function personaLine(haunting: Haunting): string {
  const own = haunting.persona.trim()
  return own === '' ? FALLBACK_PERSONAS[haunting.type] : own
}

export type CriterionEntry = {
  criterion: WCAGCriterion
  role: 'primary' | 'supporting' | 'guidance'
}

/**
 * Criteria in display order: the primary criterion first, then supporting criteria in their
 * original order, then the guidance criterion (Invisible Wanderer) when present. A criterion id
 * appears once, at its first position.
 */
export function criterionEntries(haunting: Haunting): CriterionEntry[] {
  const entries: CriterionEntry[] = []
  const seen = new Set<string>()
  haunting.wcag.forEach((criterion, index) => {
    if (seen.has(criterion.id)) return
    seen.add(criterion.id)
    entries.push({ criterion, role: index === 0 ? 'primary' : 'supporting' })
  })
  if (haunting.guidance !== undefined && !seen.has(haunting.guidance.id)) {
    entries.push({ criterion: haunting.guidance, role: 'guidance' })
  }
  return entries
}

const ROLE_LABELS: Record<CriterionEntry['role'], string> = {
  primary: 'Primary',
  supporting: 'Also relevant',
  guidance: 'Guidance only',
}

export function criterionRoleLabel(role: CriterionEntry['role']): string {
  return ROLE_LABELS[role]
}

/** Visible link text of a criterion, for example "4.1.2 Name, Role, Value (Level A)". */
export function criterionLinkText(criterion: WCAGCriterion): string {
  return `${criterion.id} ${criterion.title} (Level ${criterion.level})`
}

/** Only absolute https links to w3.org are rendered as links; anything else is shown as text. */
export function isSafeCriterionUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'www.w3.org' || parsed.hostname === 'w3.org')
  } catch {
    return false
  }
}

/** Secondary hauntings, each listed once by id, in the order the classifier gave them. */
export function relatedIssues(haunting: Haunting): Haunting[] {
  const seen = new Set<string>([haunting.id])
  const related: Haunting[] = []
  for (const candidate of haunting.secondary) {
    if (seen.has(candidate.id)) continue
    seen.add(candidate.id)
    related.push(candidate)
  }
  return related
}

/** Code fences must outlast any run of backticks inside the content. */
function fenceFor(content: string): string {
  const longest = (content.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

function fencedBlock(content: string): string {
  const fence = fenceFor(content)
  return `${fence}html\n${content}\n${fence}`
}

/**
 * The text copied by "Copy as Kiro prompt" (requirement 16.7): a fix request that names the
 * issue, the element, the criteria and the suggested change. It asks for a source-code fix, never a
 * runtime patch, and makes no claim about conformance.
 */
export function buildKiroPrompt(haunting: Haunting, element: string, auditedUrl: string): string {
  const name = hauntingDisplayName(haunting.type)
  const criteria = criterionEntries(haunting)
    .map((entry) => `- ${criterionLinkText(entry.criterion)}${entry.role === 'guidance' ? ' (guidance only)' : ''}`)
    .join('\n')
  const lines = [
    `Fix this accessibility issue in the source code: ${name} (${haunting.severity}).`,
    '',
    `Page: ${auditedUrl}`,
    `Element: ${element}`,
    '',
    `Problem: ${haunting.explanation}`,
    `Who is affected: ${personaLine(haunting)}`,
    '',
    'WCAG 2.2 criteria:',
    criteria === '' ? '- none listed' : criteria,
    '',
    'Offending HTML:',
    fencedBlock(haunting.htmlSnippet),
    '',
    `Suggested fix: ${haunting.fix.instruction}`,
    '',
    'Example markup:',
    fencedBlock(haunting.fix.codeSnippet),
    '',
    'Change the source files (not a runtime patch or overlay), then re-run THE UNSEEN to check the result. Automated checks cover only part of WCAG, so verify the change by hand as well.',
  ]
  return lines.join('\n')
}
