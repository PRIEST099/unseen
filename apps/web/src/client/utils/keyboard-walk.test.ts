import type { BoundingBox, Haunting, TabCycle, TabStep, TabWalkResult } from '@the-unseen/core'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import checkoutJson from '../../../samples/cursed-shop-checkout.json'
import { SAMPLE_AUDIT } from '../test-support/audit-arbitraries'
import { makeHaunting } from '../test-support/haunting-arbitraries'
import { isClassifiedAudit } from './audit-source'
import {
  boxesByNode,
  buildWalkModel,
  ESCAPABLE_LAPS,
  frameEvents,
  ghostBoxAt,
  hasPassed,
  parseWalkSpeed,
  planSoulReveals,
  revealedSoulIds,
  speechByNode,
  STEP_MS,
  stepCaption,
  stepIntervalMs,
  TRAP_LAPS,
  TRAPPED_TEXT,
  WALK_SPEED_OPTIONS,
} from './keyboard-walk'

function step(index: number, nodeId: number): TabStep {
  return { index, backendDOMNodeId: String(nodeId), focusSnapshot: { before: {}, after: {} }, cdpError: false }
}

function walkOf(nodeIds: readonly number[], cycles: TabCycle[] = []): TabWalkResult {
  return {
    steps: nodeIds.map((id, index) => step(index, id)),
    trapDetected: false,
    trapRegionNodeIds: [],
    stepCapReached: false,
    cycles,
    walkStartedAtMs: 0,
    endReason: 'body',
  }
}

function cycleOf(nodeIds: readonly number[], startStepIndex: number, escapable: boolean): TabCycle {
  return { nodeIds: nodeIds.map(String), startStepIndex, escapable, includesAllFocusables: false, allFocusablesVisited: false }
}

function box(nodeId: number, x: number, y: number, width = 50, height = 20): BoundingBox {
  return { backendDOMNodeId: nodeId, x, y, width, height }
}

function soul(id: string, x: number, y: number): Haunting {
  return makeHaunting({ id, type: 'LostSoul', nodeIds: [900], box: box(900, x, y, 40, 40) })
}

function nodesOf(frames: ReadonlyArray<{ nodeId: number }>): number[] {
  return frames.map((frame) => frame.nodeId)
}

describe('step timing and speed', () => {
  it('is 300 ms at 1x, never 0, and shorter at higher speeds', () => {
    expect(stepIntervalMs(1)).toBe(STEP_MS)
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 100, noNaN: true }), fc.double({ min: 0.01, max: 100, noNaN: true }), (a, b) => {
        const [slow, fast] = a <= b ? [a, b] : [b, a]
        expect(stepIntervalMs(slow)).toBeGreaterThanOrEqual(stepIntervalMs(fast))
        expect(stepIntervalMs(fast)).toBeGreaterThan(0)
      }),
    )
  })

  it('parses only the offered speeds and falls back to 1x', () => {
    for (const option of WALK_SPEED_OPTIONS) expect(parseWalkSpeed(String(option))).toBe(option)
    expect(parseWalkSpeed('3')).toBe(1)
    expect(parseWalkSpeed('x')).toBe(1)
  })
})

describe('buildWalkModel without cycles', () => {
  it('has one frame per recorded step, in order', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 500 }), { maxLength: 60 }), (ids) => {
        const model = buildWalkModel(walkOf(ids), [])
        expect(nodesOf(model.frames)).toEqual(ids)
        expect(model.frames.map((frame) => frame.stepIndex)).toEqual(ids.map((_, index) => index))
        expect(model.stepCount).toBe(ids.length)
        expect(model.trap).toBeNull()
      }),
    )
  })
})

describe('escapable cycles', () => {
  it('circles the members twice, then breaks free and continues', () => {
    const model = buildWalkModel(walkOf([1, 2, 3, 4, 3, 5, 6], [cycleOf([3, 4], 2, true)]), [])
    expect(nodesOf(model.frames)).toEqual([1, 2, 3, 4, 3, 4, 3, 5, 6])
    expect(model.frames.map((frame) => frame.cycle?.lap)).toEqual([undefined, undefined, 1, 1, 1, 2, 2, undefined, undefined])
    expect(model.trap).toBeNull()
    expect(model.frames.some((frame) => frame.trapped === true)).toBe(false)
  })

  it('adds exactly one extra lap to any cycle and keeps the steps before and after it', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.integer({ min: 1000, max: 1100 }), { maxLength: 6 }),
        fc.array(fc.integer({ min: 2000, max: 2100 }), { maxLength: 6 }),
        (size, before, after) => {
          const members = Array.from({ length: size }, (_, index) => 500 + index)
          const recorded = [...before, ...members, members[0] ?? 500, ...after]
          const model = buildWalkModel(walkOf(recorded, [cycleOf(members, before.length, true)]), [])
          const nodes = nodesOf(model.frames)
          expect(nodes.length).toBe(recorded.length + size * (ESCAPABLE_LAPS - 1))
          expect(nodes.slice(0, before.length)).toEqual(before)
          expect(nodes.slice(nodes.length - after.length)).toEqual(after)
          // The recorded step numbers still run 0..n-1 in order, so the caption's "Step i of n" is honest.
          const stepIndexes = model.frames.map((frame) => frame.stepIndex)
          expect([...stepIndexes].sort((a, b) => a - b)).toEqual(stepIndexes)
        },
      ),
    )
  })

  it('leaves a cycle alone when the walk never comes back to its first member', () => {
    const model = buildWalkModel(walkOf([1, 2, 3], [cycleOf([2, 3], 1, true)]), [])
    expect(nodesOf(model.frames)).toEqual([1, 2, 3])
  })

  it('does not treat an escapable Cursed Loop haunting as a trap', () => {
    const loop = makeHaunting({ type: 'CursedLoop', nodeIds: [3, 4] })
    const model = buildWalkModel(walkOf([1, 3, 4, 3, 5], [cycleOf([3, 4], 1, true)]), [loop])
    expect(model.trap).toBeNull()
    expect(nodesOf(model.frames)).toEqual([1, 3, 4, 3, 4, 3, 5])
  })
})

describe('inescapable Cursed Loops', () => {
  const loop = makeHaunting({ id: 'loop', type: 'CursedLoop', nodeIds: [2, 3, 228], box: box(2, 100, 100, 200, 100) })

  it('circles three times and stops with the ghost stuck inside', () => {
    const model = buildWalkModel(walkOf([3, 228, 3], [cycleOf([3, 228], 0, false)]), [loop])
    expect(nodesOf(model.frames)).toEqual([3, 228, 3, 228, 3, 228, 3])
    expect(model.frames.at(-1)?.trapped).toBe(true)
    expect(model.frames.filter((frame) => frame.trapped === true)).toHaveLength(1)
    expect(model.trap).toEqual({ haunting: loop, entryFrame: 0 })
  })

  it('shows three laps however many the recording holds, and nothing after the trap', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 2, max: 4 }), fc.array(fc.integer({ min: 1, max: 9 }), { maxLength: 5 }), (laps, size, before) => {
        const members = Array.from({ length: size }, (_, index) => 700 + index)
        const oneLap = members
        const recorded = [...before, ...Array.from({ length: laps }, () => oneLap).flat(), members[0] ?? 700, 42]
        const trapLoop = makeHaunting({ type: 'CursedLoop', nodeIds: members })
        const model = buildWalkModel(walkOf(recorded, [cycleOf(members, before.length, false)]), [trapLoop])
        const nodes = nodesOf(model.frames)
        expect(nodes.length).toBe(before.length + size * TRAP_LAPS + 1)
        expect(nodes).not.toContain(42)
        expect(model.frames.at(-1)?.trapped).toBe(true)
        expect(model.trap?.entryFrame).toBe(before.length)
      }),
    )
  })

  it('stops after the last step inside the trap when no recorded cycle matches', () => {
    const model = buildWalkModel(walkOf([1, 3, 228, 9], []), [loop])
    expect(nodesOf(model.frames)).toEqual([1, 3, 228])
    expect(model.frames.at(-1)?.trapped).toBe(true)
    expect(model.trap?.entryFrame).toBe(1)
  })

  it('has no trap when the Cursed Loop is never walked', () => {
    expect(buildWalkModel(walkOf([1, 2], []), [makeHaunting({ type: 'CursedLoop', nodeIds: [77] })]).trap).toBeNull()
  })
})

describe('committed samples', () => {
  it('circles the escapable cycle in the Home sample twice', () => {
    const walk = SAMPLE_AUDIT.raw.tabWalkResult
    const model = buildWalkModel(walk, SAMPLE_AUDIT.hauntings)
    expect(model.frames).toHaveLength(walk.steps.length + 2)
    // Node ids change each time the samples are rebuilt; the shape is what matters: A, B, A, B, A, then out to C.
    const [a, b, a2, b2, a3, c] = nodesOf(model.frames).slice(19, 25)
    expect([a2, b2, a3]).toEqual([a, b, a])
    expect(new Set([a, b, c]).size).toBe(3)
    expect(model.trap).toBeNull()
  })

  it('traps the ghost in the Checkout sample', () => {
    if (!isClassifiedAudit(checkoutJson.result)) throw new Error('checkout sample is not a ClassifiedAudit')
    const model = buildWalkModel(checkoutJson.result.raw.tabWalkResult, checkoutJson.result.hauntings)
    expect(model.frames).toHaveLength(7)
    expect(model.trap?.entryFrame).toBe(0)
    expect(model.frames.at(-1)?.trapped).toBe(true)
  })
})

describe('Lost Soul reveals', () => {
  it('counts a soul as passed once a step is at or below it in reading order', () => {
    const soulAt = { x: 100, y: 200 }
    expect(hasPassed({ x: 0, y: 300 }, soulAt)).toBe(true)
    expect(hasPassed({ x: 500, y: 200 }, soulAt)).toBe(true)
    expect(hasPassed({ x: 100, y: 200 }, soulAt)).toBe(true)
    expect(hasPassed({ x: 50, y: 200 }, soulAt)).toBe(false)
    expect(hasPassed({ x: 900, y: 100 }, soulAt)).toBe(false)
  })

  it('stays passed as the step moves later in reading order', () => {
    const point = fc.record({ x: fc.integer({ min: 0, max: 20 }), y: fc.integer({ min: 0, max: 20 }) })
    fc.assert(
      fc.property(point, point, point, (target, early, late) => {
        const [first, second] = early.y < late.y || (early.y === late.y && early.x <= late.x) ? [early, late] : [late, early]
        if (hasPassed(first, target)) expect(hasPassed(second, target)).toBe(true)
      }),
    )
  })

  it('reveals a soul at the step that passes it, and keeps it revealed', () => {
    const frames = buildWalkModel(walkOf([1, 2, 3]), []).frames
    const boxes = boxesByNode([box(1, 10, 100), box(2, 10, 400), box(3, 10, 700)])
    const middle = soul('between-1-and-2', 200, 250)
    const plan = planSoulReveals(frames, boxes, [middle], false)
    expect(plan.map((souls) => souls.length)).toEqual([0, 1, 0])
    expect([...revealedSoulIds(plan, 0)]).toEqual([])
    expect([...revealedSoulIds(plan, 1)]).toEqual(['between-1-and-2'])
    expect([...revealedSoulIds(plan, 2)]).toEqual(['between-1-and-2'])
  })

  it('reveals every soul exactly once by the end of a walk that is not trapped', () => {
    const arbSoul = fc.record({ x: fc.integer({ min: 0, max: 1200 }), y: fc.integer({ min: 0, max: 3000 }) })
    fc.assert(
      fc.property(fc.array(arbSoul, { maxLength: 15 }), fc.array(arbSoul, { minLength: 1, maxLength: 12 }), (soulSpots, stopSpots) => {
        const ids = stopSpots.map((_, index) => index + 1)
        const frames = buildWalkModel(walkOf(ids), []).frames
        const boxes = boxesByNode(stopSpots.map((spot, index) => box(index + 1, spot.x, spot.y)))
        const souls = soulSpots.map((spot, index) => soul(`s${index}`, spot.x, spot.y))
        const plan = planSoulReveals(frames, boxes, souls, false)
        const everyReveal = plan.flat().map((entry) => entry.id)
        expect(new Set(everyReveal).size).toBe(everyReveal.length)
        expect([...revealedSoulIds(plan, frames.length - 1)].sort()).toEqual(souls.map((entry) => entry.id).sort())
      }),
    )
  })

  it('does not reveal souls after the last step when the ghost is trapped', () => {
    const frames = buildWalkModel(walkOf([1, 2]), []).frames
    const boxes = boxesByNode([box(1, 10, 100), box(2, 10, 200)])
    const plan = planSoulReveals(frames, boxes, [soul('after', 10, 900)], true)
    expect(revealedSoulIds(plan, 1).size).toBe(0)
  })

  it('reveals the souls of the Home sample, all of them by the end of the walk', () => {
    const model = buildWalkModel(SAMPLE_AUDIT.raw.tabWalkResult, SAMPLE_AUDIT.hauntings)
    const plan = planSoulReveals(model.frames, boxesByNode(SAMPLE_AUDIT.raw.boundingBoxes), SAMPLE_AUDIT.hauntings, false)
    const total = SAMPLE_AUDIT.hauntings.filter((haunting) => haunting.type === 'LostSoul').length
    expect(total).toBeGreaterThan(0)
    expect(revealedSoulIds(plan, model.frames.length - 1).size).toBe(total)
    expect(revealedSoulIds(plan, 0).size).toBeLessThan(total)
  })
})

describe('ghost position, captions and events', () => {
  it('stays on the last element that has a box when a step has none', () => {
    const frames = buildWalkModel(walkOf([1, 2, 3]), []).frames
    const boxes = boxesByNode([box(1, 10, 10), box(3, 30, 30)])
    expect(ghostBoxAt(frames, boxes, 0)?.backendDOMNodeId).toBe(1)
    expect(ghostBoxAt(frames, boxes, 1)?.backendDOMNodeId).toBe(1)
    expect(ghostBoxAt(frames, boxes, 2)?.backendDOMNodeId).toBe(3)
    expect(ghostBoxAt(frames, new Map(), 2)).toBeNull()
  })

  it('writes "Step i of n: speech" with the first speech line of the node', () => {
    const speech = speechByNode([
      { backendDOMNodeId: 4, text: 'Add to cart, button' },
      { backendDOMNodeId: 4, text: 'second line' },
    ])
    expect(stepCaption({ stepIndex: 2, nodeId: 4 }, 38, speech)).toBe('Step 3 of 38: Add to cart, button')
    expect(stepCaption({ stepIndex: 0, nodeId: 99 }, 5, speech)).toBe('Step 1 of 5: element')
  })

  it('lists skipped Lost Souls, cycle laps and the trap as event lines', () => {
    expect(frameEvents({ stepIndex: 0, nodeId: 1 }, [])).toEqual([])
    expect(frameEvents({ stepIndex: 0, nodeId: 1 }, ['div', 'span'])).toEqual(['Lost Soul skipped: div, span'])
    expect(frameEvents({ stepIndex: 3, nodeId: 1, cycle: { lap: 2, laps: 2, trap: false } }, [])).toEqual(['Escapable cycle: lap 2 of 2, then breaking free'])
    const trapped = frameEvents({ stepIndex: 3, nodeId: 1, cycle: { lap: 3, laps: 3, trap: true }, trapped: true }, [])
    expect(trapped).toContain('Cursed Loop: trapped')
    expect(trapped).toContain(TRAPPED_TEXT)
  })
})
