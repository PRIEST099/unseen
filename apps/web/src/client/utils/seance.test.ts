import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import {
  activeStageLabel,
  CLEAN_ANNOUNCEMENT,
  completedStages,
  completionAnnouncement,
  describeJobError,
  fetchJobPoll,
  formatElapsed,
  MAX_POLL_RETRIES,
  parseJobPoll,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  retryDelayMs,
  STAGE_LABELS,
} from './seance'
import type { JobStages } from './seance'

describe('activeStageLabel', () => {
  it('names the stage being worked on, one past the last stage the worker reported', () => {
    expect(activeStageLabel('queued')).toBe('Loading page…')
    expect(activeStageLabel('loading')).toBe('Reading accessibility tree…')
    expect(activeStageLabel('tree')).toBe('Walking the keyboard path…')
    expect(activeStageLabel('walking')).toBe('Classifying hauntings…')
    expect(activeStageLabel('classifying')).toBe('Classifying hauntings…')
  })
})

describe('completedStages', () => {
  it('measures each finished stage from the previous timestamp', () => {
    const stages: JobStages = { queued: 1000, loading: 2200, tree: 2700 }
    expect(completedStages(stages)).toEqual([
      { stage: 'loading', label: 'Loading page…', elapsedMs: 1200 },
      { stage: 'tree', label: 'Reading accessibility tree…', elapsedMs: 500 },
    ])
  })

  it('times classifying from its start to done', () => {
    const stages: JobStages = { queued: 0, loading: 10, tree: 20, walking: 30, classifying: 31, done: 431 }
    expect(completedStages(stages).map((s) => s.elapsedMs)).toEqual([10, 10, 10, 400])
  })

  it('lists nothing before any stage is reached', () => {
    expect(completedStages({ queued: 5 })).toEqual([])
  })

  const timeline = fc
    .array(fc.integer({ min: 0, max: 20_000 }), { minLength: 6, maxLength: 6 })
    .map((gaps): JobStages => {
      let at = 1_700_000_000_000
      const next = (): number => (at += gaps.shift() ?? 0)
      return { queued: next(), loading: next(), tree: next(), walking: next(), classifying: next(), done: next() }
    })

  it('property: stages come out in order, once each, with non-negative durations', () => {
    fc.assert(
      fc.property(timeline, fc.constantFrom<keyof JobStages>('done', 'classifying', 'walking', 'tree', 'loading'), (stages, cutAt) => {
        const truncated: JobStages = { ...stages }
        // A job that stopped part-way has no timestamps after `cutAt`.
        const order: Array<keyof JobStages> = ['queued', 'loading', 'tree', 'walking', 'classifying', 'done']
        for (const key of order.slice(order.indexOf(cutAt) + 1)) delete truncated[key]
        const names = completedStages(truncated).map((s) => s.stage)
        const expected = (['loading', 'tree', 'walking', 'classifying'] as const).filter((name) => names.includes(name))
        expect(names).toEqual(expected)
        for (const stage of completedStages(truncated)) {
          expect(stage.elapsedMs).toBeGreaterThanOrEqual(0)
          expect(stage.label).toBe(STAGE_LABELS[stage.stage])
        }
      }),
    )
  })
})

describe('formatElapsed', () => {
  it('shows seconds with one decimal', () => {
    expect(formatElapsed(1234)).toBe('1.2s')
    expect(formatElapsed(0)).toBe('0.0s')
    expect(formatElapsed(-5)).toBe('0.0s')
  })
})

describe('describeJobError', () => {
  it('uses the user-facing text for each known code and the server message otherwise', () => {
    expect(describeJobError('TIMEOUT', 'x')).toMatch(/60s limit/)
    expect(describeJobError('SSRF_BLOCKED', 'x')).toMatch(/private or internal/)
    expect(describeJobError('RESOURCE_LIMIT', 'x')).toMatch(/50MB/)
    expect(describeJobError('NETWORK_ERROR', 'x')).toMatch(/Could not load the page/)
    expect(describeJobError('WHAT', 'Server said so')).toBe('Server said so')
    expect(describeJobError('WHAT', '')).not.toBe('')
  })
})

describe('parseJobPoll', () => {
  it('reads running statuses with their stage timestamps and ignores junk', () => {
    expect(parseJobPoll({ status: 'queued' })).toEqual({ kind: 'running', status: 'queued', stages: {} })
    expect(parseJobPoll({ status: 'tree', stages: { queued: 1, loading: 2, tree: 'x', other: 3 } })).toEqual({
      kind: 'running',
      status: 'tree',
      stages: { queued: 1, loading: 2 },
    })
  })

  it('reads a done job with its audit and an error job with a mapped message', () => {
    const done = parseJobPoll({ status: 'done', result: SAMPLE_AUDIT, stages: { done: 9 } })
    expect(done.kind).toBe('done')
    expect(parseJobPoll({ status: 'done', result: { nope: true } })).toEqual({ kind: 'not-found' })
    expect(parseJobPoll({ status: 'error', error: 'TIMEOUT', message: 'raw' })).toMatchObject({ kind: 'error', code: 'TIMEOUT' })
  })

  it('treats unknown bodies as unreachable', () => {
    expect(parseJobPoll(null)).toEqual({ kind: 'unreachable' })
    expect(parseJobPoll({ status: 'bogus' })).toEqual({ kind: 'unreachable' })
  })
})

describe('fetchJobPoll', () => {
  it('maps 404, other failures and thrown errors without a network', async () => {
    const respond = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status })
    expect(await fetchJobPoll('a', undefined, respond(404, {}))).toEqual({ kind: 'not-found' })
    expect(await fetchJobPoll('a', undefined, respond(500, {}))).toEqual({ kind: 'unreachable' })
    expect(await fetchJobPoll('a', undefined, respond(200, { status: 'loading', stages: { queued: 1 } }))).toMatchObject({
      kind: 'running',
      status: 'loading',
    })
    const throwing: typeof fetch = async () => {
      throw new TypeError('offline')
    }
    expect(await fetchJobPoll('a', undefined, throwing)).toEqual({ kind: 'unreachable' })
  })
})

describe('retryDelayMs', () => {
  it('doubles from one second: 1 s, 2 s, 4 s for the three retries', () => {
    expect([0, 1, 2].map(retryDelayMs)).toEqual([1000, 2000, 4000])
    expect(MAX_POLL_RETRIES).toBe(3)
  })

  it('property: non-decreasing, doubles until the cap, and always within 1 s to 30 s', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), (retry) => {
        const delay = retryDelayMs(retry)
        expect(delay).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS)
        expect(delay).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS)
        expect(retryDelayMs(retry + 1)).toBeGreaterThanOrEqual(delay)
        expect(retryDelayMs(retry + 1)).toBe(Math.min(delay * 2, RETRY_MAX_DELAY_MS))
      }),
    )
  })

  it('property: any input gives a finite delay in range', () => {
    fc.assert(
      fc.property(fc.oneof(fc.double({ noNaN: false }), fc.integer()), (retry) => {
        const delay = retryDelayMs(retry)
        expect(Number.isFinite(delay)).toBe(true)
        expect(delay).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS)
        expect(delay).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS)
      }),
    )
  })
})

describe('completionAnnouncement for a clean audit', () => {
  it('says that no hauntings were found and that a manual review is still needed, never "compliant"', () => {
    const clean = { ...SAMPLE_AUDIT, hauntings: [], score: 0 }
    expect(completionAnnouncement(clean)).toBe(CLEAN_ANNOUNCEMENT)
    expect(completionAnnouncement(clean)).not.toMatch(/compliant/i)
    expect(completionAnnouncement(clean)).toMatch(/manual review is still needed/)
  })
})

describe('completionAnnouncement', () => {
  it('states the haunting count and the score', () => {
    const audit = SAMPLE_AUDIT
    expect(completionAnnouncement(audit)).toBe(
      `Audit complete: ${audit.hauntings.length} hauntings found, Haunting Score ${audit.score}`,
    )
  })
})
