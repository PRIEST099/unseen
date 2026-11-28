import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { GhostMood } from '../utils/ghost-art'
import type { PaintingEdge } from '../utils/painting-spots'
import type { Box, Placement, Point, Spot } from '../utils/ghost-spots'
import { useReducedMotion } from './ReducedMotionContext'

export const HIDE_GHOSTS_KEY = 'unseen.hide-ghosts'

/** Where the margin ghosts stand right now: the intro's ghosts land exactly there. */
export type MarginLayout = { placement: Placement; spots: readonly Spot[] }

/**
 * Where the ghost in a painting stands right now, in viewport px: the intro's ghost lands there.
 * `origin` is the top-left of the ghost's full box (the drawing is turned about its centre), `visible`
 * the part that shows, `clip` the picture's inner box (nothing of the ghost shows outside it) and `frame`
 * the painting's outer border box (the gilt frame included).
 */
export type PaintingLayout = {
  origin: Point
  visible: Box
  clip: Box
  frame: Box
  edge: PaintingEdge
  /** On a left or right edge the ghost stands nearly upright (as the margin ghosts do). */
  upright: boolean
  size: number
  mood: GhostMood
}

/** Measures the painting ghost's layout now; null when its element is gone or has no size. */
export type PaintingMeasurer = () => PaintingLayout | null

type PointCallback = (point: Point) => void

type GhostsContextValue = {
  /** The "Hide ghosts" switch (WCAG 2.2.2): no intro, no ghosts, no lantern. */
  ghostsHidden: boolean
  toggleGhostsHidden: () => void
  /** True while the loaded Daylight lens is on screen: no margin ghosts, and one sleepy ghost in the painting. */
  daylight: boolean
  setDaylight: (daylight: boolean) => void
  /** True while the lights-on intro is on screen: the margin and painting ghosts wait invisible until it is done. */
  introActive: boolean
  setIntroActive: (active: boolean) => void
  /** The margin ghosts report their spots here (null: there are none). Kept in a ref: nothing re-renders. */
  publishMarginLayout: (layout: MarginLayout | null) => void
  readMarginLayout: () => MarginLayout | null
  /**
   * The painting ghost publishes a measurer here (null: there is none), not a snapshot: the painting can move
   * (the séance text column grows), so `readPaintingLayout` measures when the intro asks. Kept in a ref.
   */
  publishPaintingLayout: (measurer: PaintingMeasurer | null) => void
  readPaintingLayout: () => PaintingLayout | null
  /** The lantern: the last mouse or pen position (null: none yet). Touch never sets it. Kept in a ref. */
  readLantern: () => Point | null
  /** Called (at most once per frame) with the newest mouse or pen position. Returns the way to stop. */
  subscribePointer: (callback: PointCallback) => () => void
  /** Called with the point of every touch `pointerdown`. Returns the way to stop. */
  subscribeTouch: (callback: PointCallback) => () => void
  /** A walk is playing or the Spirit Sight overlay is open: the painting ghost holds completely still. */
  holdStill: () => () => void
  isHeldStill: () => boolean
}

const GhostsContext = createContext<GhostsContextValue>({
  ghostsHidden: false,
  toggleGhostsHidden: () => undefined,
  daylight: false,
  setDaylight: () => undefined,
  introActive: false,
  setIntroActive: () => undefined,
  publishMarginLayout: () => undefined,
  readMarginLayout: () => null,
  publishPaintingLayout: () => undefined,
  readPaintingLayout: () => null,
  readLantern: () => null,
  subscribePointer: () => () => undefined,
  subscribeTouch: () => () => undefined,
  holdStill: () => () => undefined,
  isHeldStill: () => false,
})

export function readGhostsHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDE_GHOSTS_KEY) === '1'
  } catch {
    return false
  }
}

function writeGhostsHidden(hidden: boolean): void {
  try {
    window.localStorage.setItem(HIDE_GHOSTS_KEY, hidden ? '1' : '0')
  } catch {
    // Storage can be blocked: the choice then lasts for this page only.
  }
}

type PointerTracking = {
  readLantern: () => Point | null
  subscribePointer: (callback: PointCallback) => () => void
  subscribeTouch: (callback: PointCallback) => () => void
}

/**
 * The one pointer tracker the ghosts share. It runs whenever ghosts are on and motion is allowed, whether
 * or not any margin ghost exists. Positions live in refs: a `pointermove` never re-renders anything.
 * Mouse and pen moves become the lantern, coalesced to one call per frame. A touch never becomes the
 * lantern: only its `pointerdown` is reported (passively; nothing is ever prevented).
 */
function usePointerTracking(enabled: boolean): PointerTracking {
  const lantern = useRef<Point | null>(null)
  const pointerSubscribers = useRef(new Set<PointCallback>())
  const touchSubscribers = useRef(new Set<PointCallback>())

  useEffect(() => {
    if (!enabled) {
      lantern.current = null
      return undefined
    }
    let frame = 0
    const onMove = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return
      lantern.current = { x: event.clientX, y: event.clientY }
      if (frame !== 0) return
      // Many moves arrive per frame: look at the newest one, once.
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const point = lantern.current
        if (point !== null) for (const callback of [...pointerSubscribers.current]) callback(point)
      })
    }
    const onDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') return
      const point: Point = { x: event.clientX, y: event.clientY }
      for (const callback of [...touchSubscribers.current]) callback(point)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown, { capture: true })
    }
  }, [enabled])

  const readLantern = useCallback((): Point | null => lantern.current, [])
  const subscribePointer = useCallback((callback: PointCallback): (() => void) => {
    pointerSubscribers.current.add(callback)
    return () => pointerSubscribers.current.delete(callback)
  }, [])
  const subscribeTouch = useCallback((callback: PointCallback): (() => void) => {
    touchSubscribers.current.add(callback)
    return () => touchSubscribers.current.delete(callback)
  }, [])
  return { readLantern, subscribePointer, subscribeTouch }
}

export function GhostsProvider({ children }: { children: ReactNode }): ReactElement {
  const [ghostsHidden, setGhostsHidden] = useState<boolean>(readGhostsHidden)
  const [daylight, setDaylight] = useState(false)
  const [introActive, setIntroActive] = useState(false)
  const reducedMotion = useReducedMotion()
  const hiddenRef = useRef(ghostsHidden)
  const marginLayout = useRef<MarginLayout | null>(null)
  const paintingMeasurer = useRef<PaintingMeasurer | null>(null)
  const tracking = usePointerTracking(!ghostsHidden && !reducedMotion)

  const publishMarginLayout = useCallback((layout: MarginLayout | null): void => {
    marginLayout.current = layout
  }, [])
  const readMarginLayout = useCallback((): MarginLayout | null => marginLayout.current, [])
  const publishPaintingLayout = useCallback((measurer: PaintingMeasurer | null): void => {
    paintingMeasurer.current = measurer
  }, [])
  const readPaintingLayout = useCallback((): PaintingLayout | null => paintingMeasurer.current?.() ?? null, [])
  const stillRequests = useRef(0)
  const holdStill = useCallback((): (() => void) => {
    stillRequests.current += 1
    let released = false
    return () => {
      if (released) return
      released = true
      stillRequests.current -= 1
    }
  }, [])
  const isHeldStill = useCallback((): boolean => stillRequests.current > 0, [])

  const toggleGhostsHidden = useCallback((): void => {
    const next = !hiddenRef.current
    hiddenRef.current = next
    setGhostsHidden(next)
    writeGhostsHidden(next)
  }, [])

  const { readLantern, subscribePointer, subscribeTouch } = tracking
  const value = useMemo<GhostsContextValue>(
    () => ({
      ghostsHidden,
      toggleGhostsHidden,
      daylight,
      setDaylight,
      introActive,
      setIntroActive,
      publishMarginLayout,
      readMarginLayout,
      publishPaintingLayout,
      readPaintingLayout,
      readLantern,
      subscribePointer,
      subscribeTouch,
      holdStill,
      isHeldStill,
    }),
    [
      ghostsHidden,
      toggleGhostsHidden,
      daylight,
      introActive,
      publishMarginLayout,
      readMarginLayout,
      publishPaintingLayout,
      readPaintingLayout,
      readLantern,
      subscribePointer,
      subscribeTouch,
      holdStill,
      isHeldStill,
    ],
  )
  return <GhostsContext.Provider value={value}>{children}</GhostsContext.Provider>
}

export function useGhosts(): GhostsContextValue {
  return useContext(GhostsContext)
}

/** Rendered by the loaded Daylight lens: margin ghosts stay away, and the painting ghost is the sleepy one. */
export function useDaylightFlag(active: boolean): void {
  const { setDaylight } = useGhosts()
  useEffect(() => {
    if (!active) return undefined
    setDaylight(true)
    return () => setDaylight(false)
  }, [active, setDaylight])
}

/**
 * While `active` (a Keyboard walk or Whisper walk is playing, or the Spirit Sight overlay is open) the
 * painting ghost holds completely still: a moving ghost could be mistaken for the walk's Tab ghost.
 */
export function useHoldGhostsStill(active: boolean): void {
  const { holdStill } = useGhosts()
  useEffect(() => (active ? holdStill() : undefined), [active, holdStill])
}
