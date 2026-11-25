import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import {
  activeStageLabel,
  canCancel,
  CLEAN_ANNOUNCEMENT,
  completedStages,
  completionAnnouncement,
  describeJobError,
  fetchJobPoll,
  formatElapsed,
  MAX_POLL_RETRIES,
  parseJobPoll,
  PENDING_STATE,
  POLL_INTERVAL_MS,
  pollStep,
  RETRYING_MESSAGE,
  RETRYING_STATE,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  retryDelayMs,
  seanceStatusText,
  SESSION_ENDED_MESSAGE,
  STAGE_LABELS,
  UNREACHABLE_MESSAGE,
} from './seance'
import type { JobPoll, JobStages, SeanceState } from './seance'

describe('activeStageLabel', () => {
  it('names the stage the worker reported as started; a queued job is shown as loading', () => {
    expect(activeStageLabel('queued')).toBe('Loading page…')
    expect(activeStageLabel('loading')).toBe('Loading page…')
    expect(activeStageLabel('tree')).toBe('Reading accessibility tree…')
    expect(activeStageLabel('walking')).toBe('Walking the keyboard path…')
    expect(activeStageLabel('classifying')).toBe('Classifying hauntings…')
  })
})

describe('completedStages', () => {
  it('measures each finished stage from its own start to the next stage start, without queue wait', () => {
    const stages: JobStages = { queued: 1000, loading: 2200, tree: 2700 }
    expect(completedStages(stages)).toEqual([{ stage: 'loading', label: 'Loading page…', elapsedMs: 500 }])
  })

  it('times classifying from its start to done', () => {
    const stages: JobStages = { queued: 0, loading: 10, tree: 20, walking: 30, classifying: 31, done: 431 }
    expect(completedStages(stages).map((s) => s.elapsedMs)).toEqual([10, 10, 1, 400])
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

describe('pollStep', () => {
  const running: SeanceState = { phase: 'running', status: 'tree', stages: { queued: 1 } }
  const unreachable: JobPoll = { kind: 'unreachable' }

  it('a running answer shows the stage, resets the retry budget and polls again in 500 ms', () => {
    const step = pollStep(RETRYING_STATE, { kind: 'running', status: 'loading', stages: { queued: 1 } }, 2)
    expect(step).toEqual({ state: { phase: 'running', status: 'loading', stages: { queued: 1 } }, retries: 0, delayMs: POLL_INTERVAL_MS })
  })

  it('done, error and not-found stop polling', () => {
    expect(pollStep(running, { kind: 'done', audit: SAMPLE_AUDIT, stages: {} }, 0)).toMatchObject({ state: { phase: 'done' }, delayMs: null })
    expect(pollStep(running, { kind: 'error', code: 'TIMEOUT', message: 'm' }, 0)).toMatchObject({
      state: { phase: 'failed', reason: 'error', message: 'm' },
      delayMs: null,
    })
    expect(pollStep(PENDING_STATE, { kind: 'not-found' }, 0)).toMatchObject({
      state: { phase: 'failed', reason: 'ended', message: SESSION_ENDED_MESSAGE },
      delayMs: null,
    })
  })

  it('a failed poll before any answer moves to retrying instead of sitting silent', () => {
    expect(pollStep(PENDING_STATE, unreachable, 0)).toEqual({ state: RETRYING_STATE, retries: 1, delayMs: RETRY_BASE_DELAY_MS })
    expect(pollStep(RETRYING_STATE, unreachable, 1)).toEqual({ state: RETRYING_STATE, retries: 2, delayMs: 2 * RETRY_BASE_DELAY_MS })
  })

  it('a running séance keeps its stage through a dropped poll', () => {
    expect(pollStep(running, unreachable, 0)).toEqual({ state: running, retries: 1, delayMs: RETRY_BASE_DELAY_MS })
  })

  it('gives up with the unreachable error once the retries are used', () => {
    expect(pollStep(RETRYING_STATE, unreachable, MAX_POLL_RETRIES)).toEqual({
      state: { phase: 'failed', reason: 'unreachable', message: UNREACHABLE_MESSAGE },
      retries: MAX_POLL_RETRIES,
      delayMs: null,
    })
  })

  it('property: from pending, consecutive failures wait 1 s, 2 s, 4 s and then fail', () => {
    fc.assert(
      fc.property(fc.constantFrom<SeanceState>(PENDING_STATE, RETRYING_STATE), (start) => {
        let state = start
        let retries = 0
        const delays: Array<number | null> = []
        for (let i = 0; i <= MAX_POLL_RETRIES; i++) {
          const step = pollStep(state, unreachable, retries)
          state = step.state
          retries = step.retries
          delays.push(step.delayMs)
        }
        expect(delays).toEqual([1000, 2000, 4000, null])
        expect(state).toMatchObject({ phase: 'failed', reason: 'unreachable' })
      }),
    )
  })
})

describe('seanceStatusText', () => {
  it('is empty before the first answer, names the stage while running, and says so while retrying', () => {
    expect(seanceStatusText(PENDING_STATE)).toBe('')
    expect(seanceStatusText({ phase: 'running', status: 'queued', stages: {} })).toBe(STAGE_LABELS.loading)
    expect(seanceStatusText(RETRYING_STATE)).toBe(RETRYING_MESSAGE)
    expect(RETRYING_MESSAGE).toBe('Trying to reach the server again…')
    expect(seanceStatusText({ phase: 'failed', reason: 'unreachable', message: UNREACHABLE_MESSAGE })).toBe('')
  })
})

describe('canCancel', () => {
  it('offers Cancel only while the audit is pending or running', () => {
    expect(canCancel(PENDING_STATE)).toBe(true)
    expect(canCancel({ phase: 'running', status: 'walking', stages: {} })).toBe(true)
    expect(canCancel(RETRYING_STATE)).toBe(false)
    expect(canCancel({ phase: 'done', audit: SAMPLE_AUDIT, stages: {} })).toBe(false)
    expect(canCancel({ phase: 'failed', reason: 'error', message: 'm' })).toBe(false)
  })
})

describe('SESSION_ENDED_MESSAGE', () => {
  it('promises the same one-hour expiry the server enforces', () => {
    expect(SESSION_ENDED_MESSAGE).toMatch(/expire after 1 hour/)
  })
})
