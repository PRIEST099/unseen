import { afterEach, describe, expect, it } from 'vitest'
import { ART_BOX, EYES, EYE_SPREAD, EYE_Y, artTurn } from './ghost-art'
import {
  FOOTER_GAP,
  GHOST_GAP,
  GHOST_SIZE_MIN,
  NEAR_PX,
  PANEL_RING,
  UPRIGHT_MIN_RATIO,
  artEdge,
  artUpright,
  boxesIntersect,
  fitSize,
  ghostCountFor,
  ghostCountForPlacement,
  ghostSizeFor,
  hasRoom,
  hiddenShift,
  isDifferentSpot,
  isValidSpot,
  peekPosition,
  pickSpot,
  plannedSpots,
  resetPlannedSpots,
  showsFace,
  sideDepth,
  spotCenter,
  visibleBox,
} from './ghost-spots'
import type { Box, Placement, Point, Spot } from './ghost-spots'

/** A small seeded generator (mulberry32): the same samples on every run, so a failure can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (random: () => number, low: number, high: number): number => low + random() * (high - low)

const HEADER_BOTTOM = 80
const FOOTER_HEIGHT = 76

/** The real layout: a content column 72rem (1152 px) wide at most, centred, 24 px in from each side. */
function page(innerWidth: number, height: number, footer: boolean, tall = true): Placement {
  const column = Math.min(innerWidth - 48, 1152)
  const panelLeft = Math.round((innerWidth - column) / 2)
  return fitSize({
    innerWidth,
    viewWidth: innerWidth,
    height,
    size: ghostSizeFor(innerWidth),
    minY: HEADER_BOTTOM + 24,
    panelLeft,
    panelRight: panelLeft + column,
    panelMinY: HEADER_BOTTOM + 32,
    panelMaxY: tall ? height - FOOTER_HEIGHT - 32 : Math.round(height * 0.6),
    footerTop: footer ? height - FOOTER_HEIGHT : Number.POSITIVE_INFINITY,
  })
}

/** A random but realistic page: a window, the content column, a header, a short or tall panel, a footer or none. */
function randomPlacement(random: () => number): Placement {
  const innerWidth = Math.round(between(random, 768, 2560))
  const height = Math.round(between(random, 500, 1400))
  const footer = random() < 0.7
  return page(innerWidth, height, footer, random() < 0.5)
}

const SAMPLES = 300
const PICKS = 6

function pickedSpots(placement: Placement, random: () => number): Spot[] {
  const spots: Spot[] = []
  for (let index = 0; index < PICKS; index += 1) {
    const spot = pickSpot(placement, { taken: spots, random })
    if (spot !== null) spots.push(spot)
  }
  return spots
}

/**
 * Points on the outline of both eyes and the top of the dome, in viewport px, as the art is drawn: the
 * drawing's own eye ovals, turned about its centre by the pose's turn, scaled and placed at the spot.
 * Sampled, so it does not share the planner's closed-form extents.
 */
function facePoints(spot: Spot, placement: Placement): Point[] {
  const turn = (artTurn(artEdge(spot), artUpright(spot, placement)) * Math.PI) / 180
  const at = peekPosition(spot, placement)
  const scale = placement.size / ART_BOX
  const half = ART_BOX / 2
  const place = (x: number, y: number): Point => {
    const dx = x - half
    const dy = y - half
    return {
      x: at.x + (half + dx * Math.cos(turn) - dy * Math.sin(turn)) * scale,
      y: at.y + (half + dx * Math.sin(turn) + dy * Math.cos(turn)) * scale,
    }
  }
  const points = [place(half, 5)]
  const { rx, ry } = EYES.looking
  for (const cx of [half - EYE_SPREAD, half + EYE_SPREAD]) {
    for (let step = 0; step < 72; step += 1) {
      const angle = (step * Math.PI) / 36
      points.push(place(cx + rx * Math.cos(angle), EYE_Y + ry * Math.sin(angle)))
    }
  }
  return points
}

/** A point shows when it is in the window, below the header, above the footer, and not behind the panel or its ring. */
function onTheWall(point: Point, placement: Placement): boolean {
  const slack = 0.5
  const floor = Math.min(placement.height, placement.footerTop)
  const inWindow = point.x >= -slack && point.x <= placement.viewWidth + slack
  const inHeight = point.y >= HEADER_BOTTOM - slack && point.y <= floor + slack
  const besidePanel = point.x <= placement.panelLeft - PANEL_RING + slack || point.x >= placement.panelRight + PANEL_RING - slack
  return inWindow && inHeight && besidePanel
}

function showsBothEyes(spot: Spot, placement: Placement): boolean {
  return facePoints(spot, placement).every((point) => onTheWall(point, placement))
}

afterEach(() => resetPlannedSpots())

/** Whether any two of the spots' visible boxes come within the gap between ghosts. */
function pairsOverlap(spots: readonly Spot[], placement: Placement): boolean {
  return spots.some((first, a) =>
    spots.some((second, b) => b > a && boxesIntersect(visibleBox(first, placement), visibleBox(second, placement), GHOST_GAP)),
  )
}

describe('ghost-spots: counts and sizes', () => {
  it('follows the breakpoints: 3 from 1100, 2 from 768, none below', () => {
    expect([1920, 1100, 1099, 768, 767, 320].map(ghostCountFor)).toEqual([3, 3, 2, 2, 0, 0])
  })

  it('is 150 px from 1100 px wide and 120 px below, at most', () => {
    expect([1100, 1440, 1099, 768].map(ghostSizeFor)).toEqual([150, 150, 120, 120])
  })

  it('a ghost is drawn smaller only where a larger one could not show its face, and never below the minimum', () => {
    const random = seeded(11)
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      expect(placement.size).toBeLessThanOrEqual(ghostSizeFor(placement.innerWidth))
      if (!hasRoom(placement)) {
        expect(ghostCountForPlacement(placement)).toBe(0)
        continue
      }
      expect(placement.size).toBeGreaterThanOrEqual(GHOST_SIZE_MIN)
      if (placement.size < ghostSizeFor(placement.innerWidth)) {
        expect(hasRoom({ ...placement, size: placement.size + 2 })).toBe(false)
      }
    }
  })
})

describe('no eyeless slices', () => {
  it.each([1100, 900])('at %i px wide (24 px margins) every planned spot shows both eyes: there is room for none', (width) => {
    const random = seeded(width)
    for (const footer of [true, false]) {
      for (const height of [600, 800, 1000]) {
        resetPlannedSpots()
        const placement = page(width, height, footer)
        const planned = plannedSpots(ghostCountFor(width), placement, random)
        for (const spot of planned) expect(showsBothEyes(spot, placement), JSON.stringify(spot)).toBe(true)
        expect(planned).toEqual([])
        expect(pickSpot(placement, { taken: [], random })).toBeNull()
        expect(ghostCountForPlacement(placement)).toBe(0)
      }
    }
  })

  it.each([1280, 1366, 1440, 1920])('at %i px wide there are three spots, and every planned or picked spot shows both eyes', (width) => {
    const random = seeded(width)
    for (const footer of [true, false]) {
      for (let run = 0; run < 30; run += 1) {
        resetPlannedSpots()
        const placement = page(width, 800, footer)
        const planned = plannedSpots(3, placement, random)
        expect(planned).toHaveLength(3)
        for (const spot of [...planned, ...pickedSpots(placement, random)]) {
          expect(showsBothEyes(spot, placement), `${width}: ${JSON.stringify(spot)}`).toBe(true)
          expect(showsFace(spot, placement)).toBe(true)
        }
      }
    }
  })
})

describe('property: where a ghost can show', () => {
  it('every spot it picks shows the dome and both eyes, in the pose the ghost is drawn in', () => {
    const random = seeded(12)
    let seen = 0
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      for (const spot of pickedSpots(placement, random)) {
        seen += 1
        expect(showsBothEyes(spot, placement), JSON.stringify({ spot, placement })).toBe(true)
      }
    }
    expect(seen).toBeGreaterThan(SAMPLES)
  })

  it('its visible part is inside the window, never under the header, never behind the footer, never inside the panel or its ring', () => {
    const random = seeded(1)
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      for (const spot of pickedSpots(placement, random)) {
        const box = visibleBox(spot, placement)
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(placement.viewWidth + 0.001)
        expect(box.bottom).toBeLessThanOrEqual(placement.height + 0.001)
        // Never planned over the header: a side ghost starts below it; a bottom ghost is far below it.
        expect(box.top).toBeGreaterThanOrEqual(HEADER_BOTTOM)
        // Not clipped by the footer either: the whole ghost box is planned above it.
        if (spot.edge !== 'bottom') expect(spot.pos + placement.size).toBeLessThanOrEqual(placement.footerTop - FOOTER_GAP + 0.001)
        const panel: Box = {
          left: placement.panelLeft - PANEL_RING,
          right: placement.panelRight + PANEL_RING,
          top: -1,
          bottom: placement.height + 1,
        }
        if (box.right - box.left > 0.5) expect(boxesIntersect(box, panel)).toBe(false)
      }
    }
  })

  it('no bottom ghost where the footer can stand at the bottom of the window', () => {
    const random = seeded(13)
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      if (placement.footerTop >= placement.height) continue
      for (const spot of pickedSpots(placement, random)) expect(spot.edge).not.toBe('bottom')
    }
  })

  it('the visible box stops at the footer: what is behind it does not count for the lantern', () => {
    const placement: Placement = { ...page(1920, 800, false), footerTop: 600 }
    const spot: Spot = { edge: 'left', anchor: 'window', pos: 520 }
    const box = visibleBox(spot, placement)
    expect(box.bottom).toBe(600)
    expect(spotCenter(spot, placement).y).toBe((520 + 600) / 2)
    expect(isValidSpot(spot, placement)).toBe(false)
  })

  it('shows the dome and both eyes of a bottom ghost: they sit wholly in a side margin', () => {
    const random = seeded(2)
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      for (const spot of pickedSpots(placement, random)) {
        if (spot.edge !== 'bottom') continue
        const size = placement.size
        const faceLeft = spot.pos + 0.15 * size
        const faceRight = spot.pos + 0.85 * size
        const inLeft = faceLeft >= -0.001 && faceRight <= placement.panelLeft - PANEL_RING + 0.001
        const inRight = faceLeft >= placement.panelRight + PANEL_RING - 0.001 && faceRight <= placement.viewWidth + 0.001
        expect(inLeft || inRight).toBe(true)
      }
    }
  })

  it('a side ghost shows as much as the margin allows, up to its full depth', () => {
    const random = seeded(3)
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      for (const spot of pickedSpots(placement, random)) {
        if (spot.edge === 'bottom') continue
        const box = visibleBox(spot, placement)
        const margin = spot.edge === 'left' ? placement.panelLeft : placement.viewWidth - placement.panelRight
        const shown = box.right - box.left
        expect(shown).toBeLessThanOrEqual(Math.round(placement.size * 0.74) + 0.001)
        expect(shown).toBeLessThanOrEqual(Math.max(0, margin - PANEL_RING) + 0.001)
        expect(shown).toBeGreaterThanOrEqual(Math.min(Math.round(placement.size * 0.74), Math.max(0, margin - PANEL_RING)) - 0.001)
      }
    }
  })

  it('a panel ghost stands wholly within the panel\'s height, so hiding behind the panel is always complete', () => {
    const random = seeded(4)
    let seen = 0
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      for (const spot of pickedSpots(placement, random)) {
        if (spot.anchor !== 'panel') continue
        seen += 1
        expect(spot.pos).toBeGreaterThanOrEqual(placement.panelMinY - 1)
        expect(spot.pos + placement.size).toBeLessThanOrEqual(placement.panelMaxY + 1)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('no two ghosts show on top of each other', () => {
    const random = seeded(5)
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      const spots = [] as Spot[]
      for (let index = 0; index < 3; index += 1) {
        const spot = pickSpot(placement, { taken: spots, random })
        if (spot !== null) spots.push(spot)
      }
      const wide = placement.panelLeft > 200
      if (!wide) continue
      for (let a = 0; a < spots.length; a += 1) {
        for (let b = a + 1; b < spots.length; b += 1) {
          const first = spots[a]
          const second = spots[b]
          if (first === undefined || second === undefined) continue
          expect(boxesIntersect(visibleBox(first, placement), visibleBox(second, placement))).toBe(false)
        }
      }
    }
  })
})

describe('property: hiding', () => {
  it('a hidden ghost is completely out of the window, or completely behind the panel', () => {
    const random = seeded(6)
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      for (const spot of pickedSpots(placement, random)) {
        const at = peekPosition(spot, placement)
        const shift = hiddenShift(spot, placement)
        const size = placement.size
        const moved = { left: at.x + shift.x, right: at.x + shift.x + size, top: at.y + shift.y, bottom: at.y + shift.y + size }
        if (spot.anchor === 'panel') {
          expect(moved.left).toBeGreaterThanOrEqual(placement.panelLeft - 0.001)
          expect(moved.right).toBeLessThanOrEqual(placement.panelRight + 0.001)
          expect(moved.top).toBeGreaterThanOrEqual(placement.panelMinY - 1)
          expect(moved.bottom).toBeLessThanOrEqual(placement.panelMaxY + 1)
        } else if (spot.edge === 'left') {
          expect(moved.right).toBeLessThanOrEqual(0)
        } else if (spot.edge === 'right') {
          expect(moved.left).toBeGreaterThanOrEqual(placement.viewWidth)
        } else {
          expect(moved.top).toBeGreaterThanOrEqual(placement.height)
        }
      }
    }
  })

  it('the hands hold the edge the ghost hides behind: the hem is on the hidden side', () => {
    const base: Placement = {
      innerWidth: 1440,
      viewWidth: 1440,
      height: 900,
      size: 150,
      minY: 104,
      panelLeft: 144,
      panelRight: 1296,
      panelMinY: 112,
      panelMaxY: 800,
      footerTop: Number.POSITIVE_INFINITY,
    }
    expect(artEdge({ edge: 'left', anchor: 'window', pos: 200 })).toBe('left')
    expect(artEdge({ edge: 'right', anchor: 'window', pos: 200 })).toBe('right')
    expect(artEdge({ edge: 'left', anchor: 'panel', pos: 200 })).toBe('right')
    expect(artEdge({ edge: 'right', anchor: 'panel', pos: 200 })).toBe('left')
    expect(artEdge({ edge: 'bottom', anchor: 'window', pos: 40 })).toBe('bottom')
    // The hem side is the side the ghost slides towards when it hides.
    for (const spot of [
      { edge: 'left', anchor: 'window', pos: 200 },
      { edge: 'right', anchor: 'window', pos: 200 },
      { edge: 'left', anchor: 'panel', pos: 200 },
      { edge: 'right', anchor: 'panel', pos: 200 },
    ] as const) {
      const shift = hiddenShift(spot, base)
      expect(artEdge(spot) === 'right').toBe(shift.x > 0)
    }
  })
})

describe('artUpright', () => {
  const wide: Placement = {
    innerWidth: 1440, viewWidth: 1440, height: 900, size: 150, minY: 104,
    panelLeft: 144, panelRight: 1296, panelMinY: 112, panelMaxY: 788, footerTop: 824,
  }
  const narrow: Placement = { ...wide, innerWidth: 1280, viewWidth: 1280, panelLeft: 64, panelRight: 1216 }

  it('is upright on a side edge only where the margin shows most of the ghost, and never on the bottom edge', () => {
    expect(artUpright({ edge: 'left', anchor: 'window', pos: 200 }, wide)).toBe(true)
    expect(artUpright({ edge: 'right', anchor: 'panel', pos: 200 }, wide)).toBe(true)
    expect(artUpright({ edge: 'left', anchor: 'window', pos: 200 }, narrow)).toBe(false)
    expect(artUpright({ edge: 'bottom', anchor: 'window', pos: 20 }, wide)).toBe(false)
  })

  it('the more margin, the more upright: never below the threshold, only where upright shows both eyes, and for good once it is', () => {
    let wasUpright = false
    for (let margin = 0; margin <= 400; margin += 1) {
      const placement: Placement = { ...wide, panelLeft: margin }
      const spot: Spot = { edge: 'left', anchor: 'window', pos: 200 }
      const upright = artUpright(spot, placement)
      if (upright) {
        expect(sideDepth('left', placement)).toBeGreaterThanOrEqual(150 * UPRIGHT_MIN_RATIO)
        expect(showsBothEyes(spot, placement), `margin ${margin}`).toBe(true)
      }
      if (wasUpright) expect(upright, `margin ${margin}`).toBe(true)
      wasUpright = upright
    }
    expect(wasUpright).toBe(true)
  })
})

describe('picking and planning spots', () => {
  it('a new spot differs from the old one', () => {
    const random = seeded(7)
    let checked = 0
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      const previous = pickSpot(placement, { taken: [], random })
      if (previous === null) continue
      const next = pickSpot(placement, { taken: [], previous, random })
      expect(next).not.toBeNull()
      if (next !== null) expect(isDifferentSpot(next, previous)).toBe(true)
      checked += 1
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('a new spot is out of range of the lantern when there is room', () => {
    const random = seeded(8)
    let checked = 0
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const placement = randomPlacement(random)
      if (placement.panelLeft < 150) continue
      const lantern = { x: between(random, 0, placement.viewWidth), y: between(random, 100, placement.height) }
      const spot = pickSpot(placement, { taken: [], lantern, random })
      if (spot === null) throw new Error('a wide margin always has room')
      const centre = spotCenter(spot, placement)
      expect(Math.hypot(centre.x - lantern.x, centre.y - lantern.y)).toBeGreaterThan(NEAR_PX)
      checked += 1
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('planned spots are at the window edges (the intro darts to those), valid, and stable; none without room', () => {
    const random = seeded(9)
    for (let sample = 0; sample < 100; sample += 1) {
      resetPlannedSpots()
      const placement = randomPlacement(random)
      const first = plannedSpots(3, placement, random)
      expect(first.length).toBeLessThanOrEqual(3)
      expect(first.length > 0).toBe(hasRoom(placement))
      for (const spot of first) {
        expect(spot.anchor).toBe('window')
        expect(isValidSpot(spot, placement, true)).toBe(true)
      }
      expect(plannedSpots(3, placement, random)).toEqual(first)
      expect(plannedSpots(2, placement, random)).toEqual(first.slice(0, 2))
    }
  })

  it('planned spots never overlap, with the gap, and are at most three, even in a short window', () => {
    const random = seeded(21)
    for (const [width, height] of [[1920, 560], [1920, 400], [1920, 500], [1280, 560], [1440, 450]] as const) {
      for (const footer of [true, false]) {
        for (let run = 0; run < 40; run += 1) {
          resetPlannedSpots()
          const placement = page(width, height, footer)
          const spots = plannedSpots(3, placement, random)
          expect(spots.length).toBeLessThanOrEqual(3)
          expect(pairsOverlap(spots, placement), `${width}x${height}: ${JSON.stringify(spots)}`).toBe(false)
        }
      }
    }
  })

  it('a crowded window gets fewer ghosts instead of a stacked one: pickSpot has no free spot, so it is null', () => {
    const random = seeded(22)
    const placement = page(1920, 400, false)
    const spots: Spot[] = []
    for (let index = 0; index < 20; index += 1) {
      const spot = pickSpot(placement, { taken: spots, windowOnly: true, random })
      if (spot === null) break
      spots.push(spot)
    }
    expect(spots.length).toBeLessThan(20)
    expect(pairsOverlap(spots, placement)).toBe(false)
    expect(pickSpot(placement, { taken: spots, windowOnly: true, random })).toBeNull()
  })

  it('with room on both sides, at 1280x800, no more than two of three ghosts stand on one side', () => {
    const random = seeded(23)
    for (const footer of [true, false]) {
      for (let run = 0; run < 100; run += 1) {
        resetPlannedSpots()
        const placement = page(1280, 800, footer)
        const spots = plannedSpots(3, placement, random)
        expect(spots).toHaveLength(3)
        const left = spots.filter((spot) => spotCenter(spot, placement).x < placement.viewWidth / 2).length
        expect(left).toBeGreaterThanOrEqual(1)
        expect(left).toBeLessThanOrEqual(2)
      }
    }
  })

  it('planned spots are planned again for a different window: a spot that no longer fits is dropped', () => {
    const random = seeded(10)
    const placement = page(1920, 1200, false)
    const first = plannedSpots(3, placement, random)
    const squat: Placement = { ...placement, height: 400 }
    for (const spot of plannedSpots(3, squat, random)) expect(isValidSpot(spot, squat, true)).toBe(true)
    expect(first).toHaveLength(3)
  })
})
