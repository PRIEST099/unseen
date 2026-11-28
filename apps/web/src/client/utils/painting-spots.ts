/**
 * Where the ghost in a gilt-framed painting may peek in from, and what part of it shows.
 *
 * Everything is in the picture's own coordinates: (0, 0) is the top-left of its inner (padding) box,
 * which is where the carved frame ends. A ghost peeks in from the left, right or bottom inner edge; its
 * hands rest on that edge and everything beyond it is cropped away. The ghost's `svg` is cropped to the
 * part that shows (see `PaintingGhost`), so its bounding box is always inside the picture.
 *
 * A spot is planned only where the dome and BOTH eyes show, in every pose the ghost is drawn in, and
 * where the part that shows keeps clear of the boxes that are drawn over the painting (the plaque and
 * the candle on the landing page), plus a small gap.
 */

import { faceBox } from './ghost-art'
import type { FaceBox, GhostEdge, GhostMood } from './ghost-art'
import { NEAR_PX, boxesIntersect, distanceToPoint } from './ghost-spots'
import type { Box, Point } from './ghost-spots'

/** How deep a ghost reaches into the picture, as a share of its size: the dome, eyes and hands. */
export const PAINTING_PEEK_RATIO = 0.78
/** The normal ghost is this share of the picture's height, clamped to the range below. */
export const PAINTING_SIZE_RATIO = 0.47
export const PAINTING_SIZE_MIN = 56
export const PAINTING_SIZE_MAX = 150
/** The Daylight ghost is the last one left: smaller, with a floor of its own. */
export const DAYLIGHT_SCALE = 0.7
export const DAYLIGHT_SIZE_MIN = 40
export const DAYLIGHT_SIZE_MAX = 105
/** Free space kept between a ghost's visible part and anything drawn over the painting. */
export const PAINTING_GAP = 8
/** A ghost bobs a few px along the edge, so its visible part keeps this far from the picture's ends. */
export const ALONG_INSET = 4
/** The sampling step along an edge. */
const STEP = 8
/** A different spot on the same edge is at least this far along it. */
const MIN_MOVE = 60
/** Rounding allowance (px) when checking that the face shows. */
const SLACK_PX = 0.5
/** The poses a spot must show the face in. */
const MOODS: readonly GhostMood[] = ['looking', 'startled']

export type PaintingEdge = 'left' | 'right' | 'bottom'
/** `pos` is the top of the ghost's box for a side spot and its left for a bottom spot. */
export type PaintingSpot = { edge: PaintingEdge; pos: number }
/** The picture's inner box and the boxes drawn over it, all in picture coordinates. */
export type PaintingBox = { width: number; height: number; excluded: readonly Box[] }
export type PaintingPlan = { size: number; spots: readonly PaintingSpot[] }

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/** The target size for a picture this tall (before any shrinking to fit). */
export function paintingGhostSize(height: number, daylight: boolean): number {
  const normal = clamp(Math.round(height * PAINTING_SIZE_RATIO), PAINTING_SIZE_MIN, PAINTING_SIZE_MAX)
  return daylight ? clamp(Math.round(normal * DAYLIGHT_SCALE), DAYLIGHT_SIZE_MIN, DAYLIGHT_SIZE_MAX) : normal
}

function floorSize(daylight: boolean): number {
  return daylight ? DAYLIGHT_SIZE_MIN : PAINTING_SIZE_MIN
}

export function depthOf(size: number): number {
  return size * PAINTING_PEEK_RATIO
}

export function artEdgeOf(edge: PaintingEdge): GhostEdge {
  return edge
}

/**
 * A ghost on a left or right edge stands nearly upright with a gentle lean (as the margin ghosts do), so
 * its eyes sit side by side; a bottom ghost is unturned. The pose never depends on anything else.
 */
export function paintingUpright(edge: PaintingEdge): boolean {
  return edge !== 'bottom'
}

/** The top-left of the ghost's full (uncropped) box. */
export function ghostOrigin(spot: PaintingSpot, size: number, box: Pick<PaintingBox, 'width' | 'height'>): Point {
  const depth = depthOf(size)
  if (spot.edge === 'left') return { x: depth - size, y: spot.pos }
  if (spot.edge === 'right') return { x: box.width - depth, y: spot.pos }
  return { x: spot.pos, y: box.height - depth }
}

/** The part of the ghost's box that shows, as fractions of it. */
export function shownFractions(spot: PaintingSpot, size: number): FaceBox {
  const share = PAINTING_PEEK_RATIO
  if (spot.edge === 'left') return { left: 1 - share, top: 0, right: 1, bottom: 1 }
  if (spot.edge === 'right') return { left: 0, top: 0, right: share, bottom: 1 }
  void size
  return { left: 0, top: 0, right: 1, bottom: share }
}

/** The part of the ghost that shows, in picture coordinates: the box of its cropped `svg`. */
export function visibleBox(spot: PaintingSpot, size: number, box: Pick<PaintingBox, 'width' | 'height'>): Box {
  const origin = ghostOrigin(spot, size, box)
  const shown = shownFractions(spot, size)
  return {
    left: origin.x + shown.left * size,
    top: origin.y + shown.top * size,
    right: origin.x + shown.right * size,
    bottom: origin.y + shown.bottom * size,
  }
}

export function spotCenter(spot: PaintingSpot, size: number, box: Pick<PaintingBox, 'width' | 'height'>): Point {
  const visible = visibleBox(spot, size, box)
  return { x: (visible.left + visible.right) / 2, y: (visible.top + visible.bottom) / 2 }
}

/** Whether the dome and both eyes show at this spot, in the given pose. */
export function showsFace(spot: PaintingSpot, size: number, mood: GhostMood): boolean {
  const face = faceBox(artEdgeOf(spot.edge), paintingUpright(spot.edge), mood)
  const shown = shownFractions(spot, size)
  const slack = SLACK_PX / size
  return (
    face.left >= shown.left - slack &&
    face.right <= shown.right + slack &&
    face.top >= shown.top - slack &&
    face.bottom <= shown.bottom + slack
  )
}

/** Whether the whole visible part is inside the picture and clear of everything drawn over it. */
function fits(spot: PaintingSpot, size: number, box: PaintingBox): boolean {
  const visible = visibleBox(spot, size, box)
  if (visible.left < 0 || visible.top < 0 || visible.right > box.width || visible.bottom > box.height) return false
  return !box.excluded.some((other) => boxesIntersect(visible, other, PAINTING_GAP))
}

/** A spot is valid when the face shows in every pose and the visible part fits and is clear. */
export function isValidPaintingSpot(spot: PaintingSpot, size: number, box: PaintingBox): boolean {
  return MOODS.every((mood) => showsFace(spot, size, mood)) && fits(spot, size, box)
}

function positionsAlong(edge: PaintingEdge, size: number, box: PaintingBox): number[] {
  const length = edge === 'bottom' ? box.width : box.height
  const high = length - size - ALONG_INSET
  const out: number[] = []
  for (let pos = ALONG_INSET; pos <= high; pos += STEP) out.push(pos)
  if (high >= ALONG_INSET) out.push(Math.floor(high))
  return out
}

/** Every valid spot, sampled along each of the three edges. */
export function spotsAtSize(size: number, box: PaintingBox): PaintingSpot[] {
  const edges: PaintingEdge[] = ['left', 'right', 'bottom']
  const spots: PaintingSpot[] = []
  for (const edge of edges) {
    for (const pos of positionsAlong(edge, size, box)) {
      const spot: PaintingSpot = { edge, pos }
      if (isValidPaintingSpot(spot, size, box)) spots.push(spot)
    }
  }
  return spots
}

/**
 * The largest ghost, from the target size down to the floor, that has at least one valid spot. Null when
 * the picture is too small for a ghost at the floor size with both eyes showing: then there is none.
 */
export function planPaintingGhost(box: PaintingBox, daylight: boolean): PaintingPlan | null {
  if (box.width <= 0 || box.height <= 0) return null
  const floor = floorSize(daylight)
  for (let size = paintingGhostSize(box.height, daylight); size >= floor; size -= 2) {
    const spots = spotsAtSize(size, box)
    if (spots.length > 0) return { size, spots }
  }
  const spots = spotsAtSize(floor, box)
  return spots.length > 0 ? { size: floor, spots } : null
}

/** A different spot: another edge, or at least a little way along the same one. */
export function isDifferentPaintingSpot(a: PaintingSpot, b: PaintingSpot): boolean {
  return a.edge !== b.edge || Math.abs(a.pos - b.pos) >= MIN_MOVE
}

type PickOptions = {
  /** The ghost's spot now: the new one should differ from it. */
  previous?: PaintingSpot | null
  /** The lantern in picture coordinates: the new spot should be farther than `NEAR_PX` from it. */
  lantern?: Point | null
  random: () => number
}

function farthest(spots: readonly PaintingSpot[], size: number, box: PaintingBox, from: Point): PaintingSpot | null {
  let best: PaintingSpot | null = null
  let bestDistance = -1
  for (const spot of spots) {
    const distance = distanceToPoint(spotCenter(spot, size, box), from)
    if (distance > bestDistance) {
      best = spot
      bestDistance = distance
    }
  }
  return best
}

/**
 * Picks the spot to peek in at. Prefers a spot that differs from the last one and is farther than
 * `NEAR_PX` from the lantern; with none, the valid spot farthest from the lantern; with no lantern, any.
 */
export function pickPaintingSpot(plan: PaintingPlan, box: PaintingBox, pick: PickOptions): PaintingSpot | null {
  if (plan.spots.length === 0) return null
  const { previous = null, lantern = null, random } = pick
  const different = plan.spots.filter((spot) => previous === null || isDifferentPaintingSpot(spot, previous))
  const pool = different.length > 0 ? different : plan.spots
  const away =
    lantern === null ? pool : pool.filter((spot) => distanceToPoint(spotCenter(spot, plan.size, box), lantern) > NEAR_PX)
  if (away.length > 0) return away[Math.min(away.length - 1, Math.floor(random() * away.length))] ?? null
  if (lantern !== null) return farthest(plan.spots, plan.size, box, lantern)
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null
}

/** Whether the lantern (picture coordinates) is within `NEAR_PX` of the part of the ghost that shows. */
export function lanternIsNear(spot: PaintingSpot, size: number, box: PaintingBox, lantern: Point): boolean {
  return distanceToPoint(spotCenter(spot, size, box), lantern) <= NEAR_PX
}
