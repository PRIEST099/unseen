import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { generateNoiseTile } from './noise-tile'

describe('generateNoiseTile', () => {
  it('makes a 256x256 tile of values in [0, 1] that is not flat', () => {
    const tile = generateNoiseTile()
    expect(tile).toHaveLength(256 * 256)
    expect(Math.min(...tile)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...tile)).toBeLessThanOrEqual(1)
    expect(Math.max(...tile) - Math.min(...tile)).toBeGreaterThan(0.2)
  })

  it('is reproducible per seed and differs between seeds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
        expect(generateNoiseTile(32, seed)).toEqual(generateNoiseTile(32, seed))
        expect(generateNoiseTile(32, seed)).not.toEqual(generateNoiseTile(32, seed + 1))
      }),
      { numRuns: 25 },
    )
  })

  it('wraps: the last column continues into the first, so tiles join without a seam', () => {
    const size = 64
    const tile = generateNoiseTile(size, 7)
    const at = (x: number, y: number): number => tile[y * size + x] ?? 0
    let seam = 0
    let inside = 0
    for (let y = 0; y < size; y += 1) {
      seam += Math.abs(at(size - 1, y) - at(0, y))
      inside += Math.abs(at(size / 2, y) - at(size / 2 + 1, y))
    }
    expect(seam / size).toBeLessThan((inside / size) * 3 + 0.02)
  })
})
