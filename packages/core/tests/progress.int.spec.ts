import { test, expect } from '@playwright/test'
import * as fc from 'fast-check'
import { auditAndClassify, auditHtml, getPool } from '../src/index.js'
import type { ProgressStage } from '../src/index.js'
import { startTestServer, type TestServer } from './fixtures/test-server.js'

const MINIMAL_HTML =
  '<!doctype html><html lang="en"><head><title>Progress</title></head><body><main><h1>Progress</h1><button>Go</button></main></body></html>'
const STAGES: readonly ProgressStage[] = ['loading', 'tree', 'walking', 'classifying']

let server: TestServer
test.beforeAll(async () => {
  server = await startTestServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(MINIMAL_HTML)
  })
})
test.afterAll(async () => {
  await getPool().close()
  await server.close()
})

type Recorded = { stage: ProgressStage; atMs: number }

/** A callback that records every call, and throws for the stages in `throwAt`. */
function recorder(throwAt: ReadonlySet<ProgressStage>): { calls: Recorded[]; onProgress: (stage: ProgressStage, atMs: number) => void } {
  const calls: Recorded[] = []
  return {
    calls,
    onProgress: (stage, atMs) => {
      calls.push({ stage, atMs })
      if (throwAt.has(stage)) throw new Error(`callback failure at ${stage}`)
    },
  }
}

test('property: every stage is reported exactly once, in order, even when the callback throws', async () => {
  test.setTimeout(180_000)
  const throwingStages = fc.subarray([...STAGES])
  // Each run is a full browser audit (~3 s), so the run count is small.
  await fc.assert(
    fc.asyncProperty(throwingStages, async (throwAt) => {
      const { calls, onProgress } = recorder(new Set(throwAt))
      const audit = await auditAndClassify(`${server.baseUrl}/`, { allowPrivate: true, onProgress })
      expect(audit.raw.auditedUrl).toBe(`${server.baseUrl}/`)
      expect(calls.map((c) => c.stage)).toEqual([...STAGES])
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i - 1]!.atMs).toBeLessThan(calls[i]!.atMs)
      }
    }),
    { numRuns: 5 }
  )
})

test('without onProgress the audit behaves as before', async () => {
  test.setTimeout(60_000)
  const audit = await auditAndClassify(`${server.baseUrl}/`, { allowPrivate: true })
  expect(audit.score).toBeGreaterThanOrEqual(0)
})

test('auditHtml reports loading, tree and walking, and never classifying', async () => {
  test.setTimeout(60_000)
  const { calls, onProgress } = recorder(new Set())
  await auditHtml(MINIMAL_HTML, { onProgress })
  expect(calls.map((c) => c.stage)).toEqual(['loading', 'tree', 'walking'])
})

test('a failure before a stage is reached skips that stage and every later one', async () => {
  test.setTimeout(60_000)
  const { calls, onProgress } = recorder(new Set())
  await expect(auditAndClassify('http://127.0.0.1:9/', { onProgress })).rejects.toThrow(/SSRF blocked/)
  expect(calls).toEqual([])
})
