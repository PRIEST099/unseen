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
    async activeId() {
      return null
    },
    async focusableIds() {
      return all
    },
    async styles() {
      return { 'outline-style': 'none' }
    },
    async unfocusedStyles() {
      return { 'outline-style': 'none' }
    },
    async anyShown() {
      return true
    },
    navigated: () => false,
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
    async activeId() {
      return null
    },
    async focusableIds() {
      return all
    },
    async styles() {
      return { 'outline-style': 'none' }
    },
    async unfocusedStyles() {
      return { 'outline-style': 'none' }
    },
    async anyShown() {
      return true
    },
    navigated: () => false,
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

  it('property: a repeat of element j at step k (before every focusable is visited) gives exactly seq[j..k] starting at step j', async () => {
    await fc.assert(
      fc.asyncProperty(
        ids('u', 3, 20).chain((all) =>
          fc.integer({ min: 0, max: all.length - 2 }).chain((k) =>
            fc.integer({ min: 0, max: k }).map((j) => ({ all, k, j }))
          )
        ),
        async ({ all, k, j }) => {
          const seq = all.slice(0, k + 1)
          const r = await runWalk(scripted(all, [...seq, all[j]!], { escapeTest: async () => all[j]! }))
          const c = r.cycles[0]
          return (
            r.cycles.length === 1 &&
            c !== undefined &&
            JSON.stringify(c.nodeIds) === JSON.stringify(seq.slice(j)) &&
            c.startStepIndex === j &&
            c.includesAllFocusables === (seq.slice(j).length === all.length)
          )
        }
      ),
      { numRuns: 200 }
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

describe('Tab walk after prepare(): focus that came back (findings 5 and 6)', () => {
  const focusedLook = { 'outline-style': 'solid' }
  const plainLook = { 'outline-style': 'none' }

  it('records the still-focused element as the first step, with its unfocused baseline', async () => {
    const reads: string[] = []
    const r = await runWalk(
      scripted(['a', 'f', 'b'], ['b', null], {
        activeId: async () => 'f',
        styles: async (id: string) => {
          reads.push(id)
          return focusedLook
        },
        unfocusedStyles: async () => plainLook,
      })
    )
    expect(r.steps[0]).toMatchObject({ backendDOMNodeId: 'f', cdpError: false })
    expect(r.steps[0]!.focusSnapshot).toEqual({ before: plainLook, after: focusedLook })
    expect(r.steps.map((s) => s.backendDOMNodeId)).toEqual(['f', 'b'])
    // the baseline of the focused element never came from a plain read while it held focus
    expect(reads.filter((id) => id === 'f').length).toBe(1)
  })

  it('a baseline that cannot be read for the focused element marks the step cdpError', async () => {
    const r = await runWalk(
      scripted(['f', 'b'], ['b', null], { activeId: async () => 'f', unfocusedStyles: async () => null })
    )
    expect(r.steps[0]).toMatchObject({ backendDOMNodeId: 'f', cdpError: true })
  })

  it('a focused element that is not a focusable is not recorded', async () => {
    const r = await runWalk(scripted(['a'], ['a', null], { activeId: async () => 'zzz' }))
    expect(r.steps.map((s) => s.backendDOMNodeId)).toEqual(['a'])
  })

  it('a focusable that first appears mid-walk gets an on-demand baseline, not {}', async () => {
    const r = await runWalk(
      scripted(['a'], ['a', 'late', null], {
        styles: async (id: string) => (id === 'late' ? { 'outline-style': 'solid' } : { 'outline-style': 'none' }),
        unfocusedStyles: async () => ({ 'outline-style': 'none' }),
      })
    )
    const late = r.steps[1]!
    expect(late.backendDOMNodeId).toBe('late')
    expect(late.focusSnapshot.before).toEqual({ 'outline-style': 'none' })
    expect(late.focusSnapshot.after).toEqual({ 'outline-style': 'solid' })
    expect(late.baselineUnavailable).toBeUndefined()
  })

  it('an on-demand baseline that cannot be taken is flagged, not left as a silent {}', async () => {
    const r = await runWalk(scripted(['a'], ['a', 'late', null], { unfocusedStyles: async () => null }))
    expect(r.steps[1]).toMatchObject({ backendDOMNodeId: 'late', baselineUnavailable: true, cdpError: false })
    expect(r.steps[1]!.focusSnapshot.before).toEqual({})
  })
})

describe('Tab walk escape test (hauntings.md §5, Req 11.8)', () => {
  it('no focus after Escape and the cycle is still shown: a trap', async () => {
    const r = await runWalk(
      scripted(['a', 'b', 'c'], ['a', 'b', 'a'], { escapeTest: async () => null, anyShown: async () => true })
    )
    expect(r.trapDetected).toBe(true)
    expect(r.endReason).toBe('trap')
    expect(r.cycles[0]!.escapable).toBe(false)
  })

  it('no focus after Escape because the cycle was removed or hidden: the user escaped', async () => {
    const r = await runWalk(
      scripted(['a', 'b', 'c'], ['a', 'b', 'a', 'c', null], { escapeTest: async () => null, anyShown: async () => false })
    )
    expect(r.trapDetected).toBe(false)
    expect(r.cycles).toHaveLength(1)
    expect(r.cycles[0]).toMatchObject({ nodeIds: ['a', 'b'], escapable: true })
    // detection restarts: the walk goes on and reaches c
    expect(r.steps.map((s) => s.backendDOMNodeId)).toContain('c')
    expect(r.endReason).toBe('body')
  })

  it('an unreadable "is the cycle shown" check ends with cdp-error and never invents a trap', async () => {
    const r = await runWalk(
      scripted(['a', 'b', 'c'], ['a', 'b', 'a'], {
        escapeTest: async () => null,
        anyShown: async () => {
          throw new Error('gone')
        },
      })
    )
    expect(r.trapDetected).toBe(false)
    expect(r.endReason).toBe('cdp-error')
  })

  it('segment reset (Req 11.7): after an escapable cycle an element seen before the cycle is new again', async () => {
    const r = await runWalk(
      scripted(['a', 'b', 'c', 'd'], ['a', 'b', 'a', 'a', 'd', null], { escapeTest: async () => 'c' })
    )
    expect(r.cycles).toHaveLength(1)
    expect(r.endReason).toBe('body')
    expect(r.steps.map((s) => s.backendDOMNodeId)).toEqual(['a', 'b', 'a', 'c', 'a', 'd'])
  })

  it('a cycle that can only be left backwards ends with cycle-repeated, not at the step cap', async () => {
    const all = ['x', 'a', 'b', 'y', 'z']
    const r = await runWalk(
      scripted(all, ['x', 'a', 'b', 'a', 'a', 'b', 'a', 'b', 'a'], { escapeTest: async () => 'x' })
    )
    expect(r.endReason).toBe('cycle-repeated')
    expect(r.stepCapReached).toBe(false)
    expect(r.trapDetected).toBe(false)
    expect(r.cycles).toHaveLength(2)
    expect(r.cycles.every((c) => c.escapable === true)).toBe(true)
  })

  it('includesAllFocusables is about the members, and escapable is absent when no escape test ran', async () => {
    const r = await runWalk(scripted(['a', 'b', 'c'], ['a', 'b', 'c', 'b']))
    expect(r.endReason).toBe('cycle-includes-all')
    expect(r.cycles[0]).toEqual({
      nodeIds: ['b', 'c'],
      startStepIndex: 1,
      includesAllFocusables: false,
      allFocusablesVisited: true,
    })
  })
})

describe('Tab walk composites (finding 1)', () => {
  const host = { isComposite: async (id: string) => id === 'f' }

  it('presses inside a host do not use steps: a 60-link frame does not hide what follows', async () => {
    const all = ['f', 'two', 'three', 'four']
    const r = await runWalk(scripted(all, ['f', ...Array<string>(60).fill('f'), 'two', 'three', 'four', null], host))
    expect(r.steps.map((s) => s.backendDOMNodeId)).toEqual(['f', 'two', 'three', 'four'])
    expect(r.steps[0]!.compositeTruncated).toBe(true)
    expect(r.endReason).toBe('body')
    expect(r.errors).toEqual([])
  })

  it('a host that is left within the sub-cap is not truncated', async () => {
    const r = await runWalk(scripted(['f', 'z'], ['f', ...Array<string>(30).fill('f'), 'z', null], host))
    expect(r.steps[0]!.compositeTruncated).toBeUndefined()
  })

  it('focus that never leaves a host ends with composite-stuck and a collection error', async () => {
    const r = await runWalk(scripted(['f', 'two'], ['f'], host))
    expect(r.endReason).toBe('composite-stuck')
    expect(r.stepCapReached).toBe(false)
    expect(r.trapDetected).toBe(false)
    expect(r.steps).toHaveLength(1)
    expect(r.steps[0]!.compositeTruncated).toBe(true)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ step: 'tab-walk' })
  })
})

describe('Tab walk navigation (finding 10)', () => {
  it('a mid-walk navigation ends the walk with navigated', async () => {
    let navigated = false
    let presses = 0
    const r = await runWalk(
      scripted(['a', 'b', 'c'], [], {
        pressTab: async () => {
          presses++
          if (presses === 2) navigated = true
          return presses === 1 ? 'a' : 'b'
        },
        navigated: () => navigated,
      })
    )
    expect(r.endReason).toBe('navigated')
    expect(r.steps.map((s) => s.backendDOMNodeId)).toEqual(['a'])
  })
})

describe('Tab walk: focus on a host whose inside cannot be read', () => {
  it('marks the step of such a host innerFocusUnreadable, and only that step', async () => {
    const r = await runWalk(scripted(['a', 'f', 'b'], ['a', 'f', 'b', null], { innerUnreadable: async (id: string) => id === 'f' }))
    expect(r.steps.map((s) => [s.backendDOMNodeId, s.innerFocusUnreadable === true])).toEqual([
      ['a', false],
      ['f', true],
      ['b', false],
    ])
  })

  it('a driver that cannot tell, or throws, leaves the step unmarked', async () => {
    const throwing = await runWalk(scripted(['a'], ['a', null], { innerUnreadable: async () => { throw new Error('cdp') } }))
    expect(throwing.steps[0]?.innerFocusUnreadable).toBeUndefined()
    const plain = await runWalk(scripted(['a'], ['a', null]))
    expect(plain.steps[0]?.innerFocusUnreadable).toBeUndefined()
  })
})