import { describe, expect, it } from 'vitest'
import type { ClassifiedAudit } from '@the-unseen/core'
import { auditEndpoint, fetchAudit, hostnameOf, isClassifiedAudit, parseAuditBody, screenshotEndpoint } from './audit-source'

const audit = {
  hauntings: [],
  score: 0,
  countsByType: {},
  needsManualCheck: [],
  automatedCoverageNote: 'note',
  raw: { auditedUrl: 'https://example.com/', axNodes: [], boundingBoxes: [], tabWalkResult: { steps: [], cycles: [] } },
}

function fakeFetch(status: number, body: unknown): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }))
}

describe('endpoints', () => {
  it('maps a source to its API paths', () => {
    expect(auditEndpoint({ kind: 'job', id: 'abc' })).toBe('/api/audit/abc')
    expect(screenshotEndpoint({ kind: 'sample', id: 'cursed-shop-index' })).toBe('/api/samples/cursed-shop-index/screenshot.png')
    expect(auditEndpoint({ kind: 'job', id: 'a/b' })).toBe('/api/audit/a%2Fb')
  })
})

describe('isClassifiedAudit', () => {
  it('accepts the fields the view needs and rejects other shapes', () => {
    expect(isClassifiedAudit(audit)).toBe(true)
    expect(isClassifiedAudit({ ...audit, score: 'high' })).toBe(false)
    expect(isClassifiedAudit({ ...audit, raw: null })).toBe(false)
    expect(isClassifiedAudit(null)).toBe(false)
  })
})

describe('parseAuditBody', () => {
  it('reads a sample and a finished job', () => {
    expect(parseAuditBody({ kind: 'sample', id: 's' }, { id: 's', result: audit })).toMatchObject({ status: 'ok' })
    expect(parseAuditBody({ kind: 'job', id: 'j' }, { status: 'done', result: audit })).toMatchObject({ status: 'ok' })
  })

  it('treats a running job as in progress', () => {
    expect(parseAuditBody({ kind: 'job', id: 'j' }, { status: 'walking' })).toEqual({ status: 'in-progress' })
  })

  it.each([
    ['TIMEOUT', 'The audit took too long (60s limit). The page may be too large or slow to load.'],
    ['SSRF_BLOCKED', 'Cannot audit private or internal URLs for security reasons.'],
    ['RESOURCE_LIMIT', 'The page is too large to audit (50MB limit).'],
    ['NETWORK_ERROR', 'Could not load the page. Check the URL and try again.'],
  ])('reports an errored job (%s) as failed with the séance copy, not as missing', (code, message) => {
    const body = { status: 'error', error: code, message: 'server text' }
    expect(parseAuditBody({ kind: 'job', id: 'j' }, body)).toEqual({ status: 'failed', message })
  })

  it('falls back to the server message, then to generic copy, for an unknown error code', () => {
    expect(parseAuditBody({ kind: 'job', id: 'j' }, { status: 'error', error: 'ODD', message: 'Something odd' })).toEqual({
      status: 'failed',
      message: 'Something odd',
    })
    expect(parseAuditBody({ kind: 'job', id: 'j' }, { status: 'error' })).toEqual({
      status: 'failed',
      message: 'The audit could not be completed. Please try another URL.',
    })
  })
})

describe('hostnameOf', () => {
  const withUrl = (auditedUrl: string): ClassifiedAudit => ({ ...audit, raw: { ...audit.raw, auditedUrl } }) as unknown as ClassifiedAudit

  it('names a bundled sample by its relative path instead of a host', () => {
    expect(hostnameOf(withUrl('/cursed-shop/index.html'))).toBe('Cursed Shop (sample)')
  })

  it('shows the real hostname of a live audit', () => {
    expect(hostnameOf(withUrl('https://www.example.com/path?q=1'))).toBe('www.example.com')
  })
})

describe('fetchAudit', () => {
  it('maps 404 to not-found and other failures to a retryable message', async () => {
    expect(await fetchAudit({ kind: 'job', id: 'j' }, fakeFetch(404, { error: 'NOT_FOUND' }))).toEqual({ status: 'not-found' })
    expect(await fetchAudit({ kind: 'job', id: 'j' }, fakeFetch(500, {}))).toMatchObject({ status: 'failed' })
    const broken: typeof fetch = () => Promise.reject(new TypeError('offline'))
    expect(await fetchAudit({ kind: 'sample', id: 's' }, broken)).toMatchObject({ status: 'failed' })
  })

  it('maps an errored job response to a failed state with a reason', async () => {
    const result = await fetchAudit({ kind: 'job', id: 'j' }, fakeFetch(200, { status: 'error', error: 'TIMEOUT', message: 'x' }))
    expect(result).toEqual({ status: 'failed', message: expect.stringContaining('took too long') })
  })

  it('returns the audit for a good sample response', async () => {
    const result = await fetchAudit({ kind: 'sample', id: 's' }, fakeFetch(200, { id: 's', result: audit }))
    expect(result).toMatchObject({ status: 'ok' })
  })
})
