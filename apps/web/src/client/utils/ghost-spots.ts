/**
 * Where the margin ghosts may sit, and the geometry the lantern tests against.
 *
 * The ghosts live in a fixed layer BEHIND the page (under the header, the content panel and the
 * footer, above the wall), so a ghost can never cover text, controls or a focus outline. A spot is
 * one of:
 *   - a side spot: the ghost peeks into the left or right margin, from behind the window edge
 *     (`anchor: 'window'`) or from behind the content panel's side edge (`anchor: 'panel'`);
 *   - a bottom spot: the ghost peeks up from the bottom edge of the window, into a margin.
 * `pos` is the top of the ghost box for a side spot and its left for a bottom spot.
 *
 * A spot is only ever planned where the ghost, in the pose it is drawn in, shows its dome and both
 * eyes. Where no spot can (a narrow margin), there are fewer ghosts, or a smaller one, or none: never
 * an eyeless sliver.
 */

import { faceBox } from './ghost-art'
import type { FaceBox } from './ghost-art'

export const GHOST_SIZE_LARGE = 150
export const GHOST_SIZE_SMALL = 120
/** The smallest a ghost is drawn (5rem) when a narrow margin cannot show the face of a larger one. */
export const GHOST_SIZE_MIN = 80
/** The lantern (pointer) or the focus startles a ghost within this many px. */
export const NEAR_PX = 180
/** A hidden ghost re-emerges this long after the lantern was last near its old spot. */
export const REEMERGE_MS = 4000
/** The panel's own ring and shadow: a ghost never shows inside it. */
export const PANEL_RING = 6
/** Extra travel past an edge so a hidden ghost's glow is gone too. */
export const HIDE_EXTRA = 24
/** Free space kept between a side ghost and the top of the footer. */
export const FOOTER_GAP = 8
/** Margin assumed on each side when the content panel cannot be measured. */
const DEFAULT_MARGIN = 160
/** How much of the ghost shows (along its axis of travel) when there is room: the dome, eyes and hands. */
const PEEK_RATIO = 0.74
/** The part of a bottom ghost's width that must be over the wall: wider than its dome and both eyes. */
const FACE_FROM = 0.15
const FACE_TO = 0.85
/** Rounding allowance (px) when checking that the face shows. */
const FACE_SLACK_PX = 0.5
/** Free space kept between a side ghost and the bottom of the window. */
const WINDOW_BOTTOM_GAP = 16
/** Gap kept between two ghosts' visible parts. */
export const GHOST_GAP = 8
/** A different spot on the same edge is at least this far along it. */
const MIN_MOVE = 60
const TRIES = 40
const SIZE_STEP = 2
const MIN_WIDTH_TWO = 768
const MIN_WIDTH_THREE = 1100

export type Edge = 'left' | 'right' | 'bottom'
export type Anchor = 'window' | 'panel'
export type Spot = { edge: Edge; anchor: Anchor; pos: number }
export type Point = { x: number; y: number }
export type Box = { left: number; top: number; right: number; bottom: number }

export type Placement = {
  /** `window.innerWidth`: what the breakpoints and media queries use. */
  innerWidth: number
  /** The width the fixed layer spans (without a scrollbar). */
  viewWidth: number
  height: number
  /** Ghost box size in px: 150 from 1100 px wide and 120 below, smaller where only that shows the face. */
  size: number
  /** Lowest y a side ghost may take: below the header, so a ghost never sits under the header controls. */
  minY: number
  /** Left and right edges of the content panel (`#main`), as viewport x. */
  panelLeft: number
  panelRight: number
  /** The y range in which the panel stands at every scroll position (Infinity / -Infinity: unmeasured). */
  panelMinY: number
  panelMaxY: number
  /**
   * The highest point on screen the footer's top edge can reach at any scroll position (viewport y).
   * The footer is opaque and the ghosts are behind it, so nothing of a ghost may be planned below this.
   * Infinity when there is no footer.
   */
  footerTop: number
}

export function ghostCountFor(width: number): number {
  if (width >= MIN_WIDTH_THREE) return 3
  if (width >= MIN_WIDTH_TWO) return 2
  return 0
}

export function ghostSizeFor(width: number): number {
  return width >= MIN_WIDTH_THREE ? GHOST_SIZE_LARGE : GHOST_SIZE_SMALL
}

/** The footer's highest reachable top on screen: its top in the document, less the furthest scroll. */
function readFooterTop(root: HTMLElement, height: number): number {
  const rect = document.querySelector<HTMLElement>('footer.app-footer')?.getBoundingClientRect()
  if (rect === undefined || rect.height <= 0) return Number.POSITIVE_INFINITY
  const maxScroll = Math.max(0, root.scrollHeight - height)
  return rect.top + window.scrollY - maxScroll
}

/** Reads the viewport, the header, the content panel and the footer from the DOM. Call it after the page has rendered. */
export function readPlacement(): Placement {
  const innerWidth = window.innerWidth
  const root = document.documentElement
  const viewWidth = root.clientWidth > 0 ? root.clientWidth : innerWidth
  const height = root.clientHeight > 0 ? root.clientHeight : window.innerHeight
  const header = document.querySelector<HTMLElement>('header.app-header')
  const rect = document.getElementById('main')?.getBoundingClientRect()
  const measured = rect !== undefined && rect.width > 0
  const scrollY = window.scrollY
  const belowPanel = measured ? Math.max(0, root.scrollHeight - (rect.bottom + scrollY)) : 0
  return fitSize({
    innerWidth,
    viewWidth,
    height,
    size: ghostSizeFor(innerWidth),
    minY: (header?.offsetHeight ?? 0) + 24,
    panelLeft: measured ? Math.max(0, rect.left) : DEFAULT_MARGIN,
    panelRight: measured ? Math.min(viewWidth, rect.right) : viewWidth - DEFAULT_MARGIN,
    panelMinY: measured ? rect.top + scrollY : Number.POSITIVE_INFINITY,
    panelMaxY: measured ? height - belowPanel : Number.NEGATIVE_INFINITY,
    footerTop: readFooterTop(root, height),
  })
}

/**
 * The largest ghost, from the size for this width down to `GHOST_SIZE_MIN`, that has a spot showing its
 * face. When none has, the placement keeps the size for its width and has no room (no ghosts).
 */
export function fitSize(placement: Placement): Placement {
  const largest = ghostSizeFor(placement.innerWidth)
  for (let size = largest; size >= GHOST_SIZE_MIN; size -= SIZE_STEP) {
    const sized = { ...placement, size }
    if (hasRoom(sized)) return sized
  }
  return { ...placement, size: largest }
}

export function samePlacement(a: Placement, b: Placement): boolean {
  return (Object.keys(a) as (keyof Placement)[]).every((key) => a[key] === b[key])
}

/** How far a ghost's face reaches into the screen when there is room for all of it. */
export function peekDepth(placement: Placement): number {
  return Math.round(placement.size * PEEK_RATIO)
}

/** How many px of a side ghost show: all of its depth, or as much of the margin as there is. */
export function sideDepth(edge: 'left' | 'right', placement: Placement): number {
  const margin = edge === 'left' ? placement.panelLeft : placement.viewWidth - placement.panelRight
  return Math.max(0, Math.min(peekDepth(placement), margin - PANEL_RING))
}

function depthOf(spot: Spot, placement: Placement): number {
  return spot.edge === 'bottom' ? peekDepth(placement) : sideDepth(spot.edge, placement)
}

/** Where the ghost's box sits when it peeks (top-left corner, viewport px). */
export function peekPosition(spot: Spot, placement: Placement): Point {
  const depth = depthOf(spot, placement)
  const size = placement.size
  if (spot.edge === 'bottom') return { x: spot.pos, y: placement.height - depth }
  if (spot.edge === 'left') {
    return { x: spot.anchor === 'window' ? depth - size : placement.panelLeft - PANEL_RING - depth, y: spot.pos }
  }
  return {
    x: spot.anchor === 'window' ? placement.viewWidth - depth : placement.panelRight + PANEL_RING + depth - size,
    y: spot.pos,
  }
}

/** The move that takes a peeking ghost completely out of sight: behind the window edge or the panel. */
export function hiddenShift(spot: Spot, placement: Placement): Point {
  const depth = depthOf(spot, placement)
  if (spot.edge === 'bottom') return { x: 0, y: depth + HIDE_EXTRA }
  const behindPanel = spot.anchor === 'panel' ? PANEL_RING : 0
  const distance = depth + behindPanel + HIDE_EXTRA
  const towardsLeft = (spot.edge === 'left') === (spot.anchor === 'window')
  return { x: towardsLeft ? -distance : distance, y: 0 }
}

/** The edge the art's hands hold: the side its hem and hands are on (away from where the face points). */
export function artEdge(spot: Spot): 'left' | 'right' | 'bottom' {
  if (spot.edge === 'bottom') return 'bottom'
  if (spot.anchor === 'window') return spot.edge
  return spot.edge === 'left' ? 'right' : 'left'
}

/** A side ghost may stand nearly upright (as in the thumbnail) only when the margin shows this much of it. */
export const UPRIGHT_MIN_RATIO = 0.62

/**
 * A side ghost is drawn nearly upright when the margin shows most of it AND the upright pose still
 * shows its dome and both eyes; else it is turned on its side, where the face sits nearer the middle.
 */
export function artUpright(spot: Spot, placement: Placement): boolean {
  if (spot.edge === 'bottom') return false
  if (sideDepth(spot.edge, placement) < placement.size * UPRIGHT_MIN_RATIO) return false
  return showsFace(spot, placement, true)
}

/** The lowest y anything of a ghost may show at: the window bottom, or the footer's top when it is higher. */
function floorOf(placement: Placement): number {
  return Math.min(placement.height, placement.footerTop)
}

/** The part of the ghost that shows. */
export function visibleBox(spot: Spot, placement: Placement): Box {
  const depth = depthOf(spot, placement)
  const floor = floorOf(placement)
  if (spot.edge === 'bottom') {
    // Only the part over the wall shows: the side margin the ghost's middle is in.
    const inLeftMargin = spot.pos + placement.size / 2 < placement.viewWidth / 2
    const left = inLeftMargin ? Math.max(0, spot.pos) : Math.max(placement.panelRight + PANEL_RING, spot.pos)
    const wallRight = inLeftMargin ? placement.panelLeft - PANEL_RING : placement.viewWidth
    const right = Math.max(left, Math.min(wallRight, spot.pos + placement.size))
    return { left, right, top: Math.min(placement.height - depth, floor), bottom: floor }
  }
  // The footer is opaque: whatever of the ghost is below its highest top is behind it.
  const bottom = Math.min(spot.pos + placement.size, floor)
  const top = Math.min(spot.pos, bottom)
  if (spot.edge === 'left') {
    const right = spot.anchor === 'window' ? depth : placement.panelLeft - PANEL_RING
    return { left: right - depth, top, right, bottom }
  }
  const left = spot.anchor === 'window' ? placement.viewWidth - depth : placement.panelRight + PANEL_RING
  return { left, top, right: left + depth, bottom }
}

/** The part of the ghost that shows, in fractions of its box (0 is its left or top edge). */
export function shownFraction(spot: Spot, placement: Placement): FaceBox {
  const size = placement.size
  const box = visibleBox(spot, placement)
  const at = peekPosition(spot, placement)
  return {
    left: (box.left - at.x) / size,
    top: (box.top - at.y) / size,
    right: (box.right - at.x) / size,
    bottom: (box.bottom - at.y) / size,
  }
}

/** Whether the dome and both eyes of the ghost show at this spot, in the given pose (by default, the one drawn). */
export function showsFace(spot: Spot, placement: Placement, upright?: boolean): boolean {
  const face = faceBox(artEdge(spot), upright ?? artUpright(spot, placement))
  const shown = shownFraction(spot, placement)
  const slack = FACE_SLACK_PX / placement.size
  return (
    face.left >= shown.left - slack &&
    face.right <= shown.right + slack &&
    face.top >= shown.top - slack &&
    face.bottom <= shown.bottom + slack
  )
}

/** The middle of the part of the ghost that shows. */
export function spotCenter(spot: Spot, placement: Placement): Point {
  const box = visibleBox(spot, placement)
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
}

export function distanceToPoint(from: Point, to: Point): number {
  return Math.hypot(from.x - to.x, from.y - to.y)
}

/** Distance from a point to the nearest point of a box (0 when inside). */
export function distanceToBox(from: Point, box: Box): number {
  const dx = Math.max(box.left - from.x, 0, from.x - box.right)
  const dy = Math.max(box.top - from.y, 0, from.y - box.bottom)
  return Math.hypot(dx, dy)
}

export function boxesIntersect(a: Box, b: Box, gap = 0): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap
}

/** A different spot: another edge or anchor, or at least a little way along the same edge. */
export function isDifferentSpot(a: Spot, b: Spot): boolean {
  return a.edge !== b.edge || a.anchor !== b.anchor || Math.abs(a.pos - b.pos) >= MIN_MOVE
}

type Option = { edge: Edge; anchor: Anchor; lo: number; hi: number }

/** Spots are whole pixels: the range is narrowed to the whole pixels inside it (null when there are none). */
function integral(option: Option): Option | null {
  const lo = Math.ceil(option.lo)
  const hi = Math.floor(option.hi)
  return hi >= lo ? { ...option, lo, hi } : null
}

/** An option is kept only if a ghost on it shows its face (checked at the start of its range). */
function withFace(option: Option | null, placement: Placement): Option | null {
  if (option === null) return null
  return showsFace({ edge: option.edge, anchor: option.anchor, pos: option.lo }, placement) ? option : null
}

function sideOption(edge: 'left' | 'right', anchor: Anchor, placement: Placement): Option | null {
  const panel = anchor === 'panel'
  if (sideDepth(edge, placement) <= 0) return null
  const lo = Math.max(placement.minY, panel ? placement.panelMinY : Number.NEGATIVE_INFINITY)
  const hi = Math.min(
    placement.height - placement.size - WINDOW_BOTTOM_GAP,
    placement.footerTop - placement.size - FOOTER_GAP,
    panel ? placement.panelMaxY - placement.size : Number.POSITIVE_INFINITY,
  )
  return withFace(integral({ edge, anchor, lo, hi }), placement)
}

/**
 * A bottom spot needs wall at the window's bottom edge: the face must fit inside a side margin. None
 * where the footer can stand at the bottom of the window, since it would hide the ghost's eyes.
 */
function bottomOptions(placement: Placement): Option[] {
  if (placement.footerTop < placement.height) return []
  const size = placement.size
  const left: Option = {
    edge: 'bottom',
    anchor: 'window',
    lo: -FACE_FROM * size,
    hi: placement.panelLeft - PANEL_RING - FACE_TO * size,
  }
  const right: Option = {
    edge: 'bottom',
    anchor: 'window',
    lo: placement.panelRight + PANEL_RING - FACE_FROM * size,
    hi: placement.viewWidth - FACE_TO * size,
  }
  return [left, right]
    .map((option) => withFace(integral(option), placement))
    .filter((option): option is Option => option !== null)
}

function optionsFor(placement: Placement, windowOnly: boolean): Option[] {
  const anchors: Anchor[] = windowOnly ? ['window'] : ['window', 'panel']
  const sides = anchors.flatMap((anchor) =>
    (['left', 'right'] as const).map((edge) => sideOption(edge, anchor, placement)),
  )
  return [...sides, ...bottomOptions(placement)].filter((option): option is Option => option !== null)
}

/** Whether any spot at the window edges shows a ghost's face under this placement. */
export function hasRoom(placement: Placement): boolean {
  return optionsFor(placement, true).length > 0
}

/** How many ghosts this page gets: the count for the width, or none when no spot shows a face. */
export function ghostCountForPlacement(placement: Placement): number {
  return hasRoom(placement) ? ghostCountFor(placement.innerWidth) : 0
}

/** Whether a spot is still allowed under this placement (the window or the panel may have moved). */
export function isValidSpot(spot: Spot, placement: Placement, windowOnly = false): boolean {
  return optionsFor(placement, windowOnly).some(
    (option) =>
      option.edge === spot.edge && option.anchor === spot.anchor && spot.pos >= option.lo - 1 && spot.pos <= option.hi + 1,
  )
}

type PickOptions = {
  taken: readonly Spot[]
  /** The ghost's previous spot: the new one must differ from it. */
  previous?: Spot
  /** The lantern: the new spot must not be within `NEAR_PX` of it. */
  lantern?: Point | null
  /** Only spots at the window edges (the intro's ghosts dart to those). */
  windowOnly?: boolean
  random: () => number
}

function candidate(options: readonly Option[], random: () => number): Spot | null {
  const option = options[Math.min(options.length - 1, Math.floor(random() * options.length))]
  if (option === undefined) return null
  return { edge: option.edge, anchor: option.anchor, pos: Math.round(option.lo + random() * (option.hi - option.lo)) }
}

/** Most ghosts allowed on one side of the window while the other side has room. */
const MAX_PER_SIDE = 2

/** Which half of the window the shown part of a ghost is in. */
function sideOf(spot: Spot, placement: Placement): 'left' | 'right' {
  return spotCenter(spot, placement).x < placement.viewWidth / 2 ? 'left' : 'right'
}

/** Whether the spot would be a third ghost on its side while some option on the other side exists. */
function crowdsSide(spot: Spot, options: readonly Option[], placement: Placement, taken: readonly Spot[]): boolean {
  const side = sideOf(spot, placement)
  if (taken.filter((other) => sideOf(other, placement) === side).length < MAX_PER_SIDE) return false
  return options.some((option) => sideOf({ edge: option.edge, anchor: option.anchor, pos: option.lo }, placement) !== side)
}

function acceptable(
  spot: Spot,
  placement: Placement,
  pick: PickOptions,
  options: readonly Option[],
  keepAwayFromLantern: boolean,
): boolean {
  const box = visibleBox(spot, placement)
  if (pick.taken.some((other) => boxesIntersect(box, visibleBox(other, placement), GHOST_GAP))) return false
  if (pick.previous !== undefined && !isDifferentSpot(spot, pick.previous)) return false
  if (crowdsSide(spot, options, placement, pick.taken)) return false
  if (!keepAwayFromLantern || pick.lantern === undefined || pick.lantern === null) return true
  return distanceToPoint(spotCenter(spot, placement), pick.lantern) > NEAR_PX
}

/**
 * Picks a free spot; relaxes the lantern rule when the screen is crowded. Null when no spot is free
 * (a ghost is never put over another) or when no spot shows a ghost's face.
 */
export function pickSpot(placement: Placement, pick: PickOptions): Spot | null {
  const options = optionsFor(placement, pick.windowOnly === true)
  if (options.length === 0) return null
  for (const keepAwayFromLantern of [true, false]) {
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      const spot = candidate(options, pick.random)
      if (spot !== null && acceptable(spot, placement, pick, options, keepAwayFromLantern)) return spot
    }
  }
  return scan(options, placement, pick)
}

/** The step of the last-resort sweep along each option. */
const SCAN_STEP = 8

/** Every option swept in order, so that null means no spot is free, not that the random draws missed. */
function scan(options: readonly Option[], placement: Placement, pick: PickOptions): Spot | null {
  for (const option of options) {
    for (let pos = option.lo; pos <= option.hi + SCAN_STEP - 1; pos += SCAN_STEP) {
      const spot: Spot = { edge: option.edge, anchor: option.anchor, pos: Math.min(pos, option.hi) }
      if (acceptable(spot, placement, pick, options, false)) return spot
    }
  }
  return null
}

/** Spots planned once per page, so a margin ghost that is fitted again keeps the spot it was first given. */
let planned: Spot[] = []

/** Up to `count` spots at the window edges; fewer (or none) where no spot shows a ghost's face. */
export function plannedSpots(count: number, placement: Placement, random: () => number = Math.random): Spot[] {
  planned = planned.filter((spot) => isValidSpot(spot, placement, true))
  while (planned.length < count) {
    const spot = pickSpot(placement, { taken: planned, windowOnly: true, random })
    if (spot === null) break
    planned = [...planned, spot]
  }
  return planned.slice(0, count)
}

export function resetPlannedSpots(): void {
  planned = []
}
