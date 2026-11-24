export type SubmitResult = { ok: true; id: string } | { ok: false; message: string }

export const INVALID_URL_MESSAGE = 'Enter a valid http or https URL, for example https://example.com.'
const SSRF_MESSAGE = 'Cannot audit private or internal URLs for security reasons.'
const QUEUE_FULL_MESSAGE = 'The server is at capacity. Please try again in a few minutes.'
const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.'
const FALLBACK_MESSAGE = 'The audit could not be started. Please try again.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Returns the canonical URL when `input` is a well-formed http(s) URL, otherwise undefined. */
export function parseAuditUrl(input: string): string | undefined {
  try {
    const parsed = new URL(input.trim())
    const isWeb = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    return isWeb && parsed.hostname !== '' ? parsed.href : undefined
  } catch {
    return undefined
  }
}

function rateLimitMessage(retryAfter: unknown): string {
  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
    const seconds = Math.ceil(retryAfter)
    return `Too many requests. Please wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'} and try again.`
  }
  return 'Too many requests. Please wait a moment and try again.'
}

/** Maps a `POST /api/audit` error body (or its status) to the user-facing message. */
export function describeSubmitError(status: number, body: unknown): string {
  const code = isRecord(body) && typeof body.error === 'string' ? body.error : undefined
  if (code === 'INVALID_URL') return INVALID_URL_MESSAGE
  if (code === 'SSRF_BLOCKED') return SSRF_MESSAGE
  if (code === 'RATE_LIMIT') return rateLimitMessage(isRecord(body) ? body.retryAfter : undefined)
  if (code === 'QUEUE_FULL') return QUEUE_FULL_MESSAGE
  if (status === 429) return rateLimitMessage(undefined)
  if (status === 503) return QUEUE_FULL_MESSAGE
  return FALLBACK_MESSAGE
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json()
    return body
  } catch {
    return undefined
  }
}

export async function submitAudit(url: string, fetchFn: typeof fetch = fetch): Promise<SubmitResult> {
  try {
    const response = await fetchFn('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const body = await readJson(response)
    if (response.status === 202 && isRecord(body) && typeof body.id === 'string') {
      return { ok: true, id: body.id }
    }
    return { ok: false, message: describeSubmitError(response.status, body) }
  } catch {
    return { ok: false, message: NETWORK_MESSAGE }
  }
}
