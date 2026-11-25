import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbHaunting, arbRect, makeHaunting } from '../test-support/haunting-arbitraries'
import { hitRect, MIN_HIT_SIZE, overlayBox, placeOverlays, sortByReadingOrder, stackingLevels } from './overlay-geometry'

const EPSILON = 1e-6
const stageSize = fc.record({
  width: fc.double({ min: 200, max: 1400, noNaN: true }),
  height: fc.double({ min: 200, max: 9000, noNaN: true }),
})
const scale = fc.double({ min: 0.2, max: 1, noNaN: true })

describe('hitRect (requirement 10.7)', () => {
  it('grows a small box to 24x24 around its centre', () => {
    const rect = hitRect({ x: 100, y: 100, width: 10, height: 10 }, 1, { width: 1000, height: 1000 })
    expect(rect).toEqual({ x: 93, y: 93, width: MIN_HIT_SIZE, height: MIN_HIT_SIZE })
  })

  it('keeps a large box as the scaled box', () => {
    const rect = hitRect({ x: 100, y: 200, width: 400, height: 300 }, 0.5, { width: 1000, height: 1000 })
    expect(rect).toEqual({ x: 50, y: 100, width: 200, height: 150 })
  })

  it('is at least 24x24, stays inside the stage and contains the scaled box', () => {
    fc.assert(
      fc.property(arbRect, scale, stageSize, (box, factor, stage) => {
        const rect = hitRect(box, factor, stage)
        expect(rect.width).toBeGreaterThanOrEqual(Math.min(MIN_HIT_SIZE, stage.width) - EPSILON)
        expect(rect.height).toBeGreaterThanOrEqual(Math.min(MIN_HIT_SIZE, stage.height) - EPSILON)
        expect(rect.x).toBeGreaterThanOrEqual(-EPSILON)
        expect(rect.y).toBeGreaterThanOrEqual(-EPSILON)
        expect(rect.x + rect.width).toBeLessThanOrEqual(stage.width + EPSILON)
        expect(rect.y + rect.height).toBeLessThanOrEqual(stage.height + EPSILON)
        const left = Math.min(box.x * factor, stage.width)
        const right = Math.min((box.x + box.width) * factor, stage.width)
        expect(rect.x).toBeLessThanOrEqual(left + EPSILON)
        expect(rect.x + rect.width).toBeGreaterThanOrEqual(right - EPSILON)
      }),
    )
  })

  it('is centred on the box when the box is far from the stage edges', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: 100, max: 500, noNaN: true }),
          y: fc.double({ min: 100, max: 500, noNaN: true }),
          width: fc.double({ min: 0, max: 60, noNaN: true }),
          height: fc.double({ min: 0, max: 60, noNaN: true }),
        }),
        (box) => {
          const rect = hitRect(box, 1, { width: 1000, height: 1000 })
          expect(rect.x + rect.width / 2).toBeCloseTo(box.x + box.width / 2, 6)
          expect(rect.y + rect.height / 2).toBeCloseTo(box.y + box.height / 2, 6)
        },
      ),
    )
  })
})

describe('reading order', () => {
  it('sorts top to bottom, then left to right, and is a permutation', () => {
    fc.assert(
      fc.property(fc.array(arbRect, { maxLength: 40 }), (rects) => {
        const sorted = sortByReadingOrder(rects, (rect) => rect)
        expect(sorted).toHaveLength(rects.length)
        for (let index = 1; index < sorted.length; index += 1) {
          const previous = sorted[index - 1]
          const current = sorted[index]
          if (previous === undefined || current === undefined) continue
          expect(previous.y < current.y || (previous.y === current.y && previous.x <= current.x)).toBe(true)
        }
        expect([...sorted].sort((a, b) => a.x - b.x || a.y - b.y)).toEqual([...rects].sort((a, b) => a.x - b.x || a.y - b.y))
      }),
    )
  })

  it('is stable for equal positions', () => {
    const items = [
      { id: 'a', x: 5, y: 5, width: 1, height: 1 },
      { id: 'b', x: 5, y: 5, width: 1, height: 1 },
      { id: 'c', x: 5, y: 5, width: 1, height: 1 },
    ]
    expect(sortByReadingOrder(items, (item) => item).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('placeOverlays', () => {
  it('drops hauntings without a box and Shattered Order, and puts Silent Tongue first', () => {
    const placed = placeOverlays(
      [
        makeHaunting({ id: 'late', box: { backendDOMNodeId: 1, x: 0, y: 500, width: 10, height: 10 } }),
        makeHaunting({ id: 'none', box: null }),
        makeHaunting({ id: 'order', type: 'ShatteredOrder', kind: 'no-h1', box: { backendDOMNodeId: 2, x: 0, y: 1, width: 5, height: 5 } }),
        makeHaunting({ id: 'lang', type: 'SilentTongue', box: null }),
      ],
      1280,
    )
    expect(placed.map((item) => item.haunting.id)).toEqual(['lang', 'late'])
    expect(placed[0]?.box).toEqual({ x: 0, y: 0, width: 1280, height: 40 })
  })

  it('returns only hauntings that have a box, in reading order', () => {
    fc.assert(
      fc.property(fc.array(arbHaunting, { maxLength: 30 }), (hauntings) => {
        const placed = placeOverlays(hauntings, 1280)
        const expected = hauntings.filter((haunting) => overlayBox(haunting, 1280) !== null)
        expect(placed).toHaveLength(expected.length)
        for (let index = 1; index < placed.length; index += 1) {
          const previous = placed[index - 1]?.box
          const current = placed[index]?.box
          if (previous === undefined || current === undefined) continue
          expect(previous.y <= current.y).toBe(true)
        }
      }),
    )
  })
})

describe('stackingLevels', () => {
  it('layers smaller rectangles above larger ones, with distinct levels', () => {
    fc.assert(
      fc.property(fc.array(arbRect, { maxLength: 30 }), (rects) => {
        const levels = stackingLevels(rects)
        expect(new Set(levels).size).toBe(rects.length)
        rects.forEach((first, i) => {
          rects.forEach((second, j) => {
            if (first.width * first.height < second.width * second.height) {
              expect(levels[i] ?? 0).toBeGreaterThan(levels[j] ?? 0)
            }
          })
        })
      }),
    )
  })
})
