/**
 * Helpers for the `auditedUrl` recorded with an audit. A live audit records the absolute URL that
 * was audited. A pre-audited Cursed Shop sample records the relative path this app serves the shop
 * at (`/cursed-shop/<page>.html`), or an absolute one when PUBLIC_BASE_URL was set at build time,
 * so nothing here may assume the value parses as an absolute URL.
 */

/** Where this app serves the Cursed Shop, and so the path every bundled sample is recorded under. */
export const SAMPLE_PATH_PREFIX = '/cursed-shop/'

/** How a bundled sample is named in headings in place of a hostname. */
export const SAMPLE_SITE_LABEL = 'Cursed Shop (sample)'

/** Short slug used for a sample in export filenames. */
export const SAMPLE_SITE_SLUG = 'cursed-shop-sample'

/** True for the relative path recorded with a bundled sample, for example `/cursed-shop/index.html`. */
export function isSamplePath(auditedUrl: string): boolean {
  return auditedUrl.trim().startsWith(SAMPLE_PATH_PREFIX)
}

/** The hostname of an absolute http(s) URL, or undefined when the value is not one. */
export function absoluteHostname(auditedUrl: string): string | undefined {
  try {
    const parsed = new URL(auditedUrl.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.hostname === '' ? undefined : parsed.hostname
  } catch {
    return undefined
  }
}

/**
 * The name to show for the audited site: "Cursed Shop (sample)" for a bundled sample's relative
 * path, the hostname for an absolute URL, and the raw value (or "this page" when empty) otherwise.
 */
export function siteLabel(auditedUrl: string): string {
  if (isSamplePath(auditedUrl)) return SAMPLE_SITE_LABEL
  const hostname = absoluteHostname(auditedUrl)
  if (hostname !== undefined) return hostname
  const trimmed = auditedUrl.trim()
  return trimmed === '' ? 'this page' : trimmed
}
