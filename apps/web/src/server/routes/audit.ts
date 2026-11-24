import { randomUUID } from 'node:crypto'
import { normalizeIP } from '@fastify/rate-limit'
import type { errorResponseBuilderContext } from '@fastify/rate-limit'
import type { FastifyBaseLogger, FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { PermissiveSafeFetchPolicy, RestrictiveSafeFetchPolicy } from '@the-unseen/core'
import type { SafeFetchPolicy } from '@the-unseen/core'
import { JobQueue, QueueFullError } from '../jobs/queue.js'
import { JobStore } from '../jobs/store.js'
import type { Job } from '../jobs/types.js'
import { executeJob, isPrivateAllowed } from '../jobs/worker.js'
import type { AuditFunction } from '../jobs/worker.js'
import { SlidingWindowLimiter } from '../middleware/rate-limit.js'

export type AuditRoutesOptions = {
  /** Global cap on audits running at once (UNSEEN_MAX_CONCURRENCY). Ignored when `queue` is injected. */
  maxConcurrency: number
  /** Injected in tests. When omitted the plugin creates one, runs its cleanup timer and stops it on close. */
  store?: JobStore
  /** Injected in tests. When omitted the plugin builds one that runs `executeJob` against the store. */
  queue?: JobQueue
  /** Replaces `auditAndClassify` inside the default queue's worker. */
  audit?: AuditFunction
  /** Replaces the SSRF pre-check policy. Defaults to restrictive, or permissive under the dev flag. */
  ssrfPolicy?: SafeFetchPolicy
  /** Replaces the 30-per-hour per-IP limiter. */
  hourlyLimiter?: SlidingWindowLimiter
}

export const RATE_LIMIT_PER_MINUTE = 5
export const RATE_LIMIT_PER_HOUR = 30
const MAX_URL_LENGTH = 2048
const HOUR_MS = 60 * 60 * 1000

const INVALID_URL_BODY = { error: 'INVALID_URL', message: 'URL must be a valid http or https URL' } as const
const SSRF_BLOCKED_BODY = { error: 'SSRF_BLOCKED', message: 'Cannot audit private or internal URLs' } as const
const QUEUE_FULL_BODY = { error: 'QUEUE_FULL', message: 'Server is at capacity, please try again later' } as const
const NOT_FOUND_BODY = { error: 'NOT_FOUND' } as const

/** Thrown by the per-minute limiter's `errorResponseBuilder` and rendered by this plugin's error handler. */
class RateLimitedError extends Error {
  readonly statusCode = 429
  constructor(readonly retryAfter: number) {
    super('Too many requests')
    this.name = 'RateLimitedError'
  }
}

type AuditBody = { url: string }

const POST_SCHEMA = {
  body: {
    type: 'object',
    properties: { url: { type: 'string', maxLength: MAX_URL_LENGTH } },
    required: ['url'],
    additionalProperties: false,
  },
} as const

/** Returns the canonical URL when it is a well-formed http(s) URL, otherwise undefined. */
export function parseAuditUrl(input: string): string | undefined {
  try {
    const parsed = new URL(input.trim())
    const isWeb = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    return isWeb && parsed.hostname !== '' ? parsed.href : undefined
  } catch {
    return undefined
  }
}

function statusOf(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const { statusCode } = error
    if (typeof statusCode === 'number') return statusCode
  }
  return 500
}

function rateLimitBody(retryAfter: number): { error: 'RATE_LIMIT'; message: string; retryAfter: number } {
  return { error: 'RATE_LIMIT', message: 'Too many requests', retryAfter }
}

/** Client errors become the stable INVALID_URL body; everything else is logged and hidden. */
function installErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof RateLimitedError) {
      return reply.code(429).send(rateLimitBody(error.retryAfter))
    }
    const status = statusOf(error)
    if (status >= 400 && status < 500) return reply.code(400).send(INVALID_URL_BODY)
    request.log.error({ err: error }, 'audit route failed')
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' })
  })
}

/** Fails closed: a policy that throws counts as a block. The reason stays server-side. */
async function isBlocked(policy: SafeFetchPolicy, url: string, log: FastifyBaseLogger): Promise<boolean> {
  try {
    const verdict = await policy.shouldBlock(url)
    if (verdict.block) log.info({ reason: verdict.reason }, 'audit URL blocked by SSRF pre-check')
    return verdict.block
  } catch (error: unknown) {
    log.error({ err: error }, 'SSRF pre-check failed; treating the URL as blocked')
    return true
  }
}

/**
 * Fastify's validator strips unknown properties instead of failing on `additionalProperties: false`,
 * so unknown keys are rejected here, before validation runs.
 */
async function rejectExtraKeys(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  const { body } = request
  const extra = typeof body === 'object' && body !== null && Object.keys(body).some((key) => key !== 'url')
  return extra ? reply.code(400).send(INVALID_URL_BODY) : undefined
}

function pickPolicy(injected: SafeFetchPolicy | undefined): SafeFetchPolicy {
  if (injected) return injected
  return isPrivateAllowed() ? new PermissiveSafeFetchPolicy() : new RestrictiveSafeFetchPolicy()
}

function newJob(url: string): Job {
  const now = Date.now()
  return { id: randomUUID(), url, status: 'queued', stages: { queued: now }, createdAt: now, updatedAt: now }
}

type RouteDeps = {
  store: JobStore
  queue: JobQueue
  ssrfPolicy: SafeFetchPolicy | undefined
  hourly: SlidingWindowLimiter
}

function registerPostAudit(server: FastifyInstance, deps: RouteDeps): void {
  const perMinute = {
    max: RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request: FastifyRequest, context: errorResponseBuilderContext): Error =>
      new RateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000))),
  }
  // Runs after the per-minute hook (onRequest) and before body validation, so malformed posts count too.
  const hourlyHook = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const verdict = deps.hourly.hit(normalizeIP(request.ip))
    if (verdict.allowed) return undefined
    return reply.header('retry-after', verdict.retryAfterSeconds).code(429).send(rateLimitBody(verdict.retryAfterSeconds))
  }

  server.post<{ Body: AuditBody }>(
    '/audit',
    { schema: POST_SCHEMA, bodyLimit: 8192, config: { rateLimit: perMinute }, preValidation: [hourlyHook, rejectExtraKeys] },
    async (request, reply) => {
      const url = parseAuditUrl(request.body.url)
      if (url === undefined) return reply.code(400).send(INVALID_URL_BODY)
      if (await isBlocked(pickPolicy(deps.ssrfPolicy), url, request.log)) {
        return reply.code(403).send(SSRF_BLOCKED_BODY)
      }
      // Capacity is checked before the job exists, so a full queue never leaves an orphan job behind.
      if (deps.queue.isFull()) return reply.code(503).send(QUEUE_FULL_BODY)
      return createAndEnqueue(deps, url, reply)
    },
  )
}

function createAndEnqueue(deps: RouteDeps, url: string, reply: FastifyReply): FastifyReply {
  const job = newJob(url)
  deps.store.set(job)
  try {
    deps.queue.enqueue(job.id)
  } catch (error: unknown) {
    deps.store.delete(job.id)
    if (error instanceof QueueFullError) return reply.code(503).send(QUEUE_FULL_BODY)
    throw error
  }
  return reply.code(202).send({ id: job.id })
}

/** The client view of a job. Never includes the URL. */
function statusBody(job: Job): Record<string, unknown> | undefined {
  switch (job.status) {
    case 'queued':
      return { status: 'queued' }
    case 'done':
      // The result is dropped 15 minutes after completion; an evicted job reads as expired.
      return job.result === undefined ? undefined : { status: 'done', result: job.result, stages: job.stages }
    case 'error':
      return {
        status: 'error',
        error: job.error?.code ?? 'NETWORK_ERROR',
        message: job.error?.message ?? 'Failed to load the page',
      }
    default:
      return { status: job.status, stages: job.stages }
  }
}

function registerGetRoutes(server: FastifyInstance, store: JobStore): void {
  server.get<{ Params: { id: string } }>('/audit/:id', async (request, reply) => {
    const job = store.get(request.params.id)
    const body = job === undefined ? undefined : statusBody(job)
    return body === undefined ? reply.code(404).send(NOT_FOUND_BODY) : reply.code(200).send(body)
  })

  server.get<{ Params: { id: string } }>('/audit/:id/screenshot.png', async (request, reply) => {
    const job = store.get(request.params.id)
    if (job === undefined || job.status !== 'done' || !job.screenshotPng) {
      return reply.code(404).send(NOT_FOUND_BODY)
    }
    return reply.type('image/png').send(Buffer.from(job.screenshotPng, 'base64'))
  })
}

export const auditRoutes: FastifyPluginAsync<AuditRoutesOptions> = async (
  server: FastifyInstance,
  options: AuditRoutesOptions,
): Promise<void> => {
  const ownsStore = options.store === undefined
  const store = options.store ?? new JobStore()
  const queue =
    options.queue ??
    new JobQueue({
      maxConcurrency: options.maxConcurrency,
      execute: (jobId) => executeJob(jobId, { store, audit: options.audit, logger: server.log }),
      onError: (error, jobId) => server.log.error({ err: error, jobId }, 'job execution crashed'),
    })
  const hourly = options.hourlyLimiter ?? new SlidingWindowLimiter({ max: RATE_LIMIT_PER_HOUR, windowMs: HOUR_MS })

  if (ownsStore) {
    store.startCleanup()
    server.addHook('onClose', async (): Promise<void> => store.stopCleanup())
  }

  installErrorHandler(server)
  registerPostAudit(server, { store, queue, ssrfPolicy: options.ssrfPolicy, hourly })
  registerGetRoutes(server, store)
}
