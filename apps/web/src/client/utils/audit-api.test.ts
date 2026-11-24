import { describe, expect, it } from 'vitest'
import { formatDocumentTitle } from '../hooks/useDocumentTitle'
import { describeSubmitError, parseAuditUrl, submitAudit } from './audit-api'
import { parseSamples } from './samples'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('parseAuditUrl', () => {
  it('accepts http and https URLs and canonicalises them', () => {
    expect(parseAuditUrl(' https://example.com ')).toBe('https://example.com/')
    expect(parseAuditUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
  })

  it.each(['', 'example.com', 'ftp://example.com', 'javascript:alert(1)', 'not a url'])('rejects %j', (input) => {
    expect(parseAuditUrl(input)).toBeUndefined()
  })
})

describe('submitAudit', () => {
  it('returns the job id on 202', async () => {
    const result = await submitAudit('https://example.com/', () => Promise.resolve(jsonResponse(202, { id: 'abc' })))
    expect(result).toEqual({ ok: true, id: 'abc' })
  })

  it.each([
    [400, { error: 'INVALID_URL' }, /valid http or https URL/],
    [403, { error: 'SSRF_BLOCKED' }, /private or internal URLs/],
    [429, { error: 'RATE_LIMIT', retryAfter: 12 }, /wait 12 seconds/],
    [503, { error: 'QUEUE_FULL' }, /at capacity/],
  ])('maps %i to a readable message', async (status, body, pattern) => {
    const result = await submitAudit('https://example.com/', () => Promise.resolve(jsonResponse(status, body)))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(pattern)
  })

  it('reports a network failure without leaking the error', async () => {
    const result = await submitAudit('https://example.com/', () => Promise.reject(new Error('ECONNREFUSED 10.0.0.1')))
    expect(result).toEqual({ ok: false, message: expect.stringContaining('Could not reach the server') })
    if (!result.ok) expect(result.message).not.toContain('10.0.0.1')
  })

  it('falls back for an unknown body', () => {
    expect(describeSubmitError(500, 'oops')).toMatch(/could not be started/)
  })
})

describe('parseSamples', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const good = { id: 'a', name: 'A', url: 'https://x', score: 3, thumbnailUrl: '/t.jpg', extra: 1 }
    expect(parseSamples([good, { id: 'b' }, null, 'x'])).toEqual([
      { id: 'a', name: 'A', url: 'https://x', score: 3, thumbnailUrl: '/t.jpg' },
    ])
    expect(parseSamples({})).toEqual([])
  })
})

describe('formatDocumentTitle', () => {
  it('appends the site name, except on the landing view', () => {
    expect(formatDocumentTitle('Page not found')).toBe('Page not found – THE UNSEEN')
    expect(formatDocumentTitle('THE UNSEEN')).toBe('THE UNSEEN')
  })
})
