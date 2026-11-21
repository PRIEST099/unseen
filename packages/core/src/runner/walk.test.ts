import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { runWalk, type TabDriver } from './tab-walker.js'

/**
 * Fake page: Tab cycles through `cycle` until the escape test is run, then
 * focus moves to `after[0]` and Tab walks `after` in order, then body (null).
 */
function fakeDriver(cycle: string[], after: string[], trap = false): TabDriver {
  let escaped = false
  let ci = -1
  let ai = 0
  const all = [...cycle, ...after]
  return {
    async focusableIds() {
      return all
    },
    async styles() {
      return { 'outline-style': 'none' }
    },
    async pressTab() {
      if (!escaped) {
        ci = (ci + 1) % cycle.length
        return cycle[ci]!
      }
      ai++
      return ai < after.length ? after[ai]! : null
    },
    async escapeTest() {
      if (trap) return cycle[ci]!
      escaped = true
      ai = 0
      return after[0] ?? null
    },
    async regionOf() {
      return 'region'
    },
  }
}

const ids = (prefix: string, min: number, max: number) =>
  fc.integer({ min, max }).map((n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`))

describe('Tab walk segmenting (hauntings.md §5)', () => {
  it('property: an escapable cycle followed by N unseen elements visits all N', async () => {
    await fc.assert(
      fc.asyncProperty(ids('c', 2, 5), ids('x', 1, 30), async (cycle, after) => {
        const r = await runWalk(fakeDriver(cycle, after))
        const visited = new Set(r.steps.map((s) => s.backendDOMNodeId))
        return (
          !r.trapDetected &&
          r.cycles.length >= 1 &&
          r.cycles[0]!.escapable === true &&
          after.slice(1).every((x) => visited.has(x)) &&
          r.endReason === 'body'
        )
      }),
      { numRuns: 100 }
    )
  })

  it('property: a non-escapable cycle is declared a trap with its region first', async () => {
    await fc.assert(
      fc.asyncProperty(ids('c', 2, 5), ids('x', 1, 10), async (cycle, after) => {
        const r = await runWalk(fakeDriver(cycle, after, true))
        return (
          r.trapDetected &&
          r.trapRegionNodeIds[0] === 'region' &&
          cycle.every((c) => r.trapRegionNodeIds.includes(c)) &&
          r.endReason === 'trap'
        )
      }),
      { numRuns: 100 }
    )
  })

  it('returns early with no focusables', async () => {
    const d = fakeDriver([], [])
    d.focusableIds = async () => []
    const r = await runWalk(d)
    expect(r).toMatchObject({ steps: [], trapDetected: false, stepCapReached: false, endReason: 'no-focusables' })
  })

  it('a cycle covering every focusable is not a trap', async () => {
    const r = await runWalk(fakeDriver(['a', 'b', 'c'], [], true))
    expect(r.trapDetected).toBe(false)
    expect(r.endReason).toBe('cycle-includes-all')
    expect(r.cycles[0]!.includesAllFocusables).toBe(true)
  })
})
