import type { ClassifiedAudit, Haunting, HauntingFix, HauntingSeverity, HauntingType, RawAudit } from '@the-unseen/core'

export type ToolHaunting = {
  id: string
  type: HauntingType
  severity: HauntingSeverity
  wcag: { id: string; url: string }[]
  selector: string
  htmlSnippet: string
  fix: HauntingFix
}

export type FullClassified = Omit<ClassifiedAudit, 'raw'> & { raw: Omit<RawAudit, 'screenshotPng'> }

export type AuditToolResult = {
  url: string
  score: number
  countsByType: Record<HauntingType, number>
  detectedCountsByType: Record<HauntingType, number>
  hauntings: ToolHaunting[]
  truncated: boolean
  needsManualCheckCount: number
  automatedCoverageNote: string
  summary: string
  classified?: FullClassified
}

export type ErrorCode =
  | 'SSRF_BLOCKED'
  | 'TIMEOUT'
  | 'NOT_HTML'
  | 'RESOURCE_LIMIT'
  | 'INVALID_INPUT'
  | 'UNKNOWN_HAUNTING_ID'
  | 'AUDIT_FAILED'

export const ERROR_CODES: readonly ErrorCode[] = [
  'SSRF_BLOCKED',
  'TIMEOUT',
  'NOT_HTML',
  'RESOURCE_LIMIT',
  'INVALID_INPUT',
  'UNKNOWN_HAUNTING_ID',
  'AUDIT_FAILED',
]

export type ToolError = { code: ErrorCode; message: string }

export type HauntingLike = Pick<Haunting, 'type' | 'severity'>
