import type { ClassifiedAudit, Haunting, HauntingSeverity, HauntingType } from '@the-unseen/core'
import { selectorFor } from './selector.js'
import type { AuditToolResult, ToolHaunting } from './result-types.js'

export const MAX_TOP_HAUNTINGS = 10

const SEVERITY_RANK: Readonly<Record<HauntingSeverity, number>> = { Wraith: 0, Restless: 1, Banished: 2 }
const SEVERITY_SYMBOL: Readonly<Record<HauntingSeverity, string>> = { Wraith: '👻', Restless: '🌫️', Banished: '💀' }

/** Precedence order from hauntings.md; the two page-level types come last. */
const TYPE_RANK: Readonly<Record<HauntingType, number>> = {
  CursedLoop: 0,
  NamelessSpirit: 1,
  WhisperingField: 2,
  LostSoul: 3,
  HollowPortrait: 4,
  TheVeiled: 5,
  InvisibleWanderer: 6,
  TheFog: 7,
  ShatteredOrder: 8,
  SilentTongue: 9,
}

export const DISPLAY_NAME: Readonly<Record<HauntingType, string>> = {
  NamelessSpirit: 'Nameless Spirit',
  HollowPortrait: 'Hollow Portrait',
  TheFog: 'The Fog',
  LostSoul: 'Lost Soul',
  CursedLoop: 'Cursed Loop',
  InvisibleWanderer: 'Invisible Wanderer',
  WhisperingField: 'Whispering Field',
  SilentTongue: 'Silent Tongue',
  ShatteredOrder: 'Shattered Order',
  TheVeiled: 'The Veiled',
}

/** Severity, then precedence, then the original (DOM) order. Stable and total. */
export function orderHauntings<T extends { severity: HauntingSeverity; type: HauntingType }>(hauntings: readonly T[]): T[] {
  return hauntings
    .map((h, index) => ({ h, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.h.severity] - SEVERITY_RANK[b.h.severity] ||
        TYPE_RANK[a.h.type] - TYPE_RANK[b.h.type] ||
        a.index - b.index
    )
    .map((x) => x.h)
}

function toToolHaunting(h: Haunting, raw: ClassifiedAudit['raw']): ToolHaunting {
  return {
    id: h.id,
    type: h.type,
    severity: h.severity,
    wcag: h.wcag.map((c) => ({ id: c.id, url: c.url })),
    selector: selectorFor(h, raw),
    htmlSnippet: h.htmlSnippet,
    fix: h.fix,
  }
}

function hauntingBlock(h: ToolHaunting): string {
  return [
    `## ${SEVERITY_SYMBOL[h.severity]} ${h.severity}: ${DISPLAY_NAME[h.type]}`,
    `- selector: \`${h.selector}\``,
    `- html: \`${h.htmlSnippet.replace(/`/g, "'")}\``,
    `- fix: ${h.fix.instruction}`,
    '',
  ].join('\n')
}

function countLine(hauntings: readonly Haunting[]): string {
  const n = (s: HauntingSeverity): number => hauntings.filter((h) => h.severity === s).length
  return `Hauntings: ${hauntings.length} (Wraith ${n('Wraith')}, Restless ${n('Restless')}, Banished ${n('Banished')}).`
}

/** Deterministic Markdown for an agent. No clock, no durations, no compliance claims. */
export function buildSummary(url: string, classified: ClassifiedAudit, top: readonly ToolHaunting[], truncated: boolean): string {
  const lines = [
    `# THE UNSEEN audit: ${url}`,
    `Haunting score: ${classified.score}/100 (lower is better). ${countLine(classified.hauntings)}`,
    '',
    ...top.map(hauntingBlock),
  ]
  if (truncated) lines.push(`+${classified.hauntings.length - top.length} more hauntings not listed.`, '')
  lines.push(classified.automatedCoverageNote)
  lines.push('Fix the source, then call audit_url again and report the before/after score.')
  return lines.join('\n')
}

/** Map a classified audit to the tool result. The screenshot is never included. */
export function toAuditResult(url: string, classified: ClassifiedAudit, full: boolean): AuditToolResult {
  const ordered = orderHauntings(classified.hauntings)
  const top = ordered.slice(0, MAX_TOP_HAUNTINGS).map((h) => toToolHaunting(h, classified.raw))
  const truncated = ordered.length > MAX_TOP_HAUNTINGS
  const result: AuditToolResult = {
    url,
    score: classified.score,
    countsByType: classified.countsByType,
    detectedCountsByType: classified.detectedCountsByType,
    hauntings: top,
    truncated,
    needsManualCheckCount: classified.needsManualCheck.length,
    automatedCoverageNote: classified.automatedCoverageNote,
    summary: buildSummary(url, classified, top, truncated),
  }
  if (full) {
    const { screenshotPng: _omitted, ...rawWithoutScreenshot } = classified.raw
    result.classified = { ...classified, raw: rawWithoutScreenshot }
  }
  return result
}
