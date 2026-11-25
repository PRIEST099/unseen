import { ALL_WCAG, SOUND_CUE_BY_TYPE, WCAG_BY_TYPE, generateExplanation, generateFix, generatePersona } from '@the-unseen/core'
import type { Haunting, HauntingFix, HauntingType, WCAGCriterion } from '@the-unseen/core'
import type { Session } from '../session.js'
import { ToolInputError } from '../pure/errors.js'
import { severityRules } from '../pure/severity-text.js'
import { speechExample } from '../pure/speech-example.js'
import { DISPLAY_NAME } from '../pure/summary.js'
import { explainInput } from '../types.js'

export type Explanation = {
  type: HauntingType
  displayName: string
  explanation: string
  persona: string
  wcag: { id: string; level: string; title: string; url: string }[]
  guidance: { id: string; level: string; title: string; url: string } | null
  severityRules: string
  speechExample: string | null
  speechNote: string | null
  soundCue: string | null
  fix: HauntingFix
  text: string
}

const brief = (c: WCAGCriterion): { id: string; level: string; title: string; url: string } => ({ id: c.id, level: c.level, title: c.title, url: c.url })

function render(e: Omit<Explanation, 'text'>): string {
  const lines = [
    `# ${e.displayName}`,
    e.explanation,
    e.persona,
    `WCAG: ${e.wcag.map((c) => `${c.id} ${c.title} (level ${c.level}) ${c.url}`).join('; ')}`,
    `Severity: ${e.severityRules}`,
  ]
  if (e.guidance) lines.push(`Guidance only: ${e.guidance.id} ${e.guidance.title} (level ${e.guidance.level}) ${e.guidance.url}`)
  if (e.speechExample !== null) lines.push(`A screen reader says: "${e.speechExample}"`)
  if (e.speechNote !== null) lines.push(`Note: ${e.speechNote}`)
  if (e.soundCue !== null) lines.push(`Sound cue: ${e.soundCue}`)
  lines.push(`Fix: ${e.fix.instruction}`)
  return lines.join('\n')
}

function guidanceFor(type: HauntingType): WCAGCriterion | undefined {
  return type === 'InvisibleWanderer' ? ALL_WCAG.find((c) => c.id === '2.4.13') : undefined
}

function byType(type: HauntingType): Explanation {
  const guidance = guidanceFor(type)
  const base = {
    type,
    displayName: DISPLAY_NAME[type],
    explanation: generateExplanation(type),
    persona: generatePersona(type),
    wcag: WCAG_BY_TYPE[type].map(brief),
    guidance: guidance ? brief(guidance) : null,
    severityRules: severityRules(type),
    speechExample: speechExample(type),
    speechNote: null,
    soundCue: SOUND_CUE_BY_TYPE[type] ?? null,
    fix: generateFix(type),
  }
  return { ...base, text: render(base) }
}

/** For an id the haunting's own text is returned unchanged. */
function byHaunting(h: Haunting): Explanation {
  const base = {
    type: h.type,
    displayName: DISPLAY_NAME[h.type],
    explanation: h.explanation,
    persona: h.persona,
    wcag: h.wcag.map(brief),
    guidance: h.guidance ? brief(h.guidance) : null,
    severityRules: `This instance is ${h.severity}. ${severityRules(h.type)}`,
    speechExample: h.speech ?? null,
    speechNote: h.speechNote ?? null,
    soundCue: h.soundCue ?? null,
    fix: h.fix,
  }
  return { ...base, text: render(base) }
}

export function explain(args: unknown, session: Session): Explanation {
  const input = explainInput.parse(args)
  if (input.type !== undefined) return byType(input.type)
  const found = input.id === undefined ? undefined : session.find(input.id)
  if (found === undefined) throw new ToolInputError('UNKNOWN_HAUNTING_ID', 'unknown id')
  return byHaunting(found)
}

export function explainTool(args: unknown, session: Session): Promise<Record<string, unknown>> {
  try {
    return Promise.resolve({ ...explain(args, session) })
  } catch (error: unknown) {
    return Promise.reject(error)
  }
}
