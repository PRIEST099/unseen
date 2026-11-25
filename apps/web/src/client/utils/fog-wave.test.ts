import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  easeInOut,
  FOG_BAND_HEIGHT_PX,
  FOG_FEATHER_PX,
  HAUNTED_FILTER,
  hauntedExtent,
  isOverlayRevealed,
  MIST_ALPHA,
  revealedCount,
  waveCenter,
  waveProgress,
} from './fog-wave'

const unit = fc.double({ min: 0, max: 1, noNaN: true })

describe('wave timing', () => {
  it('easeInOut is monotonic and maps 0 to 0 and 1 to 1', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9)
    fc.assert(fc.property(unit, unit, (a, b) => {
      const [low, high] = a <= b ? [a, b] : [b, a]
      expect(easeInOut(low)).toBeLessThanOrEqual(easeInOut(high) + 1e-12)
    }))
  })

  it('waveProgress reaches 1 at the duration and stays there', () => {
    expect(waveProgress(0)).toBe(0)
    expect(waveProgress(800)).toBe(1)
    expect(waveProgress(5000)).toBe(1)
  })

  it('waveCenter starts a feather above the image and ends a feather below it', () => {
    expect(waveCenter(0, 1000)).toBe(-FOG_FEATHER_PX)
    expect(waveCenter(1, 1000)).toBe(1000 + FOG_FEATHER_PX)
  })
})

describe('the fog the wave leaves behind (fix 1.6)', () => {
  it('uses a 240 px band, a 0.3 mist and the dimmed, desaturated filter', () => {
    expect(FOG_BAND_HEIGHT_PX).toBe(240)
    expect(FOG_FEATHER_PX * 2).toBe(FOG_BAND_HEIGHT_PX)
    expect(MIST_ALPHA).toBeCloseTo(0.3, 9)
    expect(HAUNTED_FILTER).toBe('grayscale(0.6) brightness(0.7)')
  })

  it('hauntedExtent follows the band centre and stays inside the image', () => {
    expect(hauntedExtent(-FOG_FEATHER_PX, 1000)).toBe(0)
    expect(hauntedExtent(400, 1000)).toBe(400)
    expect(hauntedExtent(1000 + FOG_FEATHER_PX, 1000)).toBe(1000)
    fc.assert(
      fc.property(unit, unit, fc.double({ min: 1, max: 20000, noNaN: true }), (a, b, height) => {
        const [early, late] = a <= b ? [a, b] : [b, a]
        const first = hauntedExtent(waveCenter(early, height), height)
        const second = hauntedExtent(waveCenter(late, height), height)
        expect(first).toBeGreaterThanOrEqual(0)
        expect(second).toBeLessThanOrEqual(height)
        expect(first).toBeLessThanOrEqual(second)
      }),
    )
    // Once the wave has passed, the haunted state covers the whole screenshot.
    expect(hauntedExtent(waveCenter(waveProgress(800), 1234), 1234)).toBe(1234)
  })
})

describe('overlay reveal order (requirement 12.3)', () => {
  it('reveals an overlay once the wave is 100 px above its top edge', () => {
    expect(isOverlayRevealed(399, 1000, 0.5)).toBe(false)
    expect(isOverlayRevealed(400, 1000, 0.5)).toBe(true)
  })

  it('reveals a prefix of the reading order, growing with the wave, and everything at the end', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 8000, noNaN: true }), { maxLength: 50 }),
        fc.double({ min: 0.2, max: 1, noNaN: true }),
        unit,
        unit,
        (ys, factor, p1, p2) => {
          const sorted = [...ys].sort((a, b) => a - b)
          const height = 9000 * factor
          const [early, late] = p1 <= p2 ? [p1, p2] : [p2, p1]
          const first = revealedCount(waveCenter(early, height), sorted, factor)
          const second = revealedCount(waveCenter(late, height), sorted, factor)
          expect(first).toBeLessThanOrEqual(second)
          sorted.forEach((y, index) => {
            expect(isOverlayRevealed(waveCenter(early, height), y, factor)).toBe(index < first)
          })
          expect(revealedCount(waveCenter(1, height), sorted, factor)).toBe(sorted.length)
        },
      ),
    )
  })
})
