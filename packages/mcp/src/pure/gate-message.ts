import type { ToolHaunting } from './result-types.js'
import { DISPLAY_NAME } from './summary.js'

export const MAX_GATE_HAUNTINGS = 5
export const MAX_GATE_MESSAGE_CHARS = 3000

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

function entry(h: ToolHaunting): string {
  return [
    `- ${DISPLAY_NAME[h.type]} (${h.severity}) at ${clip(h.selector, 120)}`,
    `  html: ${clip(h.htmlSnippet.replace(/\s+/g, ' '), 160)}`,
    `  fix: ${clip(h.fix.instruction.replace(/\s+/g, ' '), 220)}`,
  ].join('\n')
}

export function reportSentence(before: number | null): string {
  const beforePart = before === null ? 'the before score' : `the before score ${before}`
  return `Fix the source, call audit_url (or audit_html) on the same page, and report ${beforePart} and the new score before finishing.`
}

/** The instruction written to stderr when the gate blocks. Under 3,000 characters, at most 5 hauntings, ends with the report sentence. */
export function gateMessage(
  target: string,
  score: number,
  before: number | null,
  critical: readonly ToolHaunting[],
  totalCritical: number
): string {
  const shown = critical.slice(0, MAX_GATE_HAUNTINGS)
  const head = `THE UNSEEN gate: ${totalCritical} critical haunting${totalCritical === 1 ? ' remains' : 's remain'} in ${clip(target, 120)} (score ${score}). You touched a haunted page; the ghost stays your problem.`
  const more = totalCritical > shown.length ? `\n+${totalCritical - shown.length} more not listed.` : ''
  const tail = `\n${reportSentence(before)}`
  const budget = MAX_GATE_MESSAGE_CHARS - head.length - more.length - tail.length - 2
  const lines: string[] = []
  let used = 0
  for (const h of shown) {
    const text = entry(h)
    if (used + text.length + 1 > budget) break
    lines.push(text)
    used += text.length + 1
  }
  return `${head}\n${lines.join('\n')}${more}${tail}`
}
