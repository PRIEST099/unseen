export type RGBColor = {
  r: number // 0-255
  g: number // 0-255
  b: number // 0-255
}

export type Luminance = number // 0-1, WCAG relative luminance
export type ContrastRatio = number // 1-21

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

function expand(channel: number): number {
  const s = clamp(channel, 0, 255) / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG 2.x relative luminance. Channels are clamped to 0-255. */
export function relativeLuminance(rgb: RGBColor): Luminance {
  const l = 0.2126 * expand(rgb.r) + 0.7152 * expand(rgb.g) + 0.0722 * expand(rgb.b)
  return clamp(l, 0, 1) // the three weights sum to 1; this only absorbs float rounding
}

/** WCAG 2.x contrast ratio: (lighter + 0.05) / (darker + 0.05). Symmetric, in [1, 21]. */
export function contrastRatio(c1: RGBColor, c2: RGBColor): ContrastRatio {
  const a = relativeLuminance(c1)
  const b = relativeLuminance(c2)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return clamp((lighter + 0.05) / (darker + 0.05), 1, 21)
}
