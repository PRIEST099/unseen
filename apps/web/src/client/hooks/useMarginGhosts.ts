import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  NEAR_PX,
  REEMERGE_MS,
  distanceToBox,
  distanceToPoint,
  fitSize,
  ghostCountForPlacement,
  ghostSizeFor,
  isValidSpot,
  pickSpot,
  plannedSpots,
  readPlacement,
  samePlacement,
  spotCenter,
} from '../utils/ghost-spots'
import type { Box, Placement, Point, Spot } from '../utils/ghost-spots'

export type GhostState = {
  id: number
  spot: Spot
  hidden: boolean
  /** Starts in its peeking spot (the first planning). Later spots slide in from hiding. */
  instant: boolean
}

type Options = {
  /** Ghosts are allowed on this route and not switched off. */
  enabled: boolean
  /** Motion is allowed: the lantern, the hiding and the creeping. Off under reduced motion. */
  dynamic: boolean
  /** Changes when the page behind the ghosts changes, so the margins are measured again. */
  routeKey: string
  /**
   * The intro is on screen: its own ghosts stand in for these, so these must stay where the intro's
   * ghosts will land. While paused nothing startles them, and a refit moves a ghost only to a spot at a
   * window edge (never a panel-anchored one); the intro measures after the fonts' refit.
   */
  paused: boolean
}

type Result = { ghosts: GhostState[]; placement: Placement }

/** A placement from the window size alone: used for the one render before the page can be measured. */
function unmeasuredPlacement(): Placement {
  const width = window.innerWidth
  return fitSize({
    innerWidth: width,
    viewWidth: width,
    height: window.innerHeight,
    size: ghostSizeFor(width),
    minY: 24,
    panelLeft: 0,
    panelRight: width,
    panelMinY: Number.POSITIVE_INFINITY,
    panelMaxY: Number.NEGATIVE_INFINITY,
    footerTop: Number.POSITIVE_INFINITY,
  })
}

function nextId(list: readonly GhostState[]): number {
  return list.reduce((highest, ghost) => Math.max(highest, ghost.id + 1), 0)
}

/**
 * Brings the list in line with the window: the right count, and every visible ghost on a spot that is
 * still allowed. A hidden ghost is left alone (nobody sees it; it picks a fresh spot when it returns).
 * A ghost for which no spot shows its face is dropped. Returns `previous` itself when nothing changed.
 */
export function fitGhosts(
  previous: GhostState[],
  count: number,
  placement: Placement,
  windowOnly = false,
): GhostState[] {
  if (count === 0) return previous.length === 0 ? previous : []
  if (previous.length === 0) {
    const planned = plannedSpots(count, placement)
    return planned.length === 0 ? previous : planned.map((spot, id) => ({ id, spot, hidden: false, instant: true }))
  }
  const kept = previous.slice(0, count)
  let changed = previous.length !== count
  const next: GhostState[] = []
  kept.forEach((ghost, index) => {
    if (ghost.hidden || isValidSpot(ghost.spot, placement, windowOnly)) {
      next.push(ghost)
      return
    }
    const taken = [...next, ...kept.slice(index + 1)].map((other) => other.spot)
    const spot = pickSpot(placement, { taken, previous: ghost.spot, windowOnly, random: Math.random })
    if (spot !== null) next.push({ ...ghost, spot, instant: false })
    changed = true
  })
  while (next.length < count) {
    const spot = pickSpot(placement, { taken: next.map((ghost) => ghost.spot), windowOnly, random: Math.random })
    if (spot === null) break
    next.push({ id: nextId(next), spot, hidden: false, instant: false })
    changed = true
  }
  return changed ? next : previous
}

/** Marks the ghosts with these ids hidden. Returns `previous` itself when none of them needed it. */
export function markHidden(previous: GhostState[], ids: ReadonlySet<number>): GhostState[] {
  if (!previous.some((ghost) => ids.has(ghost.id) && !ghost.hidden)) return previous
  return previous.map((ghost) => (ids.has(ghost.id) && !ghost.hidden ? { ...ghost, hidden: true } : ghost))
}

/** Only a control the keyboard reached counts: not `#main`, not a dialog, not any `tabindex="-1"` container. */
export function isLanternFocus(element: Element): boolean {
  if (element.matches('[tabindex="-1"]')) return false
  try {
    return element.matches(':focus-visible')
  } catch {
    return true
  }
}

export function useMarginGhosts({ enabled, dynamic, routeKey, paused }: Options): Result {
  const [placement, setPlacement] = useState<Placement>(unmeasuredPlacement)
  const [ghosts, setGhosts] = useState<GhostState[]>([])
  const ghostsRef = useRef(ghosts)
  const placementRef = useRef(placement)
  const enabledRef = useRef(enabled)
  const pausedRef = useRef(paused)
  const lantern = useRef<Point | null>(null)
  const timers = useRef(new Map<number, number>())
  ghostsRef.current = ghosts
  enabledRef.current = enabled
  pausedRef.current = paused

  /** Measures the page (header, panel, footer, window) and fits the ghosts to it. */
  const refresh = useCallback((): void => {
    const next = readPlacement()
    placementRef.current = next
    setPlacement((previous) => (samePlacement(previous, next) ? previous : next))
    const count = enabledRef.current ? ghostCountForPlacement(next) : 0
    const paused = pausedRef.current
    setGhosts((previous) => fitGhosts(previous, count, next, paused))
  }, [])

  // After the first commit the header and the panel exist: plan and measure then, never before.
  useLayoutEffect(refresh, [refresh, routeKey, enabled])

  useEffect(() => {
    let frame = 0
    let disposed = false
    const schedule = (): void => {
      if (disposed) return
      if (frame === 0) {
        frame = window.requestAnimationFrame(() => {
          frame = 0
          refresh()
        })
      }
    }
    window.addEventListener('resize', schedule)
    // The fonts may finish after this page has gone: the disposed flag drops that late follow-up.
    void document.fonts?.ready.then(schedule)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    for (const target of [document.body, ...document.querySelectorAll('header.app-header, #main, footer.app-footer')]) {
      observer?.observe(target)
    }
    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [refresh, routeKey])

  const arm = useCallback((id: number, reemerge: (id: number) => void): void => {
    window.clearTimeout(timers.current.get(id))
    timers.current.set(id, window.setTimeout(() => reemerge(id), REEMERGE_MS))
  }, [])

  const reemerge = useCallback((id: number): void => {
    timers.current.delete(id)
    const list = ghostsRef.current
    const current = list.find((ghost) => ghost.id === id)
    if (current === undefined || !current.hidden) return
    const spot = pickSpot(placementRef.current, {
      taken: list.filter((ghost) => ghost.id !== id).map((ghost) => ghost.spot),
      previous: current.spot,
      lantern: lantern.current,
      random: Math.random,
    })
    // No spot is free (or shows a face) now: try again later rather than stay hidden for good.
    if (spot === null) {
      arm(id, reemerge)
      return
    }
    setGhosts((previous) => previous.map((ghost) => (ghost.id === id ? { ...ghost, spot, hidden: false, instant: false } : ghost)))
  }, [arm])

  /** Hides every ghost for which `distance` is within range, and restarts its return timer. Not during the intro. */
  const startle = useCallback(
    (distance: (centre: Point) => number): void => {
      if (pausedRef.current) return
      const near = ghostsRef.current.filter((ghost) => distance(spotCenter(ghost.spot, placementRef.current)) <= NEAR_PX)
      if (near.length === 0) return
      for (const ghost of near) arm(ghost.id, reemerge)
      const ids = new Set(near.map((ghost) => ghost.id))
      setGhosts((previous) => markHidden(previous, ids))
    },
    [arm, reemerge],
  )

  // A hidden ghost always has a timer to come back: this re-arms one that lost it (e.g. across a breakpoint change).
  useEffect(() => {
    if (!dynamic) return
    for (const ghost of ghosts) {
      if (ghost.hidden && !timers.current.has(ghost.id)) arm(ghost.id, reemerge)
    }
  }, [ghosts, dynamic, arm, reemerge])

  // Under reduced motion (also when it turns on mid-session) the ghosts stand still in a spot.
  useEffect(() => {
    if (dynamic) return
    for (const timer of timers.current.values()) window.clearTimeout(timer)
    timers.current.clear()
    setGhosts((previous) => (previous.some((ghost) => ghost.hidden) ? previous.map((ghost) => ({ ...ghost, hidden: false })) : previous))
  }, [dynamic])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  useEffect(() => {
    if (!dynamic || !enabled) return undefined
    let frame = 0
    let latest: Point | null = null
    const onPointer = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return
      latest = { x: event.clientX, y: event.clientY }
      lantern.current = latest
      if (frame !== 0) return
      // Many pointer moves arrive per frame: look at the newest one, once.
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const point = latest
        if (point !== null) startle((centre) => distanceToPoint(centre, point))
      })
    }
    const onFocus = (event: FocusEvent): void => {
      if (!(event.target instanceof Element) || !isLanternFocus(event.target)) return
      const rect = event.target.getBoundingClientRect()
      const box: Box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      startle((centre) => distanceToBox(centre, box))
    }
    // They move while nobody is looking: the moment the tab is hidden, so no one sees it happen. Not
    // during the intro, whose ghosts are about to land on these spots.
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden' && !pausedRef.current) {
        relocateAll(ghostsRef.current, placementRef.current, timers.current, setGhosts)
      }
    }
    window.addEventListener('pointermove', onPointer)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [dynamic, enabled, startle])

  return { ghosts, placement }
}

/** Every ghost moves to a new spot, and none is hidden any more. */
function relocateAll(
  list: readonly GhostState[],
  placement: Placement,
  timers: Map<number, number>,
  setGhosts: (next: GhostState[]) => void,
): void {
  for (const timer of timers.values()) window.clearTimeout(timer)
  timers.clear()
  const moved: GhostState[] = []
  for (const ghost of list) {
    const spot = pickSpot(placement, {
      taken: moved.map((other) => other.spot),
      previous: ghost.spot,
      random: Math.random,
    })
    if (spot === null) break
    moved.push({ ...ghost, spot, hidden: false, instant: false })
  }
  setGhosts(moved)
}
