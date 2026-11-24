import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLORS, SPACING, TEXT_SIZES } from './tokens'

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [r = 0, g = 0, b = 0] = channels
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const clientDir = __dirname
const tokensCss = readFileSync(join(clientDir, 'styles', 'tokens.css'), 'utf8')

describe('design token contrast (requirement 22)', () => {
  it('bone on ink is at least 7:1', () => {
    expect(contrastRatio(COLORS.BONE, COLORS.INK)).toBeGreaterThanOrEqual(7)
  })

  it('ecto on ink is at least 7:1', () => {
    expect(contrastRatio(COLORS.ECTO, COLORS.INK)).toBeGreaterThanOrEqual(7)
  })

  it('ink on ecto (button text) is at least 7:1', () => {
    expect(contrastRatio(COLORS.INK, COLORS.ECTO)).toBeGreaterThanOrEqual(7)
  })

  it.each([
    ['ember', COLORS.EMBER],
    ['candle', COLORS.CANDLE],
    ['mist', COLORS.MIST],
  ])('%s on ink is at least 4.5:1', (_name, colour) => {
    expect(contrastRatio(colour, COLORS.INK)).toBeGreaterThanOrEqual(4.5)
  })

  it('computes the known black on white ratio of 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })
})

describe('tokens.ts mirrors tokens.css', () => {
  function cssValue(name: string): string | undefined {
    return new RegExp(`${name}:\\s*([^;]+);`).exec(tokensCss)?.[1]?.trim()
  }

  it.each(Object.entries(COLORS))('colour %s matches', (key, hex) => {
    expect(cssValue(`--color-${key.toLowerCase()}`)?.toUpperCase()).toBe(hex)
  })

  it('type scale matches', () => {
    const names = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', 'display']
    expect(names.map((name) => cssValue(`--text-${name}`))).toEqual(Object.values(TEXT_SIZES))
  })

  it('spacing scale matches', () => {
    for (const [step, size] of Object.entries(SPACING)) {
      expect(cssValue(`--space-${step}`)).toBe(size)
    }
  })

  it('never sets text below the 0.75rem minimum', () => {
    expect(Number.parseFloat(TEXT_SIZES.XS)).toBeGreaterThanOrEqual(0.75)
    expect(Number.parseFloat(TEXT_SIZES.BASE)).toBeGreaterThanOrEqual(1)
  })
})

describe('no hard-coded colours outside the token files (requirement 21.5)', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return sourceFiles(path)
      return /\.(css|tsx?)$/.test(entry) ? [path] : []
    })
  }

  const allowed = new Set(['tokens.css', 'tokens.ts', 'tokens.test.ts'])
  const offenders = sourceFiles(clientDir)
    .filter((path) => !allowed.has(path.split(/[\\/]/).pop() ?? ''))
    .filter((path) => /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\(|\bhsla?\(/.test(readFileSync(path, 'utf8')))

  it('finds none', () => {
    expect(offenders).toEqual([])
  })
})
