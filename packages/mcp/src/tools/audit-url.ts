import { auditAndClassify } from '@the-unseen/core'
import type { ClassifiedAudit } from '@the-unseen/core'
import type { Session } from '../session.js'
import { toAuditResult } from '../pure/summary.js'
import type { AuditToolResult } from '../pure/result-types.js'
import { auditUrlInput } from '../types.js'

export type UrlAuditor = (url: string) => Promise<ClassifiedAudit>

/** Local server, so private and localhost URLs are allowed (security.md, "Local MCP server exemptions"). */
export const defaultUrlAuditor: UrlAuditor = (url) => auditAndClassify(url, { allowPrivate: true })

export async function auditUrlTool(
  args: unknown,
  session: Session,
  audit: UrlAuditor = defaultUrlAuditor
): Promise<AuditToolResult> {
  const input = auditUrlInput.parse(args)
  const classified = await audit(input.url)
  session.record(classified)
  return toAuditResult(input.url, classified, input.page === 'full')
}
