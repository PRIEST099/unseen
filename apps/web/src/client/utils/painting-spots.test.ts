import { describe, expect, it } from 'vitest'
import { ART_BOX, EYES, EYE_SPREAD, EYE_Y, artTurn } from './ghost-art'
import { boxesIntersect } from './ghost-spots'
import type { Box, Point } from './ghost-spots'
import {
  ALONG_INSET,
  DAYLIGHT_SIZE_MAX,
  DAYLIGHT_SIZE_MIN,
  PAINTING_GAP,
  PAINTING_SIZE_MAX,
  PAINTING_SIZE_MIN,
  ghostOrigin,
  isValidPaintingSpot,
  paintingGhostSize,
  paintingUpright,
  pickPaintingSpot,
  planPaintingGhost,
  spotCenter,
  visibleBox,
} from './painting-spots'
import type { PaintingBox, PaintingPlan, PaintingSpot } from './painting-spots'

/** A small seeded generator (mulberry32): the same samples on every run, so a failure can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WIDTHS = [320, 375, 480, 640, 768, 1024, 1280, 1440, 1920]
const HEIGHTS = [90, 120, 160, 200, 260, 320, 400, 500, 600]

/** The drawn face in picture coordinates, worked out here from the art constants, not from `faceBox`. */
function faceOf(spot: PaintingSpot, size: number, box: PaintingBox, mood: 'looking' | 'startled' | 'sleepy'): Box {
  const origin = ghostOrigin(spot, size, box)
  const turn = (artTurn(spot.edge, spot.edge !== 'bottom') * Math.PI) / 180
  const scale = size / ART_BOX
  const place = (x: number, y: number): Point => {
    const dx = x - 60
    const dy = y - 60
    return {
      x: origin.x + (60 + dx * Math.cos(turn) - dy * Math.sin(turn)) * scale,
      y: origin.y + (60 + dx * Math.sin(turn) + dy * Math.cos(turn)) * scale,
    }
  }
  const { rx, ry } = EYES[mood]
  const reachX = Math.hypot(rx * Math.cos(turn), ry * Math.sin(turn)) * scale
  const reachY = Math.hypot(rx * Math.sin(turn), ry * Math.cos(turn)) * scale
  const parts = [place(60 - EYE_SPREAD, EYE_Y), place(60 + EYE_SPREAD, EYE_Y)]
  const dome = place(60, 5)
  return {
    left: Math.min(dome.x, ...parts.map((eye) => eye.x - reachX)),
    right: Math.max(dome.x, ...parts.map((eye) => eye.x + reachX)),
    top: Math.min(dome.y, ...parts.map((eye) => eye.y - reachY)),
    bottom: Math.max(dome.y, ...parts.map((eye) => eye.y + reachY)),
  }
}

function inside(inner: Box, outer: Box, slack = 0.01): boolean {
  return inner.left >= outer.left - slack && inner.top >= outer.top - slack && inner.right <= outer.right + slack && inner.bottom <= outer.bottom + slack
}

function boxes(): PaintingBox[] {
  const out: PaintingBox[] = []
  for (const width of WIDTHS) for (const height of HEIGHTS) out.push({ width, height, excluded: [] })
  return out
}

describe('paintingGhostSize', () => {
  it('is about 47% of the picture height, clamped to 56-150 px', () => {
    expect(paintingGhostSize(100, false)).toBe(PAINTING_SIZE_MIN)
    expect(paintingGhostSize(2000, false)).toBe(PAINTING_SIZE_MAX)
    expect(paintingGhostSize(300, false)).toBe(141)
  })

  it('the Daylight ghost is about 70% of that, clamped to 40-105 px', () => {
    expect(paintingGhostSize(100, true)).toBe(DAYLIGHT_SIZE_MIN)
    expect(paintingGhostSize(2000, true)).toBe(DAYLIGHT_SIZE_MAX)
    for (const height of HEIGHTS) {
      const normal = paintingGhostSize(height, false)
      const sleepy = paintingGhostSize(height, true)
      expect(sleepy).toBeLessThanOrEqual(normal)
      expect(Math.abs(sleepy - Math.max(DAYLIGHT_SIZE_MIN, Math.min(DAYLIGHT_SIZE_MAX, normal * 0.7)))).toBeLessThanOrEqual(1)
    }
  })
})

describe('planPaintingGhost: pictures from 320 to 1920 px wide and 90 to 600 px tall', () => {
  it('every planned spot shows the dome and both eyes inside the picture, in every pose it is drawn in', () => {
    let planned = 0
    for (const box of boxes()) {
      const plan = planPaintingGhost(box, false)
      if (plan === null) continue
      planned += 1
      for (const spot of plan.spots) {
        for (const mood of ['looking', 'startled'] as const) {
          const face = faceOf(spot, plan.size, box, mood)
          expect(inside(face, { left: 0, top: 0, right: box.width, bottom: box.height }), `${box.width}x${box.height} ${spot.edge}@${spot.pos} ${mood}`).toBe(true)
          expect(inside(face, visibleBox(spot, plan.size, box)), `${box.width}x${box.height} ${spot.edge}@${spot.pos} ${mood} in the visible part`).toBe(true)
        }
      }
    }
    expect(planned).toBeGreaterThan(40)
  })

  it('a ghost on a left or right edge is planned upright, with both eyes side by side inside the picture', () => {
    let sides = 0
    for (const box of boxes()) {
      const plan = planPaintingGhost(box, false)
      if (plan === null) continue
      const inner: Box = { left: 0, top: 0, right: box.width, bottom: box.height }
      for (const spot of plan.spots) {
        expect(paintingUpright(spot.edge), `${spot.edge}`).toBe(spot.edge !== 'bottom')
        if (spot.edge === 'bottom') continue
        sides += 1
        // The art is turned by a lean of well under a quarter turn, not lying on its side.
        expect(Math.abs(artTurn(spot.edge, paintingUpright(spot.edge)))).toBeLessThan(45)
        for (const mood of ['looking', 'startled'] as const) {
          const face = faceOf(spot, plan.size, box, mood)
          expect(inside(face, inner), `${box.width}x${box.height} ${spot.edge}@${spot.pos} ${mood}`).toBe(true)
          expect(inside(face, visibleBox(spot, plan.size, box))).toBe(true)
        }
        // The eye centres differ more across than down.
        const origin = ghostOrigin(spot, plan.size, box)
        const turn = (artTurn(spot.edge, true) * Math.PI) / 180
        const scale = plan.size / ART_BOX
        const centre = (x: number): Point => ({
          x: origin.x + (60 + (x - 60) * Math.cos(turn) - (EYE_Y - 60) * Math.sin(turn)) * scale,
          y: origin.y + (60 + (x - 60) * Math.sin(turn) + (EYE_Y - 60) * Math.cos(turn)) * scale,
        })
        const [a, b] = [centre(60 - EYE_SPREAD), centre(60 + EYE_SPREAD)]
        expect(Math.abs(a.y - b.y)).toBeLessThan(Math.abs(a.x - b.x))
      }
    }
    expect(sides).toBeGreaterThan(20)
  })

  it('the cropped svg box is inside the picture, with the bob room kept along the edge', () => {
    for (const box of boxes()) {
      const plan = planPaintingGhost(box, false)
      if (plan === null) continue
      for (const spot of plan.spots) {
        const visible = visibleBox(spot, plan.size, box)
        expect(inside(visible, { left: 0, top: 0, right: box.width, bottom: box.height })).toBe(true)
        const along = spot.edge === 'bottom' ? [visible.left, box.width - visible.right] : [visible.top, box.height - visible.bottom]
        for (const room of along) expect(room).toBeGreaterThanOrEqual(ALONG_INSET - 0.01)
      }
    }
  })

  it('a ghost reaches in from its own edge and its hands rest on it', () => {
    const box: PaintingBox = { width: 800, height: 400, excluded: [] }
    const plan = planPaintingGhost(box, false)
    expect(plan).not.toBeNull()
    for (const spot of plan?.spots ?? []) {
      const visible = visibleBox(spot, plan?.size ?? 0, box)
      if (spot.edge === 'left') expect(visible.left).toBe(0)
      if (spot.edge === 'right') expect(visible.right).toBeCloseTo(box.width, 5)
      if (spot.edge === 'bottom') expect(visible.bottom).toBeCloseTo(box.height, 5)
    }
  })

  it('never intersects an excluded rectangle, with the gap, wherever it is drawn over the picture', () => {
    const random = seeded(7)
    for (let run = 0; run < 300; run += 1) {
      const width = 320 + Math.floor(random() * 1600)
      const height = 160 + Math.floor(random() * 440)
      const left = random() * width
      const top = random() * height
      const excluded: Box = { left, top, right: Math.min(width + 50, left + 30 + random() * 400), bottom: Math.min(height + 50, top + 20 + random() * 200) }
      const box: PaintingBox = { width, height, excluded: [excluded] }
      const plan = planPaintingGhost(box, false)
      if (plan === null) continue
      for (const spot of plan.spots) {
        expect(boxesIntersect(visibleBox(spot, plan.size, box), excluded, PAINTING_GAP)).toBe(false)
      }
    }
  })

  it('a landing-page plaque over the bottom of the picture keeps the bottom spots clear of it', () => {
    const box: PaintingBox = { width: 1000, height: 560, excluded: [{ left: 130, top: 520, right: 870, bottom: 600 }] }
    const plan = planPaintingGhost(box, false)
    expect(plan).not.toBeNull()
    expect(plan?.spots.length ?? 0).toBeGreaterThan(0)
    for (const spot of plan?.spots ?? []) {
      expect(boxesIntersect(visibleBox(spot, plan?.size ?? 0, box), box.excluded[0] ?? { left: 0, top: 0, right: 0, bottom: 0 }, PAINTING_GAP)).toBe(false)
    }
  })

  it('a picture too short for a ghost at the floor size with both eyes showing has none', () => {
    for (const width of WIDTHS) {
      expect(planPaintingGhost({ width, height: 30, excluded: [] }, false)).toBeNull()
      expect(planPaintingGhost({ width, height: 0, excluded: [] }, false)).toBeNull()
    }
    expect(planPaintingGhost({ width: 0, height: 300, excluded: [] }, false)).toBeNull()
    // A picture covered all over by something drawn on it has no clear spot either.
    expect(planPaintingGhost({ width: 600, height: 300, excluded: [{ left: -10, top: -10, right: 610, bottom: 310 }] }, false)).toBeNull()
  })

  it('the Daylight ghost honours its own floor (40 px) and never goes below it', () => {
    let belowNormalFloor = 0
    for (const box of boxes()) {
      const plan = planPaintingGhost(box, true)
      if (plan === null) continue
      expect(plan.size).toBeGreaterThanOrEqual(DAYLIGHT_SIZE_MIN)
      expect(plan.size).toBeLessThanOrEqual(DAYLIGHT_SIZE_MAX)
      if (plan.size < PAINTING_SIZE_MIN) belowNormalFloor += 1
      for (const spot of plan.spots) expect(isValidPaintingSpot(spot, plan.size, box)).toBe(true)
    }
    expect(belowNormalFloor).toBeGreaterThan(0)
  })

  it('a sleepy ghost shows its face wherever a looking one does', () => {
    for (const box of boxes()) {
      const plan = planPaintingGhost(box, true)
      if (plan === null) continue
      for (const spot of plan.spots) {
        expect(inside(faceOf(spot, plan.size, box, 'sleepy'), visibleBox(spot, plan.size, box))).toBe(true)
      }
    }
  })
})

describe('pickPaintingSpot', () => {
  const box: PaintingBox = { width: 1000, height: 500, excluded: [] }
  const plan = planPaintingGhost(box, false) as PaintingPlan

  it('prefers a different spot, farther than 180 px from the lantern', () => {
    const random = seeded(3)
    const previous = plan.spots[0] as PaintingSpot
    const lantern: Point = { x: 500, y: 250 }
    for (let run = 0; run < 100; run += 1) {
      const spot = pickPaintingSpot(plan, box, { previous, lantern, random })
      expect(spot).not.toBeNull()
      if (spot === null) continue
      expect(spot.edge !== previous.edge || Math.abs(spot.pos - previous.pos) >= 60).toBe(true)
      const centre = spotCenter(spot, plan.size, box)
      expect(Math.hypot(centre.x - lantern.x, centre.y - lantern.y)).toBeGreaterThan(180)
    }
  })

  it('with no spot far enough from the lantern, takes the valid spot farthest from it', () => {
    const small: PaintingBox = { width: 200, height: 120, excluded: [] }
    const little = planPaintingGhost(small, false)
    expect(little).not.toBeNull()
    if (little === null) return
    const lantern: Point = { x: 100, y: 60 }
    const spot = pickPaintingSpot(little, small, { lantern, random: seeded(1) })
    expect(spot).not.toBeNull()
    if (spot === null) return
    const distance = (candidate: PaintingSpot): number => {
      const centre = spotCenter(candidate, little.size, small)
      return Math.hypot(centre.x - lantern.x, centre.y - lantern.y)
    }
    for (const other of little.spots) expect(distance(spot)).toBeGreaterThanOrEqual(distance(other) - 1e-9)
  })

  it('always returns a valid spot of the plan, and null only for an empty plan', () => {
    const random = seeded(11)
    for (let run = 0; run < 100; run += 1) {
      const lantern: Point = { x: random() * 1000, y: random() * 500 }
      const spot = pickPaintingSpot(plan, box, { lantern, random })
      expect(spot).not.toBeNull()
      if (spot !== null) expect(isValidPaintingSpot(spot, plan.size, box)).toBe(true)
    }
    expect(pickPaintingSpot({ size: 100, spots: [] }, box, { random })).toBeNull()
  })
})
