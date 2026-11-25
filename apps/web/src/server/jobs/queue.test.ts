import { describe, expect, it } from 'vitest'
import { JobQueue, QueueFullError } from './queue.js'

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void }

function deferred(): Deferred {
  let resolve: () => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A queue whose jobs run until the test releases them. */
function controlledQueue(options: { maxConcurrency?: number; maxQueueDepth?: number; onError?: (e: unknown, id: string) => void } = {}): {
  queue: JobQueue
  started: string[]
  release: (id: string) => void
  fail: (id: string, error: unknown) => void
} {
  const gates = new Map<string, Deferred>()
  const started: string[] = []
  const queue = new JobQueue({
    ...options,
    execute: (id) => {
      started.push(id)
      const gate = deferred()
      gates.set(id, gate)
      return gate.promise
    },
  })
  return {
    queue,
    started,
    release: (id) => gates.get(id)?.resolve(),
    fail: (id, error) => gates.get(id)?.reject(error),
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('JobQueue', () => {
  it('runs jobs first-in first-out', async () => {
    const { queue, started, release } = controlledQueue({ maxConcurrency: 1 })
    for (const id of ['a', 'b', 'c', 'd']) queue.enqueue(id)
    expect(started).toEqual(['a'])
    for (const id of ['a', 'b', 'c']) {
      release(id)
      await tick()
    }
    expect(started).toEqual(['a', 'b', 'c', 'd'])
  })

  it('never runs more than maxConcurrency jobs and starts waiting ones as slots free', async () => {
    const { queue, started, release } = controlledQueue({ maxConcurrency: 2 })
    for (const id of ['a', 'b', 'c', 'd', 'e']) queue.enqueue(id)
    expect(queue.active).toBe(2)
    expect(queue.waiting).toBe(3)
    expect(started).toEqual(['a', 'b'])

    release('a')
    await tick()
    expect(queue.active).toBe(2)
    expect(started).toEqual(['a', 'b', 'c'])
    expect(queue.waiting).toBe(2)
  })

  it('defaults to a concurrency of 2 and clamps the cap to 1-20', () => {
    const execute = (): Promise<void> => new Promise<void>(() => undefined)
    expect(new JobQueue({ execute }).maxConcurrency).toBe(2)
    expect(new JobQueue({ execute, maxConcurrency: 0 }).maxConcurrency).toBe(1)
    expect(new JobQueue({ execute, maxConcurrency: 99 }).maxConcurrency).toBe(20)
    expect(new JobQueue({ execute, maxConcurrency: Number.NaN }).maxConcurrency).toBe(2)
  })

  it('accepts 20 waiting jobs and rejects the 21st with QueueFullError', () => {
    const { queue } = controlledQueue({ maxConcurrency: 1 })
    queue.enqueue('running')
    for (let i = 0; i < 20; i++) queue.enqueue(`waiting-${i}`)
    expect(queue.waiting).toBe(20)
    expect(queue.isFull()).toBe(true)
    expect(() => queue.enqueue('one-too-many')).toThrow(QueueFullError)
    expect(queue.waiting).toBe(20)
  })

  it('does not count running jobs toward the queue depth', () => {
    const { queue } = controlledQueue({ maxConcurrency: 2 })
    for (let i = 0; i < 22; i++) queue.enqueue(`job-${i}`)
    expect(queue.active).toBe(2)
    expect(queue.waiting).toBe(20)
    expect(() => queue.enqueue('extra')).toThrow(QueueFullError)
  })

  it('frees the slot and keeps going when a job rejects, reporting it through onError', async () => {
    const errors: Array<[unknown, string]> = []
    const { queue, started, fail } = controlledQueue({
      maxConcurrency: 1,
      onError: (error, id) => errors.push([error, id]),
    })
    queue.enqueue('a')
    queue.enqueue('b')
    const boom = new Error('boom')
    fail('a', boom)
    await tick()
    expect(started).toEqual(['a', 'b'])
    expect(errors).toEqual([[boom, 'a']])
  })
})
