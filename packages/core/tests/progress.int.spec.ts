import { test, expect } from '@playwright/test'
import * as fc from 'fast-check'
import { auditAndClassify, auditHtml, getPool } from '../src/index.js'
import type { ProgressStage } from '../src/index.js'
import { startTestServer, type TestServer } from './fixtures/test-server.js'

const MINIMAL_HTML =
  '<!doctype html><html lang="en"><head><title>Progress</title></head><body><main><h1>Progress</h1><button>Go</button></main></body></html>'
// The first focus anywhere on the page (the Tab walk) tells the server, so the test can place it on the timeline.
const FOCUS_BEACON_HTML =
  '<!doctype html><html lang="en"><head><title>Start order</title></head><body><main><h1>Start order</h1>' +
  '<button>One</button><button>Two</button><a href="#x">Three</a></main>' +
  "<script>document.addEventListener('focusin', () => { fetch('/focused', { keepalive: true }) }, { once: true })</script>" +
  '</body></html>'
const STAGES: readonly ProgressStage[] = ['loading', 'tree', 'walking', 'classifying']

/** Server-side events and progress stages, in the order they happened. */
const timeline: string[] = []

let server: TestServer
test.beforeAll(async () => {
  server = await startTestServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path === '/start-order') {
      timeline.push('request:/start-order')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(FOCUS_BEACON_HTML)
      return
    }
    if (path === '/focused') {
      timeline.push('focus:first')
      res.writeHead(204).end()
      return
    }
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

test('each stage is reported when it starts: loading before the page request, walking before the first Tab focus', async () => {
  test.setTimeout(60_000)
  timeline.length = 0
  const audit = await auditAndClassify(`${server.baseUrl}/start-order`, {
    allowPrivate: true,
    onProgress: (stage) => {
      timeline.push(`stage:${stage}`)
    },
  })
  expect(audit.raw.tabWalkResult.steps.length).toBeGreaterThan(0)
  const stages = timeline.filter((e) => e.startsWith('stage:'))
  expect(stages).toEqual(STAGES.map((s) => `stage:${s}`))
  // The page cannot be requested before loadPage runs, so a "loading" reported at the start comes first.
  expect(timeline.indexOf('stage:loading')).toBeLessThan(timeline.indexOf('request:/start-order'))
  // Nothing focuses the page before the Tab walk, so "walking" reported at the start precedes the first focus.
  expect(timeline).toContain('focus:first')
  expect(timeline.indexOf('stage:tree')).toBeLessThan(timeline.indexOf('focus:first'))
  expect(timeline.indexOf('stage:walking')).toBeLessThan(timeline.indexOf('focus:first'))
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
