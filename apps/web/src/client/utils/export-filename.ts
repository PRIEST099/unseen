import { absoluteHostname, isSamplePath, SAMPLE_SITE_SLUG } from './audited-url'

export type ExportExtension = 'md' | 'json'

/**
 * The hostname of an audited URL; `cursed-shop-sample` for a bundled sample's relative
 * `/cursed-shop/` path; the raw string when it is neither.
 */
function domainOf(auditedUrl: string): string {
  if (isSamplePath(auditedUrl)) return SAMPLE_SITE_SLUG
  return absoluteHostname(auditedUrl) ?? auditedUrl
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
