import type { TextNodeStyle } from '@the-unseen/core'

export type Rgb = readonly [number, number, number]

const DEFAULT_FOG_OPACITY = 0.6
const MIN_FOG = 0.3
const MAX_FOG = 0.8
const NORMAL_TEXT_THRESHOLD = 4.5
const LARGE_TEXT_THRESHOLD = 3

/** Parses a computed colour string as the browser reports it (red, green, blue, optional alpha); undefined for anything else. */
export function parseCssRgb(value: string): Rgb | undefined {
  const match = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(value.trim())
  if (match === null) return undefined
  const channels = [match[1], match[2], match[3]].map((part) => Math.min(255, Number(part)))
  const [r, g, b] = channels
  return r === undefined || g === undefined || b === undefined ? undefined : [r, g, b]
}

/** Parses a `#rgb` or `#rrggbb` string, as found in the design tokens. */
export function parseHexColor(value: string): Rgb | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  const digits = match?.[1]
  if (digits === undefined) return undefined
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits
  const channel = (offset: number): number => Number.parseInt(full.slice(offset, offset + 2), 16)
  return [channel(0), channel(2), channel(4)]
}

function channelLuminance(channel: number): number {
  const s = channel / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(color: Rgb): number {
  return 0.2126 * channelLuminance(color[0]) + 0.7152 * channelLuminance(color[1]) + 0.0722 * channelLuminance(color[2])
}

/** WCAG 2.x contrast ratio, symmetric, in [1, 21]. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/**
 * Fog opacity for a contrast ratio: 0 when the text passes, else 0.3 rising to 0.8 as the ratio
 * falls from the threshold to 1:1 (requirement 9.3, density proportional to the deficit).
 */
export function computeFogDensity(ratio: number, isLargeText: boolean): number {
  const threshold = isLargeText ? LARGE_TEXT_THRESHOLD : NORMAL_TEXT_THRESHOLD
  if (!(ratio < threshold)) return 0
  const deficit = Math.min(Math.max((threshold - ratio) / (threshold - 1), 0), 1)
  return MIN_FOG + (MAX_FOG - MIN_FOG) * deficit
}

/** Fog opacity for one text node style; a medium fog when the colours cannot be read. */
export function fogOpacityForStyle(style: TextNodeStyle | undefined): number {
  if (style === undefined) return DEFAULT_FOG_OPACITY
  const foreground = parseCssRgb(style.color)
  const background = parseCssRgb(style.backgroundColor)
  if (foreground === undefined || background === undefined) return DEFAULT_FOG_OPACITY
  const density = computeFogDensity(contrastRatio(foreground, background), style.isLargeText)
  return density === 0 ? DEFAULT_FOG_OPACITY : density
}

/** A patch of denser fog on the fog canvas, in canvas (scaled CSS) px. `density` is an alpha in [0, 1]. */
export type FogPatch = { x: number; y: number; width: number; height: number; density: number }

type FogSource = {
  haunting: { type: string; nodeIds: readonly number[] }
  box: { x: number; y: number; width: number; height: number }
}

/**
 * Denser fog over every The Fog (contrast) haunting, scaled from screenshot px to canvas px. The
 * density comes from the node's real colours: worse contrast, thicker fog (requirement 9.3).
 */
export function fogPatches(
  items: readonly FogSource[],
  styles: Readonly<Record<string, TextNodeStyle | undefined>>,
  scaleFactor: number,
): FogPatch[] {
  return items
    .filter((item) => item.haunting.type === 'TheFog')
    .map(({ haunting, box }) => ({
      x: box.x * scaleFactor,
      y: box.y * scaleFactor,
      width: box.width * scaleFactor,
      height: box.height * scaleFactor,
      density: fogOpacityForStyle(styles[String(haunting.nodeIds[0])]),
    }))
}
