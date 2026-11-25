import {
  AuditResourceLimitError,
  AuditTimeoutError,
  HtmlSizeError,
  NonHtmlContentError,
  SsrfBlockedError,
} from '@the-unseen/core'
import type { ErrorCode, ToolError } from './result-types.js'

const MESSAGES: Readonly<Record<ErrorCode, string>> = {
  SSRF_BLOCKED: 'The URL points to a blocked address.',
  TIMEOUT: 'The audit took too long.',
  NOT_HTML: 'The URL did not return HTML.',
  RESOURCE_LIMIT: 'The page exceeded a resource limit.',
  INVALID_INPUT: 'The input is not valid.',
  UNKNOWN_HAUNTING_ID: 'No haunting with that id was found in this session.',
  AUDIT_FAILED: 'The audit failed.',
}

export function errorMessage(code: ErrorCode): string {
  return MESSAGES[code]
}

/** Typed error for input and lookup problems raised by the handlers themselves. */
export class ToolInputError extends Error {
  constructor(
    public readonly code: 'INVALID_INPUT' | 'UNKNOWN_HAUNTING_ID',
    detail: string
  ) {
    super(detail)
    this.name = 'ToolInputError'
  }
}

export function codeFor(error: unknown): ErrorCode {
  if (error instanceof ToolInputError) return error.code
  if (error instanceof SsrfBlockedError) return 'SSRF_BLOCKED'
  if (error instanceof AuditTimeoutError) return 'TIMEOUT'
  if (error instanceof NonHtmlContentError) return 'NOT_HTML'
  if (error instanceof AuditResourceLimitError) return 'RESOURCE_LIMIT'
  if (error instanceof HtmlSizeError) return 'INVALID_INPUT'
  return 'AUDIT_FAILED'
}

/** Total: any thrown value becomes a stable code and a fixed message. The message never echoes the input. */
export function toToolError(error: unknown): ToolError {
  const code = codeFor(error)
  return { code, message: MESSAGES[code] }
}
