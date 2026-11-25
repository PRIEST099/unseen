import { test, expect } from 'vitest'
import * as fc from 'fast-check'
import { isCritical } from '../../src/pure/critical.js'
import { severityArb, typeArb } from '../arbitraries/haunting.js'

const RUNS = { numRuns: 100 }

test('property P4: every Wraith is critical', async () => {
  await fc.assert(
    fc.asyncProperty(typeArb, async (type) => {
      expect(isCritical({ severity: 'Wraith', type })).toBe(true)
    }),
    RUNS
  )
})

test('property P4: a non-Wraith is critical exactly when its type is NamelessSpirit, WhisperingField or CursedLoop', async () => {
  await fc.assert(
    fc.asyncProperty(typeArb, fc.constantFrom('Restless' as const, 'Banished' as const), async (type, severity) => {
      const expected = type === 'NamelessSpirit' || type === 'WhisperingField' || type === 'CursedLoop'
      expect(isCritical({ severity, type })).toBe(expected)
    }),
    RUNS
  )
})

test('property P4: the result depends only on severity and type', async () => {
  await fc.assert(
    fc.asyncProperty(severityArb, typeArb, async (severity, type) => {
      expect(isCritical({ severity, type })).toBe(isCritical({ type, severity }))
    }),
    RUNS
  )
})
