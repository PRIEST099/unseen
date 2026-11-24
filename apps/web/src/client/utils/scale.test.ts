import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeScale } from './scale'

const dimension = fc.double({ min: 1, max: 20_000, noNaN: true })

describe('computeScale', () => {
  it('scales down to fit the container width', () => {
    const result = computeScale(1280, 900, 640)
    expect(result.scaleFactor).toBe(0.5)
    expect(result.scaledWidth).toBe(640)
    expect(result.scaledHeight).toBe(450)
  })

  it('never scales above 1:1', () => {
    const result = computeScale(800, 600, 1920)
    expect(result).toMatchObject({ scaleFactor: 1, scaledWidth: 800, scaledHeight: 600 })
  })

  it('rejects zero, negative and non-finite dimensions', () => {
    expect(() => computeScale(0, 100, 100)).toThrow(RangeError)
    expect(() => computeScale(100, -1, 100)).toThrow(RangeError)
    expect(() => computeScale(100, 100, Number.NaN)).toThrow(RangeError)
  })

  it('is deterministic, bounded and keeps the aspect ratio', () => {
    fc.assert(
      fc.property(dimension, dimension, dimension, (width, height, container) => {
        const first = computeScale(width, height, container)
        expect(computeScale(width, height, container)).toEqual(first)
        expect(first.scaleFactor).toBeGreaterThan(0)
        expect(first.scaleFactor).toBeLessThanOrEqual(1)
        expect(first.scaledWidth).toBeLessThanOrEqual(container + 1e-9)
        expect(first.scaledWidth / first.scaledHeight).toBeCloseTo(width / height, 6)
      }),
    )
  })

  it('a box scaled with the factor keeps its relative position in the screenshot', () => {
    fc.assert(
      fc.property(dimension, dimension, dimension, fc.double({ min: 0, max: 1, noNaN: true }), (width, height, container, fraction) => {
        const { scaleFactor, scaledWidth } = computeScale(width, height, container)
        expect((width * fraction * scaleFactor) / scaledWidth).toBeCloseTo(fraction, 6)
      }),
    )
  })
})
