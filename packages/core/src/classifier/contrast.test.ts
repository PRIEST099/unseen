import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arbRgb } from '../../tests/classifier/arbitraries.js'
import { contrastRatio, relativeLuminance } from './contrast.js'

const RUNS = { numRuns: 200 }
const BLACK = { r: 0, g: 0, b: 0 }
const WHITE = { r: 255, g: 255, b: 255 }

describe('contrast properties', () => {
  // Feature: haunting-classifier, Property 7: Contrast ratio is symmetric
  it('Property 7: contrast ratio is symmetric', () => {
    fc.assert(fc.property(arbRgb, arbRgb, (a, b) => contrastRatio(a, b) === contrastRatio(b, a)), RUNS)
  })

  // Feature: haunting-classifier, Property 8: Contrast ratio is bounded
  it('Property 8: contrast ratio is in [1, 21]', () => {
    fc.assert(
      fc.property(arbRgb, arbRgb, (a, b) => {
        const r = contrastRatio(a, b)
        return r >= 1 && r <= 21
      }),
      RUNS
    )
  })

  // Feature: haunting-classifier, Property 9: Identical colors have ratio 1
  it('Property 9: identical colours have ratio exactly 1', () => {
    fc.assert(fc.property(arbRgb, (c) => contrastRatio(c, c) === 1), RUNS)
  })

  // Feature: haunting-classifier, Property 19: Luminance monotonicity
  it('Property 19: raising any channel never lowers relative luminance', () => {
    fc.assert(
      fc.property(arbRgb, fc.constantFrom<'r' | 'g' | 'b'>('r', 'g', 'b'), fc.integer({ min: 0, max: 255 }), (c, channel, raised) => {
        const higher = { ...c, [channel]: Math.max(c[channel], raised) }
        return relativeLuminance(higher) >= relativeLuminance(c)
      }),
      RUNS
    )
  })

  // Feature: haunting-classifier, Property 19: Luminance monotonicity (contrast side)
  it('Property 19: against a fixed darker colour, contrast grows with the lighter colour luminance', () => {
    fc.assert(
      fc.property(arbRgb, arbRgb, arbRgb, (dark, x, y) => {
        const [lo, hi] = relativeLuminance(x) <= relativeLuminance(y) ? [x, y] : [y, x]
        if (relativeLuminance(lo) < relativeLuminance(dark)) return true // only the lighter-than-dark side is claimed
        return contrastRatio(dark, hi) >= contrastRatio(dark, lo)
      }),
      RUNS
    )
  })

  it('luminance is within [0, 1]', () => {
    fc.assert(fc.property(arbRgb, (c) => relativeLuminance(c) >= 0 && relativeLuminance(c) <= 1), RUNS)
  })
})

describe('contrast examples', () => {
  it('black on white and white on black are 21:1', () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21)
    expect(contrastRatio(WHITE, BLACK)).toBe(21)
  })

  it('luminance of black is 0 and of white is 1', () => {
    expect(relativeLuminance(BLACK)).toBe(0)
    expect(relativeLuminance(WHITE)).toBe(1)
  })

  it('mid-grey combinations match known values', () => {
    // #777 on white is the classic 4.48:1 failure; #767676 is the lightest grey that passes 4.5:1
    expect(contrastRatio({ r: 0x77, g: 0x77, b: 0x77 }, WHITE)).toBeCloseTo(4.48, 2)
    expect(contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, WHITE)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio({ r: 128, g: 128, b: 128 }, BLACK)).toBeCloseTo(5.32, 2)
    expect(contrastRatio({ r: 128, g: 128, b: 128 }, WHITE)).toBeCloseTo(3.95, 2)
  })

  it('applies the 0.03928 gamma knee', () => {
    expect(relativeLuminance({ r: 10, g: 10, b: 10 })).toBeCloseTo(10 / 255 / 12.92, 6)
    expect(relativeLuminance({ r: 255, g: 0, b: 0 })).toBeCloseTo(0.2126, 6)
  })
})
