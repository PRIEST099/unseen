import { auditHtmlAndClassify } from '@the-unseen/core'
import type { ClassifiedAudit } from '@the-unseen/core'
import type { Session } from '../session.js'
import { toAuditResult } from '../pure/summary.js'
import type { AuditToolResult } from '../pure/result-types.js'
import { auditHtmlInput } from '../types.js'

export type HtmlAuditor = (html: string) => Promise<ClassifiedAudit>

export const defaultHtmlAuditor: HtmlAuditor = (html) => auditHtmlAndClassify(html, { allowPrivate: true })

export async function auditHtmlTool(
  args: unknown,
  session: Session,
  audit: HtmlAuditor = defaultHtmlAuditor
): Promise<AuditToolResult> {
  const input = auditHtmlInput.parse(args)
  const classified = await audit(input.html)
  session.record(classified)
  return toAuditResult(classified.raw.auditedUrl, classified, false)
}
