import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { runWalk, stepCap, type TabDriver } from './tab-walker.js'

/**
 * Fake page: Tab cycles through `cycle` until the escape test is run, then
 * focus lands on `after[0]` (the escape landing) and Tab walks the rest of
 * `after` in order, then body (null).
 */
function fakeDriver(cycle: string[], after: string[], trap = false): TabDriver {
  let escaped = false
  let ci = -1
  let ai = 0
  const all = [...cycle, ...after]
  return {
    async prepare() {},
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
    async isComposite() {
      return false
    },
  }
}

/** A driver built from a scripted Tab sequence. */
function scripted(all: string[], tabs: Array<string | null | Error>, overrides: Partial<TabDriver> = {}): TabDriver {
  let i = 0
  return {
    async prepare() {},
    async focusableIds() {
      return all
    },
    async styles() {
      return { 'outline-style': 'none' }
    },
    async pressTab() {
      const next = tabs[Math.min(i++, tabs.length - 1)]
      if (next instanceof Error) throw next
      return next ?? null
    },
    async escapeTest() {
      return null
    },
    async regionOf() {
      return 'region'
    },
    async isComposite() {
      return false
    },
    ...overrides,
  }
}

const ids = (prefix: string, min: number, max: number) =>
  fc.integer({ min, max }).map((n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`))

describe('Tab walk segmenting (hauntings.md §5)', () => {
  it('property: an escapable cycle followed by N unseen elements visits all N, landing element included', async () => {
    await fc.assert(
      fc.asyncProperty(ids('c', 2, 5), ids('x', 1, 30), async (cycle, after) => {
        const r = await runWalk(fakeDriver(cycle, after))
        const visited = new Set(r.steps.map((s) => s.backendDOMNodeId))
        return (
          !r.trapDetected &&
          r.cycles.length >= 1 &&
          r.cycles[0]!.escapable === true &&
          after.every((x) => visited.has(x)) &&
          r.endReason === 'body'
        )
      }),
      { numRuns: 100 }
    )
  })

  it('property: step indexes are 0..n-1 in order and the cap spans segments', async () => {
    await fc.assert(
      fc.asyncProperty(ids('c', 2, 5), ids('x', 2, 30), async (cycle, after) => {
        const r = await runWalk(fakeDriver(cycle, after))
        return r.steps.every((s, i) => s.index === i) && r.steps.length <= stepCap(cycle.length + after.length)
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

describe('Tab walk cycle detection (design properties 1-3, through runWalk)', () => {
  it('property: a sequence with no repeats never reports a cycle', async () => {
    await fc.assert(
      fc.asyncProperty(ids('u', 1, 40), async (all) => {
        const r = await runWalk(scripted(all, [...all, null]))
        return r.cycles.length === 0 && !r.trapDetected && r.endReason === 'body'
      }),
      { numRuns: 100 }
    )
  })

  it('property: a repeat before all focusables are visited is a cycle whose members come from the steps', async () => {
    await fc.assert(
      fc.asyncProperty(ids('u', 3, 20), fc.integer({ min: 1, max: 2 }), async (all, repeatAt) => {
        const seq = [...all.slice(0, repeatAt + 1), all[0]!]
        const r = await runWalk(scripted(all, seq))
        const stepIds = new Set(r.steps.map((s) => s.backendDOMNodeId))
        return r.cycles.length === 1 && r.cycles[0]!.nodeIds.every((n) => stepIds.has(n)) && r.cycles[0]!.nodeIds[0] === all[0]
      }),
      { numRuns: 100 }
    )
  })

  it('property: a repeat after every focusable was visited is not a trap', async () => {
    await fc.assert(
      fc.asyncProperty(ids('u', 2, 20), async (all) => {
        const r = await runWalk(scripted(all, [...all, all[0]!]))
        return !r.trapDetected && r.endReason === 'cycle-includes-all'
      }),
      { numRuns: 100 }
    )
  })
})

describe('Tab walk limits and errors (Req 11.5, 11.9, 11.12)', () => {
  it('stops at the step cap across segments and sets stepCapReached', async () => {
    const all = ['a', 'b', 'c']
    let n = 0
    // never-ending distinct ids, so no cycle forms and only the cap can end the walk
    const d = scripted(all, [], { pressTab: async () => `n${n++}` })
    const r = await runWalk(d)
    expect(r.stepCapReached).toBe(true)
    expect(r.endReason).toBe('step-cap')
    expect(r.steps.length).toBe(stepCap(all.length))
  })

  it('the cap also bounds an escapable cycle followed by an endless sequence', async () => {
    const all = ['a', 'b', 'c', 'd']
    let n = 0
    let escaped = false
    const d = scripted(all, [], {
      escapeTest: async () => {
        escaped = true
        return 'out'
      },
      pressTab: async () => {
        if (escaped) return `n${n++}`
        return n++ % 2 === 0 ? 'a' : 'b'
      },
    })
    const r = await runWalk(d)
    expect(r.cycles[0]!.escapable).toBe(true)
    expect(r.stepCapReached).toBe(true)
    expect(r.steps.length).toBe(stepCap(all.length))
  })

  it('the escape landing element is recorded as a step with styles', async () => {
    const r = await runWalk(
      scripted(['a', 'b', 'c'], ['a', 'b', 'a', null], { escapeTest: async () => 'c' })
    )
    const ids = r.steps.map((s) => s.backendDOMNodeId)
    expect(ids).toEqual(['a', 'b', 'a', 'c'])
    expect(r.steps[3]!.focusSnapshot.after).toEqual({ 'outline-style': 'none' })
    expect(r.cycles[0]).toMatchObject({ escapable: true, startStepIndex: 0, nodeIds: ['a', 'b'] })
  })

  it('no element focused after the escape test is a trap (Req 11.8)', async () => {
    const r = await runWalk(scripted(['a', 'b', 'c'], ['a', 'b', 'a'], { escapeTest: async () => null }))
    expect(r.trapDetected).toBe(true)
    expect(r.endReason).toBe('trap')
    expect(r.trapRegionNodeIds).toEqual(expect.arrayContaining(['a', 'b']))
    expect(r.cycles[0]!.escapable).toBe(false)
  })

  it('endReason is no-focus when the first Tab lands on body, body afterwards', async () => {
    expect((await runWalk(scripted(['a'], [null]))).endReason).toBe('no-focus')
    expect((await runWalk(scripted(['a', 'b'], ['a', null]))).endReason).toBe('body')
  })

  it('a styles() failure marks cdpError and the walk continues', async () => {
    let calls = 0
    const r = await runWalk(
      scripted(['a', 'b'], ['a', 'b', null], {
        styles: async (id: string) => {
          calls++
          // baselines succeed (first two calls), the step read of "a" fails
          if (calls === 3 && id === 'a') throw new Error('boom')
          return { 'outline-style': 'none' }
        },
      })
    )
    expect(r.steps.map((s) => s.cdpError)).toEqual([true, false])
    expect(r.endReason).toBe('body')
  })

  it('a failed baseline read marks the step cdpError', async () => {
    let calls = 0
    const r = await runWalk(
      scripted(['a', 'b'], ['a', 'b', null], {
        styles: async () => {
          if (calls++ === 0) throw new Error('baseline failed')
          return { 'outline-style': 'none' }
        },
      })
    )
    expect(r.steps[0]!.cdpError).toBe(true)
    expect(r.steps[0]!.focusSnapshot.before).toEqual({})
  })

  it('a pressTab failure records a cdpError step and the walk continues', async () => {
    const r = await runWalk(scripted(['a', 'b'], [new Error('Execution context was destroyed'), 'a', 'b', null]))
    expect(r.steps[0]).toMatchObject({ cdpError: true, backendDOMNodeId: '' })
    expect(r.steps.slice(1).map((s) => s.backendDOMNodeId)).toEqual(['a', 'b'])
    expect(r.endReason).toBe('body')
  })

  it('repeated pressTab failures end the walk with cdp-error and do not throw', async () => {
    const r = await runWalk(scripted(['a'], [new Error('gone')]))
    expect(r.endReason).toBe('cdp-error')
    expect(r.trapDetected).toBe(false)
  })

  it('an escapeTest or regionOf failure never throws and never invents a trap', async () => {
    const esc = await runWalk(
      scripted(['a', 'b', 'c'], ['a', 'b', 'a'], {
        escapeTest: async () => {
          throw new Error('gone')
        },
      })
    )
    expect(esc.trapDetected).toBe(false)
    expect(esc.endReason).toBe('cdp-error')

    const region = await runWalk(
      scripted(['a', 'b', 'c'], ['a', 'b', 'a'], {
        escapeTest: async () => 'b',
        regionOf: async () => {
          throw new Error('gone')
        },
      })
    )
    expect(region.trapDetected).toBe(true)
    expect(region.trapRegionNodeIds).toEqual(['a', 'b'])
  })

  it('a focusableIds failure ends the walk with cdp-error', async () => {
    const r = await runWalk(
      scripted(['a'], ['a'], {
        focusableIds: async () => {
          throw new Error('gone')
        },
      })
    )
    expect(r.endReason).toBe('cdp-error')
  })

  it('consecutive repeats on a composite host are not a cycle', async () => {
    const r = await runWalk(
      scripted(['f', 'z'], ['f', 'f', 'f', 'z', null], { isComposite: async (id: string) => id === 'f' })
    )
    expect(r.trapDetected).toBe(false)
    expect(r.cycles).toEqual([])
    expect(r.endReason).toBe('body')
  })

  it('consecutive repeats on a plain element are a trap candidate', async () => {
    const r = await runWalk(scripted(['f', 'z'], ['f', 'f', 'f']))
    expect(r.cycles.length).toBe(1)
    expect(r.trapDetected).toBe(true)
  })
})
