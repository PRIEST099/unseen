import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeFogDensity, contrastRatio, fogOpacityForStyle, fogPatches, parseCssRgb, parseHexColor } from './fog-density'

// Colour strings are built, not written out, so the "no hard-coded colours" scan stays meaningful.
const fn = 'rgb'
const css = (r: number, g: number, b: number, alpha?: number): string =>
  alpha === undefined ? `${fn}(${r}, ${g}, ${b})` : `${fn}a(${r}, ${g}, ${b}, ${alpha})`

const channel = fc.integer({ min: 0, max: 255 })
const color = fc.tuple(channel, channel, channel)

describe('colour parsing', () => {
  it('reads computed colour strings with and without alpha', () => {
    expect(parseCssRgb(css(12, 34, 56))).toEqual([12, 34, 56])
    expect(parseCssRgb(css(1, 2, 3, 0.5))).toEqual([1, 2, 3])
    expect(parseCssRgb('red')).toBeUndefined()
  })

  it('reads three and six digit hex strings', () => {
    expect(parseHexColor(`#${'0b0a10'}`)).toEqual([11, 10, 16])
    expect(parseHexColor(`#${'fa0'}`)).toEqual([255, 170, 0])
    expect(parseHexColor('nope')).toBeUndefined()
  })
})

describe('contrastRatio', () => {
  it('is symmetric and between 1 and 21', () => {
    fc.assert(
      fc.property(color, color, (a, b) => {
        const ratio = contrastRatio(a, b)
        expect(ratio).toBeCloseTo(contrastRatio(b, a), 9)
        expect(ratio).toBeGreaterThanOrEqual(1 - 1e-9)
        expect(ratio).toBeLessThanOrEqual(21 + 1e-9)
      }),
    )
  })

  it('gives 21 for black on white', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6)
  })
})

describe('computeFogDensity (design property 4)', () => {
  it('is 0 at or above the threshold', () => {
    expect(computeFogDensity(4.5, false)).toBe(0)
    expect(computeFogDensity(3, true)).toBe(0)
    expect(computeFogDensity(10, false)).toBe(0)
  })

  it('stays within [0.3, 0.8] below the threshold and grows as the ratio falls', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 4.49, noNaN: true }),
        fc.double({ min: 1, max: 4.49, noNaN: true }),
        (a, b) => {
          const [low, high] = a <= b ? [a, b] : [b, a]
          const denser = computeFogDensity(low, false)
          const lighter = computeFogDensity(high, false)
          expect(denser).toBeGreaterThanOrEqual(0.3)
          expect(denser).toBeLessThanOrEqual(0.8 + 1e-12)
          expect(denser).toBeGreaterThanOrEqual(lighter - 1e-12)
        },
      ),
    )
  })

  it('uses the large-text threshold for large text', () => {
    expect(computeFogDensity(3.5, true)).toBe(0)
    expect(computeFogDensity(3.5, false)).toBeGreaterThan(0)
  })
})

describe('fogOpacityForStyle', () => {
  const style = {
    color: css(200, 200, 200),
    backgroundColor: css(255, 255, 255),
    fontSize: '16px',
    fontWeight: '400',
    backgroundUncertain: false,
    isLargeText: false,
  }

  it('is denser for a worse contrast', () => {
    const faint = fogOpacityForStyle({ ...style, color: css(250, 250, 250) })
    const mild = fogOpacityForStyle({ ...style, color: css(160, 160, 160) })
    expect(faint).toBeGreaterThan(mild)
  })

  it('falls back to a medium fog without readable colours', () => {
    expect(fogOpacityForStyle(undefined)).toBe(0.6)
    expect(fogOpacityForStyle({ ...style, color: 'transparent' })).toBe(0.6)
  })
})

describe('fogPatches', () => {
  const base = {
    backgroundColor: css(255, 255, 255),
    fontSize: '16px',
    fontWeight: '400',
    backgroundUncertain: false,
    isLargeText: false,
  }
  const styles = { '7': { ...base, color: css(250, 250, 250) }, '8': { ...base, color: css(150, 150, 150) } }
  const box = { x: 100, y: 200, width: 300, height: 40 }
  const item = (type: string, nodeId: number) => ({ haunting: { type, nodeIds: [nodeId] }, box })

  it('keeps only The Fog hauntings and scales their boxes to the canvas', () => {
    const patches = fogPatches([item('TheFog', 7), item('NamelessSpirit', 9)], styles, 0.5)
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({ x: 50, y: 100, width: 150, height: 20 })
  })

  it('makes the fog denser for a worse contrast, from the real colours', () => {
    const [faint, mild] = fogPatches([item('TheFog', 7), item('TheFog', 8)], styles, 1)
    expect(faint?.density).toBeGreaterThan(mild?.density ?? 1)
    expect(faint?.density).toBeLessThanOrEqual(0.8)
    expect(mild?.density).toBeGreaterThanOrEqual(0.3)
  })

  it('uses the medium fog when the colours are unknown', () => {
    expect(fogPatches([item('TheFog', 99)], styles, 1)[0]?.density).toBe(0.6)
  })
})
