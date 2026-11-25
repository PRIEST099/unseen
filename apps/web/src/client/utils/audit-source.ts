import type { ClassifiedAudit } from '@the-unseen/core'
import { siteLabel } from './audited-url'
// seance.ts imports isClassifiedAudit from here; the cycle is safe because neither module
// calls into the other while it is being evaluated, only later from functions.
import { describeJobError } from './seance'

export type AuditSource = { kind: 'job' | 'sample'; id: string }

export type AuditLoadResult =
  | { status: 'ok'; audit: ClassifiedAudit }
  | { status: 'not-found' }
  | { status: 'in-progress' }
  | { status: 'failed'; message: string }

const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Checks the fields the Spirit Sight view reads; the server is trusted for the rest of the shape. */
export function isClassifiedAudit(value: unknown): value is ClassifiedAudit {
  if (!isRecord(value) || !isRecord(value.raw)) return false
  const { raw } = value
  return (
    Array.isArray(value.hauntings) &&
    typeof value.score === 'number' &&
    isRecord(value.countsByType) &&
    Array.isArray(value.needsManualCheck) &&
    typeof value.automatedCoverageNote === 'string' &&
    typeof raw.auditedUrl === 'string' &&
    Array.isArray(raw.axNodes) &&
    Array.isArray(raw.boundingBoxes) &&
    isRecord(raw.tabWalkResult)
  )
}

export function auditEndpoint(source: AuditSource): string {
  return source.kind === 'job' ? `/api/audit/${encodeURIComponent(source.id)}` : `/api/samples/${encodeURIComponent(source.id)}`
}

export function screenshotEndpoint(source: AuditSource): string {
  return `${auditEndpoint(source)}/screenshot.png`
}

/** Pulls the audit out of a job-status or sample response body. */
export function parseAuditBody(source: AuditSource, body: unknown): AuditLoadResult {
  if (!isRecord(body)) return { status: 'failed', message: NETWORK_MESSAGE }
  if (source.kind === 'sample') {
    return isClassifiedAudit(body.result) ? { status: 'ok', audit: body.result } : { status: 'not-found' }
  }
  if (body.status === 'done') {
    return isClassifiedAudit(body.result) ? { status: 'ok', audit: body.result } : { status: 'not-found' }
  }
  if (body.status === 'error') {
    // A failed job (TIMEOUT, SSRF_BLOCKED, …) still exists: say why, with the séance's copy.
    const code = typeof body.error === 'string' ? body.error : ''
    const message = typeof body.message === 'string' ? body.message : ''
    return { status: 'failed', message: describeJobError(code, message) }
  }
  return { status: 'in-progress' }
}

export async function fetchAudit(source: AuditSource, fetchFn: typeof fetch = fetch): Promise<AuditLoadResult> {
  try {
    const response = await fetchFn(auditEndpoint(source))
    if (response.status === 404) return { status: 'not-found' }
    if (!response.ok) return { status: 'failed', message: NETWORK_MESSAGE }
    const body: unknown = await response.json()
    return parseAuditBody(source, body)
  } catch {
    return { status: 'failed', message: NETWORK_MESSAGE }
  }
}

const settled = new Map<string, AuditLoadResult>()
const inFlight = new Map<string, Promise<AuditLoadResult>>()

function cacheKey(source: AuditSource): string {
  return `${source.kind}:${source.id}`
}

export function cachedAudit(source: AuditSource): AuditLoadResult | undefined {
  return settled.get(cacheKey(source))
}

/** Fetches once per source: later calls (view switches, StrictMode remounts) reuse the result. */
export function loadAudit(source: AuditSource): Promise<AuditLoadResult> {
  const key = cacheKey(source)
  const cached = settled.get(key)
  if (cached !== undefined) return Promise.resolve(cached)
  const pending = inFlight.get(key)
  if (pending !== undefined) return pending
  const request = fetchAudit(source).then((result) => {
    inFlight.delete(key)
    if (result.status === 'ok' || result.status === 'not-found') settled.set(key, result)
    return result
  })
  inFlight.set(key, request)
  return request
}

/** Stores an audit the séance already downloaded, so Spirit Sight does not fetch it again. */
export function primeAudit(source: AuditSource, audit: ClassifiedAudit): void {
  settled.set(cacheKey(source), { status: 'ok', audit })
}

/**
 * The name of the audited site for headings: the real hostname for a live audit, or
 * "Cursed Shop (sample)" for a bundled sample, whose URL is the relative `/cursed-shop/` path.
 */
export function hostnameOf(audit: ClassifiedAudit): string {
  return siteLabel(audit.raw.auditedUrl)
}
