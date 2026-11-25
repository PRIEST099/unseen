import { afterEach, describe, expect, it } from 'vitest'
import { loadSampleAudit } from '../test-support/sample-audit.js'
import { JobStore, RESULT_TTL_MS } from './store.js'
import type { Job } from './types.js'

const MINUTE = 60_000

let clock = 0
const stores: JobStore[] = []

function makeStore(options: ConstructorParameters<typeof JobStore>[0] = {}): JobStore {
  const store = new JobStore({ now: () => clock, ...options })
  stores.push(store)
  return store
}

function doneJob(id: string, at: number): Job {
  return {
    id,
    url: 'https://example.test/',
    status: 'done',
    stages: { queued: at, done: at },
    createdAt: at,
    updatedAt: at,
    screenshotPng: 'aGVsbG8=',
  }
}

afterEach(() => {
  for (const store of stores.splice(0)) store.stopCleanup()
  clock = 0
})

describe('JobStore', () => {
  it('sets, gets and deletes jobs', () => {
    const store = makeStore()
    store.set(doneJob('a', 0))
    expect(store.get('a')?.id).toBe('a')
    store.delete('a')
    expect(store.get('a')).toBeUndefined()
  })

  it('update is functional, sees the current job and bumps updatedAt', () => {
    const store = makeStore()
    store.set({ ...doneJob('a', 0), status: 'queued', stages: { queued: 1 } })
    clock = 500
    store.update('a', (job) => ({ status: 'loading', stages: { ...job.stages, loading: 2 } }))
    expect(store.get('a')).toMatchObject({ status: 'loading', stages: { queued: 1, loading: 2 }, updatedAt: 500 })
  })

  it('update of an unknown id does nothing', () => {
    const store = makeStore()
    store.update('missing', () => ({ status: 'error' }))
    expect(store.size).toBe(0)
  })

  it('removes jobs idle for more than one hour', () => {
    const store = makeStore()
    store.set(doneJob('old', 0))
    store.set(doneJob('fresh', 30 * MINUTE))
    clock = 61 * MINUTE
    store.sweep()
    expect(store.get('old')).toBeUndefined()
    expect(store.get('fresh')).toBeDefined()
  })

  it('keeps a job at exactly one hour and removes it just after', () => {
    const store = makeStore()
    store.set(doneJob('edge', 0))
    clock = 60 * MINUTE
    store.sweep()
    expect(store.get('edge')).toBeDefined()
    clock = 60 * MINUTE + 1
    store.sweep()
    expect(store.get('edge')).toBeUndefined()
  })

  it('keeps a finished result for one hour by default, matching the "expire after 1 hour" copy', () => {
    expect(RESULT_TTL_MS).toBe(60 * MINUTE)
    const store = makeStore()
    store.set({ ...doneJob('a', 0), result: loadSampleAudit() })
    clock = 59 * MINUTE
    store.sweep()
    expect(store.get('a')?.result).toBeDefined()
    expect(store.get('a')?.screenshotPng).toBeDefined()
    clock = 60 * MINUTE + 1
    store.sweep()
    expect(store.get('a')?.result).toBeUndefined()
  })

  it('with a shorter result TTL, drops the result and screenshot but keeps the metadata', () => {
    const store = makeStore({ resultTtlMs: 15 * MINUTE })
    store.set({ ...doneJob('a', 0), result: loadSampleAudit() })
    clock = 14 * MINUTE
    store.sweep()
    expect(store.get('a')?.result).toBeDefined()
    expect(store.get('a')?.screenshotPng).toBeDefined()
    clock = 16 * MINUTE
    store.sweep()
    const kept = store.get('a')
    expect(kept).toMatchObject({ id: 'a', status: 'done', stages: { queued: 0, done: 0 } })
    expect(kept?.result).toBeUndefined()
    expect(kept?.screenshotPng).toBeUndefined()
  })

  it('does not drop results of jobs that are not done', () => {
    const store = makeStore()
    store.set({ ...doneJob('running', 0), status: 'walking', screenshotPng: undefined })
    clock = 20 * MINUTE
    store.sweep()
    expect(store.get('running')).toBeDefined()
  })

  it('keeps at most 50 done jobs, the newest by updatedAt (LRU)', () => {
    const store = makeStore()
    for (let i = 0; i < 60; i++) store.set(doneJob(`job-${i}`, i))
    clock = 100
    store.sweep()
    expect(store.size).toBe(50)
    expect(store.get('job-9')).toBeUndefined()
    expect(store.get('job-10')).toBeDefined()
    expect(store.get('job-59')).toBeDefined()
  })

  it('the 50-job cap counts only done jobs', () => {
    const store = makeStore()
    for (let i = 0; i < 50; i++) store.set(doneJob(`done-${i}`, i))
    store.set({ ...doneJob('queued', 0), status: 'queued' })
    store.set({ ...doneJob('failed', 0), status: 'error' })
    clock = 100
    store.sweep()
    expect(store.size).toBe(52)
  })

  it('startCleanup returns an unref\'d timer that sweeps on its interval and can be stopped', async () => {
    const store = makeStore({ cleanupIntervalMs: 10 })
    store.set(doneJob('old', -2 * 60 * MINUTE))
    const timer = store.startCleanup()
    expect(timer.hasRef()).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(store.get('old')).toBeUndefined()

    store.stopCleanup()
    store.set(doneJob('later', -2 * 60 * MINUTE))
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(store.get('later')).toBeDefined()
  })
})
