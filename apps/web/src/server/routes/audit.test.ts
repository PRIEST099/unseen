import rateLimit from '@fastify/rate-limit'
import fastify from 'fastify'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import type { SafeFetchPolicy } from '@the-unseen/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobQueue, QueueFullError } from '../jobs/queue.js'
import { JobStore } from '../jobs/store.js'
import type { Job } from '../jobs/types.js'
import { SlidingWindowLimiter } from '../middleware/rate-limit.js'
import { createServer } from '../server.js'
import { loadSampleAudit } from '../test-support/sample-audit.js'
import { auditRoutes } from './audit.js'
import type { AuditRoutesOptions } from './audit.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const INVALID_URL = { error: 'INVALID_URL', message: 'URL must be a valid http or https URL' }
const SSRF_BLOCKED = { error: 'SSRF_BLOCKED', message: 'Cannot audit private or internal URLs' }
const QUEUE_FULL = { error: 'QUEUE_FULL', message: 'Server is at capacity, please try again later' }

const allowAll: SafeFetchPolicy = { shouldBlock: async () => ({ block: false, reason: '' }) }
const servers: FastifyInstance[] = []

type Harness = { server: FastifyInstance; store: JobStore; queue: JobQueue; started: string[] }

/** The audit routes alone, with a queue whose jobs never finish unless a test says so. */
async function harness(options: Partial<AuditRoutesOptions> & { depth?: number; concurrency?: number } = {}): Promise<Harness> {
  const store = options.store ?? new JobStore()
  const started: string[] = []
  const queue =
    options.queue ??
    new JobQueue({
      maxConcurrency: options.concurrency ?? 1,
      maxQueueDepth: options.depth,
      execute: (id) => {
        started.push(id)
        return new Promise<void>(() => undefined)
      },
    })
  const server = fastify({ trustProxy: true })
  servers.push(server)
  await server.register(rateLimit, { global: false })
  await server.register(auditRoutes, {
    prefix: '/api',
    maxConcurrency: 1,
    store,
    queue,
    hourlyLimiter: options.hourlyLimiter ?? new SlidingWindowLimiter({ max: 1000, windowMs: 3_600_000 }),
    ...(options.ssrfPolicy ? { ssrfPolicy: options.ssrfPolicy } : {}),
  })
  await server.ready()
  return { server, store, queue, started }
}

function post(server: FastifyInstance, payload: unknown, ip = '203.0.113.1'): Promise<LightMyRequestResponse> {
  return server.inject({ method: 'POST', url: '/api/audit', payload: JSON.stringify(payload), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip } })
}

function job(overrides: Partial<Job>): Job {
  return { id: 'job-1', url: 'https://secret.example/private?x=1', status: 'queued', stages: { queued: 1 }, createdAt: 1, updatedAt: 1, ...overrides }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('POST /api/audit validation', () => {
  it.each([
    ['a missing url', {}],
    ['a non-string url', { url: 123 }],
    ['an extra property', { url: 'https://example.com/', extra: true }],
    ['text that is not a URL', { url: 'not a url' }],
    ['an ftp URL', { url: 'ftp://example.com/file' }],
    ['a javascript URL', { url: 'javascript:alert(1)' }],
    ['a file URL', { url: 'file:///etc/passwd' }],
    ['a URL with no host', { url: 'http://' }],
    ['an over-long URL', { url: `https://example.com/${'a'.repeat(3000)}` }],
    ['a null body', null],
  ])('rejects %s with 400 INVALID_URL', async (_label, payload) => {
    const { server, store } = await harness({ ssrfPolicy: allowAll })
    const response = await post(server, payload)
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual(INVALID_URL)
    expect(store.size).toBe(0)
  })

  it('rejects malformed JSON with 400 INVALID_URL', async () => {
    const { server } = await harness()
    const response = await server.inject({ method: 'POST', url: '/api/audit', payload: '{"url":', headers: { 'content-type': 'application/json' } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual(INVALID_URL)
  })

  it('rejects a body with no content type', async () => {
    const { server } = await harness()
    const response = await server.inject({ method: 'POST', url: '/api/audit', payload: 'url=https://example.com' })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual(INVALID_URL)
  })
})

describe('POST /api/audit SSRF pre-check', () => {
  it.each(['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://0x7f000001/', 'http://2130706433/', 'http://10.0.0.5:8080/', 'http://[::ffff:127.0.0.1]/'])(
    'blocks %s with 403 SSRF_BLOCKED and creates no job',
    async (url) => {
      vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '')
      const { server, store, started } = await harness()
      const response = await post(server, { url })
      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual(SSRF_BLOCKED)
      expect(response.body).not.toContain('127.0.0.1')
      expect(response.body).not.toContain('169.254')
      expect(store.size).toBe(0)
      expect(started).toEqual([])
    },
  )

  it('treats a policy that throws as a block', async () => {
    const throwing: SafeFetchPolicy = { shouldBlock: async () => { throw new Error('resolver exploded for 10.0.0.1') } }
    const { server } = await harness({ ssrfPolicy: throwing })
    const response = await post(server, { url: 'https://example.com/' })
    expect(response.statusCode).toBe(403)
    expect(response.body).not.toContain('10.0.0.1')
  })

  it('honours the dev flag outside production: loopback passes the pre-check', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '1')
    const { server } = await harness()
    const response = await post(server, { url: 'http://127.0.0.1:3000/cursed-shop/index.html' })
    expect(response.statusCode).toBe(202)
  })

  it('ignores the dev flag in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '1')
    const { server } = await harness()
    const response = await post(server, { url: 'http://127.0.0.1:3000/' })
    expect(response.statusCode).toBe(403)
  })
})

describe('POST /api/audit accepting and queueing', () => {
  it('creates a queued job, enqueues it and answers 202 { id }', async () => {
    const { server, store, started } = await harness({ ssrfPolicy: allowAll })
    const response = await post(server, { url: ' https://Example.com/page ' })
    expect(response.statusCode).toBe(202)
    const { id } = response.json<{ id: string }>()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(store.get(id)).toMatchObject({ status: 'queued', url: 'https://example.com/page' })
    expect(typeof store.get(id)?.stages.queued).toBe('number')
    expect(started).toEqual([id])
  })

  it('answers 503 QUEUE_FULL when the queue is full and leaves no job behind', async () => {
    const { server, store } = await harness({ ssrfPolicy: allowAll, concurrency: 1, depth: 2 })
    for (let i = 0; i < 3; i++) {
      expect((await post(server, { url: 'https://example.com/' }, `203.0.113.${i + 10}`)).statusCode).toBe(202)
    }
    const response = await post(server, { url: 'https://example.com/' }, '203.0.113.99')
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual(QUEUE_FULL)
    expect(store.size).toBe(3)
  })

  it('removes the job and answers 503 if the queue fills between the check and enqueue', async () => {
    const racing = new JobQueue({ execute: async () => undefined })
    vi.spyOn(racing, 'enqueue').mockImplementation(() => {
      throw new QueueFullError()
    })
    const { server, store } = await harness({ ssrfPolicy: allowAll, queue: racing })
    const response = await post(server, { url: 'https://example.com/' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual(QUEUE_FULL)
    expect(store.size).toBe(0)
  })

  it('hides unexpected failures behind a generic 500 and removes the job', async () => {
    const broken = new JobQueue({ execute: async () => undefined })
    vi.spyOn(broken, 'enqueue').mockImplementation(() => {
      throw new Error('boom at C:\\secret\\path.ts:12')
    })
    const { server, store } = await harness({ ssrfPolicy: allowAll, queue: broken })
    const response = await post(server, { url: 'https://example.com/' })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'INTERNAL_ERROR', message: 'Internal server error' })
    expect(response.body).not.toContain('secret')
    expect(store.size).toBe(0)
  })
})

describe('POST /api/audit rate limits', () => {
  it('allows 5 posts per minute per IP, then answers 429 RATE_LIMIT with Retry-After', async () => {
    const { server } = await harness({ ssrfPolicy: allowAll })
    for (let i = 0; i < 5; i++) expect((await post(server, { url: 'bad' }, '198.51.100.7')).statusCode).toBe(400)
    const limited = await post(server, { url: 'bad' }, '198.51.100.7')
    expect(limited.statusCode).toBe(429)
    const body = limited.json<{ error: string; message: string; retryAfter: number }>()
    expect(body).toEqual({ error: 'RATE_LIMIT', message: 'Too many requests', retryAfter: expect.any(Number) })
    expect(body.retryAfter).toBeGreaterThanOrEqual(1)
    expect(body.retryAfter).toBeLessThanOrEqual(60)
    expect(limited.headers['retry-after']).toBe(String(body.retryAfter))
    expect((await post(server, { url: 'bad' }, '198.51.100.8')).statusCode).toBe(400)
  })

  it('enforces the hourly cap per IP with 429 RATE_LIMIT and Retry-After', async () => {
    const hourlyLimiter = new SlidingWindowLimiter({ max: 2, windowMs: 3_600_000 })
    const { server } = await harness({ ssrfPolicy: allowAll, hourlyLimiter })
    for (let i = 0; i < 2; i++) expect((await post(server, { url: 'bad' }, '198.51.100.20')).statusCode).toBe(400)
    const limited = await post(server, { url: 'bad' }, '198.51.100.20')
    expect(limited.statusCode).toBe(429)
    const body = limited.json<{ error: string; retryAfter: number }>()
    expect(body.error).toBe('RATE_LIMIT')
    expect(body.retryAfter).toBeGreaterThan(3500)
    expect(limited.headers['retry-after']).toBe(String(body.retryAfter))
    expect((await post(server, { url: 'bad' }, '198.51.100.21')).statusCode).toBe(400)
  })

  it('does not rate limit GET /api/audit/:id polling', async () => {
    const { server } = await harness()
    for (let i = 0; i < 30; i++) {
      expect((await server.inject({ method: 'GET', url: '/api/audit/missing' })).statusCode).toBe(404)
    }
  })
})

describe('GET /api/audit/:id', () => {
  it('returns 404 NOT_FOUND for an unknown id', async () => {
    const { server } = await harness()
    const response = await server.inject({ method: 'GET', url: '/api/audit/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'NOT_FOUND' })
  })

  it('returns only { status } while queued', async () => {
    const { server, store } = await harness()
    store.set(job({ status: 'queued' }))
    const response = await server.inject({ method: 'GET', url: '/api/audit/job-1' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'queued' })
  })

  it.each(['loading', 'tree', 'walking', 'classifying'] as const)('returns status and stages while %s', async (status) => {
    const { server, store } = await harness()
    const stages = { queued: 1, loading: 2 }
    store.set(job({ status, stages }))
    const response = await server.inject({ method: 'GET', url: '/api/audit/job-1' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status, stages })
  })

  it('returns the result and stages when done, without the URL or the screenshot', async () => {
    const { server, store } = await harness()
    const result = loadSampleAudit()
    store.set(job({ status: 'done', result, screenshotPng: 'UE5H', stages: { queued: 1, done: 9 } }))
    const response = await server.inject({ method: 'GET', url: '/api/audit/job-1' })
    expect(response.statusCode).toBe(200)
    const body = response.json<{ status: string; result: { score: number }; stages: unknown }>()
    expect(body.status).toBe('done')
    expect(body.result.score).toBe(result.score)
    expect(body.stages).toEqual({ queued: 1, done: 9 })
    expect(Object.keys(body).sort()).toEqual(['result', 'stages', 'status'])
    expect(response.body).not.toContain('secret.example')
    expect(response.body).not.toContain('UE5H')
  })

  it('returns the error code and message when errored, without the URL', async () => {
    const { server, store } = await harness()
    store.set(job({ status: 'error', error: { code: 'TIMEOUT', message: 'Audit timed out after 60 seconds' } }))
    const response = await server.inject({ method: 'GET', url: '/api/audit/job-1' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'error', error: 'TIMEOUT', message: 'Audit timed out after 60 seconds' })
  })

  it('treats a done job whose result was evicted as expired (404)', async () => {
    const { server, store } = await harness()
    store.set(job({ status: 'done' }))
    expect((await server.inject({ method: 'GET', url: '/api/audit/job-1' })).statusCode).toBe(404)
  })
})

describe('GET /api/audit/:id/screenshot.png', () => {
  it('serves the stored PNG for a done job', async () => {
    const { server, store } = await harness()
    store.set(job({ status: 'done', result: loadSampleAudit(), screenshotPng: PNG_SIGNATURE.toString('base64') }))
    const response = await server.inject({ method: 'GET', url: '/api/audit/job-1/screenshot.png' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('image/png')
    expect(response.rawPayload.equals(PNG_SIGNATURE)).toBe(true)
  })

  it.each([
    ['an unknown job', undefined],
    ['a job that is not done', job({ status: 'walking', screenshotPng: 'UE5H' })],
    ['a done job without a screenshot', job({ status: 'done' })],
    ['an errored job', job({ status: 'error' })],
  ])('returns 404 for %s', async (_label, stored) => {
    const { server, store } = await harness()
    if (stored) store.set(stored)
    const response = await server.inject({ method: 'GET', url: '/api/audit/job-1/screenshot.png' })
    expect(response.statusCode).toBe(404)
  })
})

describe('createServer wiring', () => {
  it('serves the audit routes under /api and stops the store timer on close', async () => {
    const server = createServer({ logger: false })
    const response = await server.inject({ method: 'POST', url: '/api/audit', payload: { url: 'nope' } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual(INVALID_URL)
    expect((await server.inject({ method: 'GET', url: '/api/audit/missing' })).json()).toEqual({ error: 'NOT_FOUND' })
    expect(response.headers['content-security-policy']).toBeDefined()
    await server.close()
  })
})
