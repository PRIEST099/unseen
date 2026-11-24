import type { AddressInfo } from 'node:net'
import { getPool } from '@the-unseen/core'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer } from '../server.js'

/**
 * Real audit end to end: a running server posts its own Cursed Shop page to itself, a real
 * Chromium audits it, and the test polls to done. Needs `UNSEEN_CHROMIUM_CHANNEL=chromium` on Windows.
 */
const STAGE_ORDER = ['queued', 'loading', 'tree', 'walking', 'classifying', 'done'] as const
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

type StatusBody = {
  status: string
  stages?: Record<string, number>
  result?: { score: number; hauntings: unknown[] }
  error?: string
}

let server: FastifyInstance
let base = ''

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStatusBody(value: unknown): value is StatusBody {
  return isRecord(value) && typeof value.status === 'string'
}

async function readJobId(response: Response): Promise<string> {
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.id !== 'string') throw new Error('response has no job id')
  return body.id
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('UNSEEN_DEV_ALLOW_PRIVATE', '1')
  if (!process.env.UNSEEN_CHROMIUM_CHANNEL) vi.stubEnv('UNSEEN_CHROMIUM_CHANNEL', 'chromium')
  server = createServer({ logger: false, maxConcurrency: 2 })
  await server.listen({ port: 0, host: '127.0.0.1' })
  const address: AddressInfo | string | null = server.server.address()
  if (address === null || typeof address === 'string') throw new Error('server is not listening on a TCP port')
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await server.close()
  await getPool().close()
  vi.unstubAllEnvs()
})

async function pollUntilFinished(id: string, deadlineMs: number): Promise<{ body: StatusBody; seen: string[] }> {
  const seen: string[] = []
  const started = Date.now()
  while (Date.now() - started < deadlineMs) {
    const response = await fetch(`${base}/api/audit/${id}`)
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    if (!isStatusBody(body)) throw new Error('unexpected status body')
    if (seen[seen.length - 1] !== body.status) seen.push(body.status)
    if (body.status === 'done' || body.status === 'error') return { body, seen }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`audit ${id} did not finish within ${deadlineMs}ms; saw ${seen.join(' > ')}`)
}

describe('audit job end to end (Cursed Shop demo)', () => {
  it('posts the demo URL, reports stages in order, returns a scored result and a PNG', async () => {
    const posted = Date.now()
    const accepted = await fetch(`${base}/api/audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${base}/cursed-shop/index.html` }),
    })
    expect(accepted.status).toBe(202)
    const id = await readJobId(accepted)

    const { body, seen } = await pollUntilFinished(id, 20_000)
    const elapsedMs = Date.now() - posted

    expect(body.status, `error: ${body.error ?? 'none'}`).toBe('done')
    expect(elapsedMs).toBeLessThan(20_000)
    expect(body.result?.score).toBeGreaterThan(0)
    expect(body.result?.hauntings.length).toBeGreaterThan(0)

    // Every observed status is one of the known stages and never goes backwards.
    const indexes = seen.map((status) => STAGE_ORDER.indexOf(status as (typeof STAGE_ORDER)[number]))
    expect(indexes.every((index) => index >= 0)).toBe(true)
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes)

    // The recorded timestamps cover the whole sequence queued -> loading -> tree -> walking -> classifying -> done.
    const stages = body.stages ?? {}
    const stamps = STAGE_ORDER.map((stage) => stages[stage] ?? Number.NaN)
    expect(stamps.every((at) => Number.isFinite(at))).toBe(true)
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1] ?? Number.POSITIVE_INFINITY)
    }
    expect(stamps[4]).toBeGreaterThan(stamps[1] ?? Number.POSITIVE_INFINITY)

    const screenshot = await fetch(`${base}/api/audit/${id}/screenshot.png`)
    expect(screenshot.status).toBe(200)
    expect(screenshot.headers.get('content-type')).toContain('image/png')
    const bytes = new Uint8Array(await screenshot.arrayBuffer())
    expect(Array.from(bytes.slice(0, 4))).toEqual(PNG_SIGNATURE)
    expect(bytes.length).toBeGreaterThan(1000)
  }, 40_000)

  it('turns an unreachable page into an error job without leaking the URL', async () => {
    const accepted = await fetch(`${base}/api/audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:1/never-listening' }),
    })
    expect(accepted.status).toBe(202)
    const id = await readJobId(accepted)

    const { body } = await pollUntilFinished(id, 30_000)
    expect(body.status).toBe('error')
    expect(body.error).toBe('NETWORK_ERROR')
    expect(JSON.stringify(body)).not.toContain('never-listening')
    expect(JSON.stringify(body)).not.toContain('127.0.0.1')
  }, 45_000)
})
