import { describe, expect, it } from 'vitest'
import { auditEndpoint, fetchAudit, isClassifiedAudit, parseAuditBody, screenshotEndpoint } from './audit-source'

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

  it('treats a running job as in progress and an errored job as gone', () => {
    expect(parseAuditBody({ kind: 'job', id: 'j' }, { status: 'walking' })).toEqual({ status: 'in-progress' })
    expect(parseAuditBody({ kind: 'job', id: 'j' }, { status: 'error', error: 'TIMEOUT' })).toEqual({ status: 'not-found' })
  })
})

describe('fetchAudit', () => {
  it('maps 404 to not-found and other failures to a retryable message', async () => {
    expect(await fetchAudit({ kind: 'job', id: 'j' }, fakeFetch(404, { error: 'NOT_FOUND' }))).toEqual({ status: 'not-found' })
    expect(await fetchAudit({ kind: 'job', id: 'j' }, fakeFetch(500, {}))).toMatchObject({ status: 'failed' })
    const broken: typeof fetch = () => Promise.reject(new TypeError('offline'))
    expect(await fetchAudit({ kind: 'sample', id: 's' }, broken)).toMatchObject({ status: 'failed' })
  })

  it('returns the audit for a good sample response', async () => {
    const result = await fetchAudit({ kind: 'sample', id: 's' }, fakeFetch(200, { id: 's', result: audit }))
    expect(result).toMatchObject({ status: 'ok' })
  })
})
