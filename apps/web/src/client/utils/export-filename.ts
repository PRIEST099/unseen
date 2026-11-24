export type ExportExtension = 'md' | 'json'

/** The hostname of an audited URL; the raw string when it cannot be parsed. */
function domainOf(auditedUrl: string): string {
  try {
    return new URL(auditedUrl).hostname
  } catch {
    return auditedUrl
  }
}

/** Keeps letters, digits, hyphens and periods; anything else (ports, brackets, colons) becomes a hyphen. */
function sanitizeSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned === '' ? 'site' : cleaned
}

/** `unseen-audit-[domain]-[timestamp].md|json`; the timestamp is epoch milliseconds from the clock. */
export function buildExportFilename(auditedUrl: string, timestampMs: number, extension: ExportExtension): string {
  const timestamp = Number.isFinite(timestampMs) ? Math.trunc(Math.abs(timestampMs)) : 0
  return `unseen-audit-${sanitizeSegment(domainOf(auditedUrl))}-${timestamp}.${extension}`
}
