import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, RefObject } from 'react'
import { useGhosts } from '../contexts/GhostsContext'
import type { PaintingLayout } from '../contexts/GhostsContext'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import { ART_BOX, artTurn } from '../utils/ghost-art'
import type { GhostMood } from '../utils/ghost-art'
import { HIDE_EXTRA, REEMERGE_MS, boxesIntersect } from '../utils/ghost-spots'
import type { Box, Point } from '../utils/ghost-spots'
import {
  depthOf,
  ghostOrigin,
  isValidPaintingSpot,
  lanternIsNear,
  paintingUpright,
  pickPaintingSpot,
  planPaintingGhost,
  shownFractions,
  visibleBox,
} from '../utils/painting-spots'
import type { PaintingBox, PaintingPlan, PaintingSpot } from '../utils/painting-spots'
import { GhostArt } from './Ghost'

/** The ghost wanders to another spot in the same painting about this often (randomised). */
export const WANDER_MIN_MS = 20_000
export const WANDER_MAX_MS = 40_000
/** The sleepy Daylight ghost wanders less often. */
export const DAYLIGHT_WANDER_MIN_MS = 40_000
export const DAYLIGHT_WANDER_MAX_MS = 60_000
/** Ducking out takes this long, at most; the ghost is hidden (`visibility`) once it has finished. */
export const DUCK_MS = 250
/** A wandering ghost waits this long out of sight before it peeks in elsewhere. */
const WANDER_AWAY_MS = 400
/** A held ghost that is due to re-peek asks again this often until the hold is released. */
const HOLD_POLL_MS = 500

type PaintingGhostProps = {
  /** An audit lens: no endless animation, no motion on first mount; only the finite duck and re-peek. */
  calm?: boolean
  /** The Daylight lens: the last ghost left. Smaller, sleepy, fainter, never bobs, wanders rarely. */
  daylight?: boolean
  /** CSS selectors of things drawn over this painting (the plaque, the candle): the ghost keeps clear of them. */
  avoid?: readonly string[]
}

type Current = {
  spot: PaintingSpot | null
  /** Ducked behind the frame. */
  out: boolean
  /** Ducked because it was startled (startled eyes), not because it wanders. */
  startled: boolean
  /** Changes with every new spot, so a ghost that moves is a new node that slides in. */
  n: number
  /** Starts in its peeking spot (the first one, and the one after the tab was hidden). */
  instant: boolean
}

const EMPTY: Current = { spot: null, out: false, startled: false, n: 0, instant: true }

function sameBox(a: PaintingBox | null, b: PaintingBox | null): boolean {
  if (a === null || b === null) return a === b
  const near = (x: number, y: number): boolean => Math.abs(x - y) < 0.5
  return (
    near(a.width, b.width) &&
    near(a.height, b.height) &&
    a.excluded.length === b.excluded.length &&
    a.excluded.every((box, index) => {
      const other = b.excluded[index]
      return other !== undefined && near(box.left, other.left) && near(box.top, other.top) && near(box.right, other.right) && near(box.bottom, other.bottom)
    })
  )
}

/** The picture's inner box and what is drawn over it, from the DOM. Null while the picture has no size. */
function measure(layer: HTMLElement, avoid: readonly string[]): PaintingBox | null {
  const rect = layer.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const inner: Box = { left: 0, top: 0, right: rect.width, bottom: rect.height }
  const excluded: Box[] = []
  for (const selector of avoid) {
    for (const element of document.querySelectorAll(selector)) {
      const other = element.getBoundingClientRect()
      if (other.width <= 0 || other.height <= 0) continue
      const box: Box = { left: other.left - rect.left, top: other.top - rect.top, right: other.right - rect.left, bottom: other.bottom - rect.top }
      if (boxesIntersect(box, inner)) excluded.push(box)
    }
  }
  return { width: rect.width, height: rect.height, excluded }
}

/** Watches the picture and whatever is drawn over it; the box is measured again when any of them changes. */
function usePaintingBox(layer: RefObject<HTMLDivElement | null>, avoid: readonly string[]): PaintingBox | null {
  const [box, setBox] = useState<PaintingBox | null>(null)
  const avoidKey = avoid.join('|')
  useLayoutEffect(() => {
    const element = layer.current
    if (element === null) return undefined
    let frame = 0
    const update = (): void => {
      frame = 0
      const next = measure(element, avoidKey === '' ? [] : avoidKey.split('|'))
      setBox((previous) => (sameBox(previous, next) ? previous : next))
    }
    const schedule = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(element)
    if (avoidKey !== '') for (const element of document.querySelectorAll(avoidKey.split('|').join(', '))) observer?.observe(element)
    window.addEventListener('resize', schedule)
    void document.fonts?.ready.then(schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [layer, avoidKey])
  return box
}

function randomBetween(low: number, high: number): number {
  return low + Math.random() * (high - low)
}

type Behaviour = {
  current: Current
  mood: GhostMood
}

type BehaviourInputs = {
  layer: RefObject<HTMLDivElement | null>
  box: PaintingBox | null
  plan: PaintingPlan | null
  dynamic: boolean
  daylight: boolean
  /** An audit lens: no touch reactions (only the lantern, the tab visibility and the wander timer move it). */
  calm: boolean
}

/** Where the ghost stands, and the lantern, touch, wander and tab-visibility rules that move it. */
function usePaintingBehaviour({ layer, box, plan, dynamic, daylight, calm }: BehaviourInputs): Behaviour {
  const { introActive, readLantern, subscribePointer, subscribeTouch, isHeldStill } = useGhosts()
  const [current, setCurrent] = useState<Current>(EMPTY)
  const currentRef = useRef(current)
  currentRef.current = current
  const planRef = useRef(plan)
  planRef.current = plan
  const boxRef = useRef(box)
  boxRef.current = box
  const reemergeTimer = useRef(0)
  const awayTimer = useRef(0)
  const active = dynamic && !introActive

  /** The lantern in picture coordinates (null: none yet). */
  const localLantern = useCallback((): Point | null => {
    const lantern = readLantern()
    const rect = layer.current?.getBoundingClientRect()
    return lantern === null || rect === undefined ? null : { x: lantern.x - rect.left, y: lantern.y - rect.top }
  }, [layer, readLantern])

  const peekElsewhere = useCallback(
    (instant: boolean): void => {
      const known = planRef.current
      const frame = boxRef.current
      if (known === null || frame === null) return
      const spot = pickPaintingSpot(known, frame, { previous: currentRef.current.spot, lantern: localLantern(), random: Math.random })
      if (spot === null) return
      setCurrent((previous) => ({ spot, out: false, startled: false, n: previous.n + 1, instant }))
    },
    [localLantern],
  )

  // A new plan (first measure, a resize, a fitted-again picture): keep the spot while it is still valid.
  useLayoutEffect(() => {
    if (plan === null || box === null) {
      setCurrent(EMPTY)
      return
    }
    const kept = currentRef.current.spot
    if (kept !== null && isValidPaintingSpot(kept, plan.size, box)) return
    const spot = pickPaintingSpot(plan, box, { random: Math.random })
    setCurrent((previous) => ({ spot, out: false, startled: false, n: previous.n + 1, instant: true }))
  }, [plan, box])

  /** Re-peeks after `delay`. If the ghost is held still when that fires, it stays ducked and asks again soon. */
  const peekWhenFree = useCallback(
    (timer: { current: number }, delay: number): void => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(function fire(): void {
        if (isHeldStill()) {
          timer.current = window.setTimeout(fire, HOLD_POLL_MS)
          return
        }
        peekElsewhere(false)
      }, delay)
    },
    [isHeldStill, peekElsewhere],
  )

  const startle = useCallback((): void => {
    if (isHeldStill()) return
    setCurrent((previous) => (previous.spot === null || (previous.out && previous.startled) ? previous : { ...previous, out: true, startled: true }))
    peekWhenFree(reemergeTimer, REEMERGE_MS)
  }, [isHeldStill, peekWhenFree])

  useEffect(() => {
    if (!active) return undefined
    const stopPointer = subscribePointer((point) => {
      const spot = currentRef.current.spot
      const known = planRef.current
      const frame = boxRef.current
      const rect = layer.current?.getBoundingClientRect()
      if (spot === null || known === null || frame === null || rect === undefined) return
      if (lanternIsNear(spot, known.size, frame, { x: point.x - rect.left, y: point.y - rect.top })) startle()
    })
    // A touch startles only when it lands inside this very painting.
    // Audit lenses (calm) do not react to touch at all.
    const stopTouch = calm
      ? (): void => undefined
      : subscribeTouch((point) => {
          const rect = layer.current?.getBoundingClientRect()
          if (rect === undefined || point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return
          startle()
        })
    return () => {
      stopPointer()
      stopTouch()
    }
  }, [active, calm, layer, subscribePointer, subscribeTouch, startle])

  useEffect(() => {
    if (!active) return undefined
    const onVisibility = (): void => {
      if (document.visibilityState !== 'hidden' || isHeldStill()) return
      window.clearTimeout(reemergeTimer.current)
      window.clearTimeout(awayTimer.current)
      peekElsewhere(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [active, isHeldStill, peekElsewhere])

  useEffect(() => {
    if (!active) return undefined
    let next = 0
    const [low, high] = daylight ? [DAYLIGHT_WANDER_MIN_MS, DAYLIGHT_WANDER_MAX_MS] : [WANDER_MIN_MS, WANDER_MAX_MS]
    const schedule = (): void => {
      next = window.setTimeout(wander, randomBetween(low, high))
    }
    function wander(): void {
      const idle = !isHeldStill() && document.visibilityState !== 'hidden' && !currentRef.current.out
      if (idle) {
        setCurrent((previous) => ({ ...previous, out: true, startled: false }))
        peekWhenFree(awayTimer, WANDER_AWAY_MS)
      }
      schedule()
    }
    schedule()
    return () => {
      window.clearTimeout(next)
      window.clearTimeout(awayTimer.current)
    }
  }, [active, daylight, isHeldStill, peekWhenFree])

  useEffect(
    () => () => {
      window.clearTimeout(reemergeTimer.current)
      window.clearTimeout(awayTimer.current)
    },
    [],
  )

  let mood: GhostMood = daylight ? 'sleepy' : 'looking'
  if (current.out && current.startled) mood = 'startled'
  return { current, mood }
}

type FigureProps = {
  spot: PaintingSpot
  size: number
  box: PaintingBox
  mood: GhostMood
  out: boolean
  /** Starts in its peeking spot; otherwise it starts hidden and slides in once painted. */
  instant: boolean
  bob: boolean
  slides: boolean
  daylight: boolean
}

/** Where a ducked ghost goes: back behind the frame, along the axis it peeks in on, in px. */
function duckShift(spot: PaintingSpot, size: number): Point {
  const distance = depthOf(size) + HIDE_EXTRA
  if (spot.edge === 'left') return { x: -distance, y: 0 }
  if (spot.edge === 'right') return { x: distance, y: 0 }
  return { x: 0, y: distance }
}

/**
 * The ghost: an `svg` sized to the part that shows (the viewBox is the visible part of the 120 x 120
 * art box), so its bounding box, and its eyes', stay inside the picture. It slides along the peeking axis
 * to duck and to peek back in, inside that svg: the svg itself never moves out of the picture.
 *
 * Contract: the outer `svg` box and both eye ellipses lie inside the picture's padding box. The child
 * paths (the body) are clipped visually by the svg's viewBox, not geometrically: their own client rects
 * can still cross the frame, and the art is deliberately not polygon-clipped.
 */
function PaintingGhostFigure({ spot, size, box, mood, out, instant, bob, slides, daylight }: FigureProps): ReactElement {
  const [entered, setEntered] = useState(instant || !slides)
  useEffect(() => {
    if (entered) return undefined
    let second = 0
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      window.cancelAnimationFrame(first)
      window.cancelAnimationFrame(second)
    }
  }, [entered])

  const hidden = out || !entered
  // Hidden for good only once the duck has finished: until then it is still sliding out.
  const [settled, setSettled] = useState(hidden)
  useEffect(() => {
    if (!hidden) return undefined
    const timer = window.setTimeout(() => setSettled(true), DUCK_MS + 50)
    return () => window.clearTimeout(timer)
  }, [hidden])
  useEffect(() => {
    if (!hidden) setSettled(false)
  }, [hidden])
  const visible = visibleBox(spot, size, box)
  const shown = shownFractions(spot, size)
  const scale = ART_BOX / size
  const shift = hidden ? duckShift(spot, size) : { x: 0, y: 0 }
  const along = spot.edge === 'bottom' ? 'x' : 'y'
  const viewBox = [shown.left * ART_BOX, shown.top * ART_BOX, (shown.right - shown.left) * ART_BOX, (shown.bottom - shown.top) * ART_BOX]
  return (
    <svg
      className="ghost painting-ghost"
      data-edge={spot.edge}
      data-mood={mood}
      data-out={hidden}
      data-gone={hidden && settled}
      data-daylight={daylight}
      width={visible.right - visible.left}
      height={visible.bottom - visible.top}
      viewBox={viewBox.join(' ')}
      aria-hidden="true"
      focusable="false"
      style={{ left: visible.left, top: visible.top }}
    >
      <g className="painting-ghost-slide" style={{ transform: `translate(${shift.x * scale}px, ${shift.y * scale}px)` }}>
        <g className="painting-ghost-bob" data-bob={bob} data-along={along}>
          <g transform={`rotate(${artTurn(spot.edge, paintingUpright(spot.edge))} ${ART_BOX / 2} ${ART_BOX / 2})`}>
            <GhostArt mood={mood} />
          </g>
        </g>
      </g>
    </svg>
  )
}

/** The painting's outer border box (the gilt frame included): the layer's parent, or the layer itself. */
function frameOf(layer: HTMLElement, inner: DOMRect): Box {
  const outer = layer.parentElement?.getBoundingClientRect() ?? inner
  return { left: outer.left, top: outer.top, right: outer.right, bottom: outer.bottom }
}

/** Publishes a measurer of where the ghost stands (viewport px), for the intro's ghost to land on. Kept in a ref. */
function usePublishLayout(layer: RefObject<HTMLDivElement | null>, box: PaintingBox | null, plan: PaintingPlan | null, current: Current, mood: GhostMood): void {
  const { publishPaintingLayout } = useGhosts()
  useLayoutEffect(() => {
    const element = layer.current
    if (element === null || box === null || plan === null || current.spot === null) {
      publishPaintingLayout(null)
      return undefined
    }
    const { spot } = current
    // Measured when the intro asks, so a painting that moved since (a growing text column) is read where it is now.
    publishPaintingLayout((): PaintingLayout | null => {
      if (!element.isConnected) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      const origin = ghostOrigin(spot, plan.size, box)
      const visible = visibleBox(spot, plan.size, box)
      const at = (x: number, y: number): Point => ({ x: rect.left + x, y: rect.top + y })
      return {
        origin: at(origin.x, origin.y),
        visible: { left: rect.left + visible.left, top: rect.top + visible.top, right: rect.left + visible.right, bottom: rect.top + visible.bottom },
        clip: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        frame: frameOf(element, rect),
        edge: spot.edge,
        upright: paintingUpright(spot.edge),
        size: plan.size,
        mood,
      }
    })
    return () => publishPaintingLayout(null)
  }, [layer, box, plan, current, mood, publishPaintingLayout])
}

function PaintingGhostLayer({ calm, daylight, avoid }: Required<PaintingGhostProps>): ReactElement {
  const { introActive } = useGhosts()
  const reducedMotion = useReducedMotion()
  const layer = useRef<HTMLDivElement>(null)
  const box = usePaintingBox(layer, avoid)
  const plan = useMemo(() => (box === null ? null : planPaintingGhost(box, daylight)), [box, daylight])
  const { current, mood } = usePaintingBehaviour({ layer, box, plan, dynamic: !reducedMotion, daylight, calm })
  usePublishLayout(layer, box, plan, current, mood)
  return (
    <div className="painting-ghost-layer" ref={layer} aria-hidden="true" data-intro={introActive}>
      {current.spot !== null && plan !== null && box !== null ? (
        <PaintingGhostFigure
          key={current.n}
          spot={current.spot}
          size={plan.size}
          box={box}
          mood={mood}
          out={current.out}
          instant={current.instant}
          bob={!reducedMotion && !calm && !daylight}
          slides={!reducedMotion}
          daylight={daylight}
        />
      ) : null}
    </div>
  )
}

/**
 * One ghost peeking in from behind the inner edge of the gilt frame of the painting that contains it.
 * Mount it as the last child of a `.painting`: it fills the picture's inner box. Pure decoration:
 * `aria-hidden`, never focusable, `pointer-events: none`; "Hide ghosts" removes it, and under reduced
 * motion it stands still in one spot.
 */
export function PaintingGhost({ calm = false, daylight = false, avoid = [] }: PaintingGhostProps): ReactElement | null {
  const { ghostsHidden } = useGhosts()
  if (ghostsHidden) return null
  return <PaintingGhostLayer calm={calm} daylight={daylight} avoid={avoid} />
}
