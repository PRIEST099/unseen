import type { Haunting } from '@the-unseen/core'

export type Rect = { x: number; y: number; width: number; height: number }

/** WCAG 2.5.8 minimum target size, in CSS px. */
export const MIN_HIT_SIZE = 24
/** Height of the Silent Tongue banner in screenshot pixels. */
export const SILENT_TONGUE_BANNER_HEIGHT = 40

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * The screenshot-space box an overlay is drawn on. Silent Tongue is page-level and has no
 * element box, so it gets a full-width banner at the top; hauntings with no box and no banner
 * (Shattered Order, any unlocated one) have no overlay and live in the sidebar only.
 */
export function overlayBox(haunting: Haunting, pngWidth: number): Rect | null {
  if (haunting.type === 'SilentTongue') return { x: 0, y: 0, width: pngWidth, height: SILENT_TONGUE_BANNER_HEIGHT }
  if (haunting.type === 'ShatteredOrder' || haunting.box === null) return null
  const { x, y, width, height } = haunting.box
  return { x, y, width, height }
}

export type PlacedHaunting = { haunting: Haunting; box: Rect }

/** Hauntings that have an overlay, in reading order: top to bottom, then left to right. */
export function placeOverlays(hauntings: readonly Haunting[], pngWidth: number): PlacedHaunting[] {
  const placed: PlacedHaunting[] = []
  for (const haunting of hauntings) {
    const box = overlayBox(haunting, pngWidth)
    if (box !== null) placed.push({ haunting, box })
  }
  return sortByReadingOrder(placed, (item) => item.box)
}

/** Stable sort: top to bottom, then left to right (requirement 10.6, design "Reading Order"). */
export function sortByReadingOrder<T>(items: readonly T[], rectOf: (item: T) => Rect): T[] {
  return [...items].sort((a, b) => {
    const first = rectOf(a)
    const second = rectOf(b)
    return first.y !== second.y ? first.y - second.y : first.x - second.x
  })
}

/**
 * The button rectangle in CSS px for a screenshot-space box: the scaled box, grown to at least
 * 24x24 around its centre, and kept inside the stage (requirement 10.7).
 */
export function hitRect(box: Rect, scaleFactor: number, stage: { width: number; height: number }): Rect {
  const left = clamp(box.x * scaleFactor, 0, stage.width)
  const right = clamp((box.x + box.width) * scaleFactor, 0, stage.width)
  const top = clamp(box.y * scaleFactor, 0, stage.height)
  const bottom = clamp((box.y + box.height) * scaleFactor, 0, stage.height)
  const width = Math.min(Math.max(right - left, MIN_HIT_SIZE), stage.width)
  const height = Math.min(Math.max(bottom - top, MIN_HIT_SIZE), stage.height)
  return {
    x: clamp((left + right) / 2 - width / 2, 0, stage.width - width),
    y: clamp((top + bottom) / 2 - height / 2, 0, stage.height - height),
    width,
    height,
  }
}

/**
 * z-index per rectangle: the smaller the area, the higher the layer, so a small control is never
 * buried under the large box that surrounds it. DOM (focus) order is unaffected.
 */
export function stackingLevels(rects: readonly Rect[]): number[] {
  const byAreaDescending = rects
    .map((rect, index) => ({ index, area: rect.width * rect.height }))
    .sort((a, b) => b.area - a.area || a.index - b.index)
  const levels = new Array<number>(rects.length).fill(1)
  byAreaDescending.forEach((entry, rank) => {
    levels[entry.index] = rank + 1
  })
  return levels
}
