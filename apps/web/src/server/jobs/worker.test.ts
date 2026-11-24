import {
  AuditCollectionError,
  AuditResourceLimitError,
  AuditTimeoutError,
  NonHtmlContentError,
  SsrfBlockedError,
} from '@the-unseen/core'
import type { AuditOptions, ClassifiedAudit } from '@the-unseen/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSampleAudit } from '../test-support/sample-audit.js'
import { JobStore } from './store.js'
import type { Job } from './types.js'
import { executeJob, isPrivateAllowed, mapErrorToResponse } from './worker.js'
import type { AuditFunction } from './worker.js'

const SECRET_URL = 'http://10.1.2.3:8080/internal/path?token=abc'
const SECRET_IP = '10.1.2.3'

afterEach(() => {
  vi.unstubAllEnvs()
})

const baseAudit = loadSampleAudit()

/** A real classified audit with a non-empty screenshot, as the core returns it. */
function fakeAudit(): ClassifiedAudit {
  return { ...baseAudit, raw: { ...baseAudit.raw, screenshotPng: 'UE5H' } }
}

function queuedJob(url = 'https://example.test/'): Job {
  return { id: 'job-1', url, status: 'queued', stages: { queued: 1 }, createdAt: 1, updatedAt: 1 }
}

describe('mapErrorToResponse', () => {
  it.each([
    [new SsrfBlockedError(SECRET_URL, `resolved to ${SECRET_IP}`), 'SSRF_BLOCKED', 'Cannot audit private or internal URLs'],
    [new AuditTimeoutError('full-audit', 60_000), 'TIMEOUT', 'Audit timed out after 60 seconds'],
    [new AuditResourceLimitError('total-weight', 60_000_000), 'RESOURCE_LIMIT', 'Page exceeded resource limits'],
    [new Error(`net::ERR_CONNECTION_REFUSED at ${SECRET_URL}`), 'NETWORK_ERROR', 'Failed to load the page'],
    [new NonHtmlContentError('application/pdf'), 'NETWORK_ERROR', 'Failed to load the page'],
    [new AuditCollectionError('ax-tree', new Error('x')), 'NETWORK_ERROR', 'Failed to load the page'],
    ['a string', 'NETWORK_ERROR', 'Failed to load the page'],
    [undefined, 'NETWORK_ERROR', 'Failed to load the page'],
  ])('maps %s to %s', (error, code, message) => {
    expect(mapErrorToResponse(error)).toEqual({ code, message })
  })

  it('never leaks the URL, an IP address or a stack trace', () => {
    const errors = [
      new SsrfBlockedError(SECRET_URL, `resolved to ${SECRET_IP}`),
      new AuditTimeoutError(`navigation of ${SECRET_URL}`, 30_000),
      new AuditResourceLimitError('per-resource', 1),
      new Error(`connect ECONNREFUSED ${SECRET_IP}:8080`),
    ]
    for (const error of errors) {
      const serialised = JSON.stringify(mapErrorToResponse(error))
      expect(serialised).not.toContain(SECRET_IP)
      expect(serialised).not.toContain('internal/path')
      expect(serialised).not.toContain('token=abc')
      expect(serialised).not.toMatch(/\bat\s.+\(/)
    }
  })
})

describe('isPrivateAllowed', () => {
  it('requires the flag and a non-production NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '1')
    expect(isPrivateAllowed()).toBe(true)
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '')
    expect(isPrivateAllowed()).toBe(false)
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '1')
    expect(isPrivateAllowed()).toBe(false)
  })
})

describe('executeJob', () => {
  it('tracks stages from onProgress, then stores the result and moves the PNG out of it', async () => {
    const store = new JobStore()
    store.set(queuedJob())
    const seen: Array<{ status: string; stages: Job['stages'] }> = []
    const audit: AuditFunction = async (_url, options) => {
      for (const [stage, at] of [['loading', 10], ['tree', 20], ['walking', 30], ['classifying', 40]] as const) {
        options.onProgress?.(stage, at)
        const job = store.get('job-1')
        if (job) seen.push({ status: job.status, stages: job.stages })
      }
      return fakeAudit()
    }

    await executeJob('job-1', { store, audit, now: () => 99 })

    expect(seen.map((s) => s.status)).toEqual(['loading', 'tree', 'walking', 'classifying'])
    expect(seen[3]?.stages).toEqual({ queued: 1, loading: 10, tree: 20, walking: 30, classifying: 40 })
    const job = store.get('job-1')
    expect(job?.status).toBe('done')
    expect(job?.stages.done).toBe(99)
    expect(job?.screenshotPng).toBe('UE5H')
    expect(job?.result?.raw.screenshotPng).toBe('')
    expect(job?.result?.score).toBe(baseAudit.score)
  })

  it('calls the audit with a 60s timeout, never passes safeFetchPolicy, and allowPrivate false by default', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '')
    const store = new JobStore()
    store.set(queuedJob())
    const received: AuditOptions[] = []
    await executeJob('job-1', { store, audit: async (_u, o) => (received.push(o), fakeAudit()) })
    const options = received[0]
    expect(options?.timeoutMs).toBe(60_000)
    expect(options?.allowPrivate).toBe(false)
    expect(options).not.toHaveProperty('safeFetchPolicy')
  })

  it('passes allowPrivate only under the dev flag outside production', async () => {
    const store = new JobStore()
    const received: Array<boolean | undefined> = []
    const audit: AuditFunction = async (_u, o) => (received.push(o.allowPrivate), fakeAudit())

    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '1')
    store.set(queuedJob())
    await executeJob('job-1', { store, audit })

    vi.stubEnv('NODE_ENV', 'production')
    store.set(queuedJob())
    await executeJob('job-1', { store, audit })

    expect(received).toEqual([true, false])
  })

  it('turns a failure into an error job with a safe message and logs the raw error server-side', async () => {
    const store = new JobStore()
    store.set(queuedJob(SECRET_URL))
    const logged: object[] = []
    const failure = new SsrfBlockedError(SECRET_URL, `resolved to ${SECRET_IP}`)

    await executeJob('job-1', {
      store,
      audit: async () => {
        throw failure
      },
      logger: { error: (context) => void logged.push(context) },
    })

    const job = store.get('job-1')
    expect(job?.status).toBe('error')
    expect(job?.error).toEqual({ code: 'SSRF_BLOCKED', message: 'Cannot audit private or internal URLs' })
    expect(JSON.stringify(job?.error)).not.toContain(SECRET_IP)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ err: failure, jobId: 'job-1' })
  })

  it('returns quietly when the job is gone', async () => {
    const audit = vi.fn<AuditFunction>()
    await executeJob('missing', { store: new JobStore(), audit })
    expect(audit).not.toHaveBeenCalled()
  })
})
