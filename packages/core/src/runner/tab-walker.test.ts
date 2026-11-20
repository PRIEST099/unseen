import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { stepCap, detectCycle } from './tab-walker.js'

// Feature: audit-engine, Property 1: detectCycle — no-cycle invariant
// For any sequence of step IDs with no repeated element, detectCycle should return { hasCycle: false }
describe('Property 1: detectCycle — no-cycle invariant', () => {
  it('returns no cycle for arrays of unique strings', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1 }), (uniqueSteps) => {
        // Make sure all steps are unique
        const uniqueArray = Array.from(new Set(uniqueSteps))
        const result = detectCycle(uniqueArray, uniqueArray.length)
        return result.hasCycle === false
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: audit-engine, Property 2: detectCycle — cycle detection before full visit
// For any sequence where a repeat appears before focusableCount unique IDs are seen,
// detectCycle should return { hasCycle: true } with non-empty cycleNodeIds
describe('Property 2: detectCycle — cycle detection before full visit', () => {
  it('detects cycle when repeat appears before all focusables visited', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }).chain((n) =>
          fc.tuple(
            fc.array(fc.string({ minLength: 1 }), { minLength: n, maxLength: n }),
            fc.integer({ min: 0, max: n - 2 })
          ).map(([ids, repeatAt]) => {
            // Create a sequence where the first ID is repeated at repeatAt + 1
            const steps = [...ids.slice(0, repeatAt + 1), ids[0], ...ids.slice(repeatAt + 1)]
            return { steps, focusableCount: n + 1 }
          })
        ),
        ({ steps, focusableCount }) => {
          const result = detectCycle(steps, focusableCount)
          return result.hasCycle === true && result.cycleNodeIds.length > 0
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: audit-engine, Property 3: detectCycle — cycleNodeIds subset invariant
// Every ID in cycleNodeIds should also appear in steps
describe('Property 3: detectCycle — cycleNodeIds subset invariant', () => {
  it('cycleNodeIds are always subset of steps', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { maxLength: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (steps, focusableCount) => {
          const result = detectCycle(steps, focusableCount)
          if (result.cycleNodeIds.length > 0) {
            return result.cycleNodeIds.every((id) => steps.includes(id))
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

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

// Unit tests
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

describe('detectCycle unit tests', () => {
  it('returns no cycle for unique steps', () => {
    const steps = ['a', 'b', 'c', 'd']
    const result = detectCycle(steps, 4)
    expect(result).toEqual({
      hasCycle: false,
      cycleStart: -1,
      cycleNodeIds: [],
    })
  })

  it('detects simple cycle', () => {
    const steps = ['a', 'b', 'c', 'a', 'd']
    const result = detectCycle(steps, 4)
    expect(result.hasCycle).toBe(true)
    expect(result.cycleStart).toBe(0)
    expect(result.cycleNodeIds).toEqual(['a', 'b', 'c'])
  })

  it('detects cycle when repeat happens early', () => {
    const steps = ['a', 'b', 'a', 'c', 'd']
    const result = detectCycle(steps, 4)
    expect(result.hasCycle).toBe(true)
    expect(result.cycleStart).toBe(0)
    expect(result.cycleNodeIds).toEqual(['a', 'b'])
  })

  it('does not detect cycle when all focusables visited first', () => {
    const steps = ['a', 'b', 'c', 'd', 'a']
    const result = detectCycle(steps, 4)
    expect(result.hasCycle).toBe(false)
  })
})
