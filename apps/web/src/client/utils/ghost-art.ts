/**
 * The geometry of the ghost drawing (`components/Ghost.tsx`), shared with the spot planner so that a
 * spot is only planned where the face of the ghost, in the pose it is drawn in, actually shows.
 *
 * The drawing is a 120 x 120 viewBox. Unturned, the hands rest on the bottom edge and the dome is at
 * the top. The whole drawing is turned about its centre (CSS `rotate`, clockwise on screen).
 */

export type GhostEdge = 'top' | 'right' | 'bottom' | 'left'
export type GhostMood = 'looking' | 'startled' | 'sleepy'

export const ART_BOX = 120
export const EYE_Y = 46
export const EYE_SPREAD = 20
/**
 * Eyes are big, tall black ovals: about 18% of the body width and 28% of its height. Startled eyes are
 * rounder and about 15% larger.
 */
export const EYES: Record<GhostMood, { rx: number; ry: number }> = {
  looking: { rx: 9, ry: 16 },
  startled: { rx: 11, ry: 17.5 },
  /** Half-closed: the same width and about half the height, so a sleepy face fits wherever a looking one does. */
  sleepy: { rx: 9, ry: 8 },
}
/** The top of the dome (the highest point of the body path). */
const DOME_TOP = { x: 60, y: 5 }

/** Unturned, the hands rest on the bottom edge. Each edge is a quarter turn, plus a lean into the page. */
const EDGE_TURN: Record<GhostEdge, number> = { bottom: 0, left: 90, top: 180, right: 270 }
const LEAN_DEGREES = 8
const UPRIGHT_LEAN_DEGREES = 22

/** The turn of the drawing in degrees (clockwise) for the edge its hands hold. */
export function artTurn(edge: GhostEdge, upright: boolean): number {
  const sideways = edge === 'left' || edge === 'right'
  if (upright && sideways) return (edge === 'right' ? -1 : 1) * UPRIGHT_LEAN_DEGREES
  const lean = sideways ? LEAN_DEGREES : 0
  return EDGE_TURN[edge] + (edge === 'right' ? -lean : lean)
}

/** A box in fractions of the ghost's box: 0 is its left (top) edge and 1 its right (bottom) edge. */
export type FaceBox = { left: number; top: number; right: number; bottom: number }

/**
 * Where the dome top and both eyes are in the ghost's box once the drawing is turned, as fractions of
 * the box. A spot shows the face when this whole box is in the part of the ghost that shows.
 */
export function faceBox(edge: GhostEdge, upright: boolean, mood: GhostMood = 'looking'): FaceBox {
  const radians = (artTurn(edge, upright) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const half = ART_BOX / 2
  const turn = (x: number, y: number): { x: number; y: number } => ({
    x: half + (x - half) * cos - (y - half) * sin,
    y: half + (x - half) * sin + (y - half) * cos,
  })
  const { rx, ry } = EYES[mood]
  // The half-width and half-height of a turned ellipse.
  const reachX = Math.hypot(rx * cos, ry * sin)
  const reachY = Math.hypot(rx * sin, ry * cos)
  const eyes = [turn(half - EYE_SPREAD, EYE_Y), turn(half + EYE_SPREAD, EYE_Y)]
  const dome = turn(DOME_TOP.x, DOME_TOP.y)
  const left = Math.min(dome.x, ...eyes.map((eye) => eye.x - reachX))
  const right = Math.max(dome.x, ...eyes.map((eye) => eye.x + reachX))
  const top = Math.min(dome.y, ...eyes.map((eye) => eye.y - reachY))
  const bottom = Math.max(dome.y, ...eyes.map((eye) => eye.y + reachY))
  return { left: left / ART_BOX, top: top / ART_BOX, right: right / ART_BOX, bottom: bottom / ART_BOX }
}
