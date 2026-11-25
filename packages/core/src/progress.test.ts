import { afterEach, expect, test, vi } from 'vitest'
import * as fc from 'fast-check'
import { emitProgress } from './progress.js'
import type { ProgressStage } from './types.js'

const stageArb: fc.Arbitrary<ProgressStage> = fc.constantFrom('loading', 'tree', 'walking', 'classifying')

afterEach(() => {
  vi.restoreAllMocks()
})

test('property: a callback receives the stage and the clock reading, exactly once per emit', async () => {
  await fc.assert(
    fc.asyncProperty(stageArb, fc.integer({ min: 0, max: 4_102_444_800_000 }), async (stage, at) => {
      const calls: Array<[ProgressStage, number]> = []
      emitProgress((s, atMs) => calls.push([s, atMs]), stage, () => at)
      expect(calls).toEqual([[stage, at]])
    }),
    { numRuns: 100 }
  )
})

test('property: a throwing callback never propagates, whatever it throws', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await fc.assert(
    fc.asyncProperty(stageArb, fc.anything(), async (stage, thrown) => {
      expect(() =>
        emitProgress(() => {
          throw thrown
        }, stage)
      ).not.toThrow()
    }),
    { numRuns: 100 }
  )
})

test('an absent callback is a no-op and never reads the clock', () => {
  const now = vi.fn(() => 1)
  expect(() => emitProgress(undefined, 'loading', now)).not.toThrow()
  expect(now).not.toHaveBeenCalled()
})

test('a throwing callback is logged with its stage', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  emitProgress(() => {
    throw new Error('boom')
  }, 'tree')
  expect(log).toHaveBeenCalledTimes(1)
  expect(String(log.mock.calls[0]?.[0])).toContain('tree')
  expect(String(log.mock.calls[0]?.[0])).toContain('boom')
})

test('a thrown value that cannot be stringified is still logged, not rethrown', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const unprintable = Object.create(null) as object // String() on this throws a TypeError
  expect(() =>
    emitProgress(() => {
      throw unprintable
    }, 'walking')
  ).not.toThrow()
  expect(log).toHaveBeenCalledTimes(1)
  expect(String(log.mock.calls[0]?.[0])).toContain('walking')
})
