import type { ClassifiedAudit } from '@the-unseen/core'

export type ScanRecordEntry = { label: string; value: string }

/** Shown for a value the engine did not record (an audit made before the scan record existed). */
export const NOT_RECORDED = 'Not recorded'

function recorded(value: string | undefined): string {
  return value === undefined || value.trim() === '' ? NOT_RECORDED : value
}

/**
 * What another tester needs to rerun the audit and compare: tool versions, viewport, URL and time.
 * Every value comes from the audit itself (`raw`), never from the client's own build.
 */
export function scanRecord(audit: ClassifiedAudit): ScanRecordEntry[] {
  const { raw } = audit
  return [
    { label: 'THE UNSEEN version', value: recorded(raw.engine?.unseenVersion) },
    { label: 'axe-core version', value: recorded(raw.engine?.axeVersion) },
    { label: 'Chromium version', value: recorded(raw.engine?.chromiumVersion) },
    { label: 'Viewport', value: `${raw.viewportWidth} × ${raw.viewportHeight} px` },
    { label: 'Audited URL', value: raw.auditedUrl },
    { label: 'Audited at', value: raw.auditedAt },
  ]
}
