import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { stepCap } from './tab-walker.js'

// Cycle detection is tested through runWalk in walk.test.ts: runWalk is the only implementation.

// Feature: audit-engine, Property 4: stepCap invariants
// stepCap(0) === 10
// stepCap(n) > stepCap(n - 1) for n > 0 (strictly monotone)
// stepCap(n) >= 10 always
describe('Property 4: stepCap invariants', () => {
  it('stepCap(0) === 10', () => {
    expect(stepCap(0)).toBe(10)
  })

  it('stepCap is strictly monotone for n > 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (n) => {
        return stepCap(n) > stepCap(n - 1)
      }),
      { numRuns: 100 }
    )
  })

  it('stepCap(n) >= 10 for all n', () => {
    fc.assert(
      fc.property(fc.nat(1000), (n) => {
        return stepCap(n) >= 10
      }),
      { numRuns: 100 }
    )
  })
})

describe('stepCap unit tests', () => {
  it('returns correct value for focusableCount = 0', () => {
    expect(stepCap(0)).toBe(10)
  })

  it('returns correct value for focusableCount = 1', () => {
    expect(stepCap(1)).toBe(12)
  })

  it('returns correct value for focusableCount = 10', () => {
    expect(stepCap(10)).toBe(30)
  })
})
