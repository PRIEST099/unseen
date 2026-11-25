import * as fc from 'fast-check'
import { describe, expect, it, test } from 'vitest'
import { normalizeScore, SCORE_EXPLANATION, scoreBandLabel, scoreOutOf } from './score-band'

const ORDER = ['no hauntings detected', 'lightly haunted', 'haunted', 'badly haunted', 'heavily haunted']

describe('scoreBandLabel', () => {
  it('names each band at its edges', () => {
    expect(scoreBandLabel(0)).toBe('no hauntings detected')
    expect(scoreBandLabel(1)).toBe('lightly haunted')
    expect(scoreBandLabel(29)).toBe('lightly haunted')
    expect(scoreBandLabel(30)).toBe('haunted')
    expect(scoreBandLabel(59)).toBe('haunted')
    expect(scoreBandLabel(60)).toBe('badly haunted')
    expect(scoreBandLabel(84)).toBe('badly haunted')
    expect(scoreBandLabel(85)).toBe('heavily haunted')
    expect(scoreBandLabel(98)).toBe('heavily haunted')
    expect(scoreBandLabel(100)).toBe('heavily haunted')
  })

  it('treats out-of-range and non-finite input safely', () => {
    expect(scoreBandLabel(-5)).toBe('no hauntings detected')
    expect(scoreBandLabel(250)).toBe('heavily haunted')
    expect(scoreBandLabel(Number.NaN)).toBe('no hauntings detected')
  })

  test('property: a higher score never gets milder wording', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a]
        expect(ORDER.indexOf(scoreBandLabel(high))).toBeGreaterThanOrEqual(ORDER.indexOf(scoreBandLabel(low)))
      }),
      { numRuns: 200 },
    )
  })

  test('property: the wording never claims compliance', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), (score) => {
        expect(scoreBandLabel(score)).not.toMatch(/complian|accessible|pass/i)
      }),
      { numRuns: 200 },
    )
  })
})

describe('scoreOutOf and normalizeScore', () => {
  it('formats the score out of 100', () => {
    expect(scoreOutOf(98)).toBe('98 / 100')
    expect(scoreOutOf(0)).toBe('0 / 100')
    expect(scoreOutOf(97.6)).toBe('98 / 100')
  })

  it('clamps into 0-100', () => {
    expect(normalizeScore(-1)).toBe(0)
    expect(normalizeScore(101)).toBe(100)
    expect(normalizeScore(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('explains that higher means more barriers', () => {
    expect(SCORE_EXPLANATION).toBe('Haunting Score out of 100; higher means more accessibility barriers.')
  })
})
