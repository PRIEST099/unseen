import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useGhosts } from '../contexts/GhostsContext'
import type { MarginLayout } from '../contexts/GhostsContext'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import {
  HIDE_EXTRA,
  artEdge,
  artUpright,
  distanceToPoint,
  ghostSizeFor,
  peekPosition,
  readPlacement,
  spotCenter,
} from '../utils/ghost-spots'
import type { Placement, Point, Spot } from '../utils/ghost-spots'
import { Ghost } from './Ghost'
import type { GhostEdge } from '../utils/ghost-art'

export const INTRO_SESSION_KEY = 'unseen.intro-seen'
export const INTRO_MIN_MS = 900
/** The overlay is gone this long after it mounted at the latest, whatever the fonts do. */
export const INTRO_MAX_MS = 2500
export const INTRO_FADE_MS = 600
/** The lights come on by this time after mount at the latest (so the fade ends well before the maximum). */
export const INTRO_LIGHTS_LATEST_MS = 1800
/** Time the page itself may have spent loading before the intro mounted; it is taken off the budget. */
export const INTRO_NAV_ALLOWANCE_MS = 700
/** After the end of a skipping gesture, how long the dark layer waits for the click that follows it. */
export const SKIP_CLICK_GRACE_MS = 350
/** A skipping gesture that never ends (a held press) lets go after this long. */
const SKIP_HOLD_MAX_MS = 5000

type Phase = 'dark' | 'lights' | 'skipped' | 'done'

/** Used only when sessionStorage is blocked: the intro then plays once per page load. */
let playedWithoutStorage = false

function introSeen(): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) !== null
  } catch {
    return playedWithoutStorage
  }
}

function markIntroSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_SESSION_KEY, '1')
  } catch {
    playedWithoutStorage = true
  }
}

/** Resolves when the fonts have loaded (at once where the Font Loading API is missing). */
function fontsReady(): Promise<unknown> {
  return typeof document.fonts === 'undefined' ? Promise.resolve() : document.fonts.ready
}

/** Milliseconds since the page started loading. */
function sinceNavigation(): number {
  return typeof performance === 'undefined' ? 0 : performance.now()
}

/**
 * When the lights must come on at the latest, in ms after mount. The time the page had already spent
 * loading (up to a short allowance) is taken off, so the overlay is gone about 2.4 s after the
 * navigation began, and never later than `INTRO_MAX_MS` after it mounted.
 */
export function introSchedule(sinceNavigationMs: number): { lightsLatestMs: number; endLatestMs: number } {
  const spent = Math.min(Math.max(sinceNavigationMs, 0), INTRO_NAV_ALLOWANCE_MS)
  const lightsLatestMs = Math.max(INTRO_MIN_MS, INTRO_LIGHTS_LATEST_MS - spent)
  return { lightsLatestMs, endLatestMs: lightsLatestMs + INTRO_FADE_MS }
}

type IntroStart = { x: number; y: number }

/** Where the intro's ghosts drift: across the middle of the dark screen, one more at the wide size. */
function introStarts(): IntroStart[] {
  const width = window.innerWidth
  const height = window.innerHeight
  const size = ghostSizeFor(width)
  const total = width >= 1100 ? 4 : 3
  return Array.from({ length: total }, (_, index) => ({
    x: width * (index % 2 === 0 ? 0.28 : 0.72) - size / 2,
    y: height * (0.3 + 0.13 * index) - size / 2,
  }))
}

/** Where the lights found the page: the margin ghosts' own spots at that moment, not a plan of its own. */
type Landing = { placement: Placement; targets: (Spot | null)[] }

/** Each ghost takes the nearest free spot; ghosts left over dart out of sight. */
function assignSpots(starts: readonly IntroStart[], placement: Placement, spots: readonly Spot[]): (Spot | null)[] {
  const free = [...spots]
  const half = placement.size / 2
  return starts.map((start) => {
    const from: Point = { x: start.x + half, y: start.y + half }
    let best = -1
    let bestDistance = Number.POSITIVE_INFINITY
    free.forEach((spot, index) => {
      const distance = distanceToPoint(from, spotCenter(spot, placement))
      if (distance < bestDistance) {
        best = index
        bestDistance = distance
      }
    })
    return best < 0 ? null : (free.splice(best, 1)[0] ?? null)
  })
}

/**
 * Each intro ghost darts to the nearest margin ghost that is waiting (invisible) for the hand-off; the
 * ones left over dart out of sight. With no margin ghosts (no room for a face), they all dart away.
 */
function measureLanding(starts: readonly IntroStart[], layout: MarginLayout | null): Landing {
  const placement = layout?.placement ?? readPlacement()
  return { placement, targets: assignSpots(starts, placement, layout?.spots ?? []) }
}

function landingOf(
  start: IntroStart,
  target: Spot | null,
  placement: Placement,
): { x: number; y: number; edge: GhostEdge; upright: boolean } {
  if (target !== null) {
    const at = peekPosition(target, placement)
    return { ...at, edge: artEdge(target), upright: artUpright(target, placement) }
  }
  const onLeft = start.x + placement.size / 2 < placement.viewWidth / 2
  return {
    x: onLeft ? -(placement.size + HIDE_EXTRA) : placement.viewWidth + HIDE_EXTRA,
    y: start.y,
    edge: onLeft ? 'left' : 'right',
    upright: false,
  }
}

function Flame(): ReactElement {
  return (
    <svg className="lights-on-flame" viewBox="0 0 24 32" width="24" height="32" aria-hidden="true" focusable="false">
      <path d="M12 1C14 8 21 12 21 21a9 9 0 0 1-18 0c0-5 3-7 4-11 2 2 3 3 3 5 2-3 2-8 2-14z" fill="var(--color-candle)" />
      <ellipse cx="12" cy="23" rx="3.5" ry="5" fill="var(--color-bone)" />
    </svg>
  )
}

/**
 * The lights-on intro, once per browser session: a dark screen, a candle-flame spinner and a few
 * drifting ghosts. When the page is ready the dark fades and the ghosts dart to the edges, where the
 * margin ghosts wait. The real page renders underneath the whole time.
 *
 * Any key, click or touch skips. A key press is never prevented, so Tab still moves focus. A pointer
 * gesture ends the dark at once but keeps the (clear) layer mounted until the click that follows has
 * landed on it, so a skipping tap never activates the control underneath.
 */
export function LightsOn(): ReactElement | null {
  const { ghostsHidden, setIntroActive, readMarginLayout } = useGhosts()
  const reducedMotion = useReducedMotion()
  const enabled = !ghostsHidden && !reducedMotion
  const [phase, setPhase] = useState<Phase>(() => (enabled && !introSeen() ? 'dark' : 'done'))
  const [starts] = useState<IntroStart[]>(introStarts)
  const [landing, setLanding] = useState<Landing | null>(null)
  const [status, setStatus] = useState('')
  // One size from the first dark frame to the hand-off: the fitted one, measured when the intro mounts.
  const [size, setSize] = useState(() => ghostSizeFor(window.innerWidth))
  const phaseRef = useRef<Phase>(phase)
  const layer = useRef<HTMLDivElement>(null)

  const finish = useCallback((): void => {
    phaseRef.current = 'done'
    setPhase('done')
  }, [])

  /** Ends the dark: `lights` fades it, `skipped` clears it at once. Measures the page only now. */
  const lightsOn = useCallback(
    (next: 'lights' | 'skipped'): void => {
      if (phaseRef.current !== 'dark') return
      setLanding(measureLanding(starts, readMarginLayout()))
      phaseRef.current = next
      setPhase(next)
    },
    [starts, readMarginLayout],
  )

  useEffect(() => {
    if (!enabled) finish()
  }, [enabled, finish])

  // The margin ghosts wait invisible while this is on screen; the hand-off happens in the same commit.
  useLayoutEffect(() => {
    setIntroActive(phase !== 'done')
  }, [phase, setIntroActive])
  useLayoutEffect(() => () => setIntroActive(false), [setIntroActive])
  useLayoutEffect(() => {
    setSize(readMarginLayout()?.placement.size ?? readPlacement().size)
  }, [readMarginLayout])

  // The status line starts empty and is filled after the first paint, so a screen reader announces the change.
  useEffect(() => {
    setStatus(phase === 'dark' ? 'Lighting the candles…' : '')
  }, [phase])

  useEffect(() => {
    if (phase !== 'dark') return undefined
    markIntroSeen()
    let minElapsed = false
    let ready = false
    const minTimer = window.setTimeout(() => {
      minElapsed = true
      if (ready) lightsOn('lights')
    }, INTRO_MIN_MS)
    const latestTimer = window.setTimeout(() => lightsOn('lights'), introSchedule(sinceNavigation()).lightsLatestMs)
    void fontsReady().then(() => {
      // One frame later, after the margin ghosts have been fitted again to the new font metrics, so the
      // landing spots are read from the final layout.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          ready = true
          if (minElapsed) lightsOn('lights')
        })
      })
    })
    return () => {
      window.clearTimeout(minTimer)
      window.clearTimeout(latestTimer)
    }
  }, [phase, lightsOn])

  useEffect(() => {
    if (phase !== 'lights') return undefined
    const timer = window.setTimeout(finish, INTRO_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase, finish])

  useEffect(() => {
    if (phase === 'done') return undefined
    // Listeners only observe: nothing is prevented, so a key press (Tab included) still does its work.
    const onKey = (): void => finish()
    const onGesture = (): void => {
      // In the dark the layer caught the press, so it must also catch the click that follows. While it
      // fades it lets the pointer through: the press went to the page underneath, which gets its click too.
      if (phaseRef.current === 'dark') lightsOn('skipped')
      else if (phaseRef.current === 'lights') finish()
    }
    window.addEventListener('keydown', onKey, { capture: true, passive: true })
    window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
    window.addEventListener('touchstart', onGesture, { capture: true, passive: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('pointerdown', onGesture, { capture: true })
      window.removeEventListener('touchstart', onGesture, { capture: true })
    }
  }, [phase, finish, lightsOn])

  // A click on the dark layer (the end of a skipping tap, or a click on its own) is consumed here and ends the intro.
  useEffect(() => {
    const element = layer.current
    if (element === null) return undefined
    const onClick = (event: Event): void => {
      event.stopPropagation()
      finish()
    }
    element.addEventListener('click', onClick)
    return () => element.removeEventListener('click', onClick)
  }, [phase, finish])

  // After a skipping gesture the layer waits for its click, then lets go.
  useEffect(() => {
    if (phase !== 'skipped') return undefined
    let grace = 0
    const ended = (): void => {
      window.clearTimeout(grace)
      grace = window.setTimeout(finish, SKIP_CLICK_GRACE_MS)
    }
    const types = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'] as const
    for (const type of types) window.addEventListener(type, ended, { capture: true, passive: true })
    const hold = window.setTimeout(finish, SKIP_HOLD_MAX_MS)
    return () => {
      window.clearTimeout(grace)
      window.clearTimeout(hold)
      for (const type of types) window.removeEventListener(type, ended, { capture: true })
    }
  }, [phase, finish])

  if (phase === 'done') return null
  const dark = phase === 'dark'
  return (
    <div className="lights-on" data-phase={phase} ref={layer}>
      <div className="lights-on-dark" aria-hidden="true" />
      <div className="lights-on-ghosts" aria-hidden="true">
        {starts.map((start, index) => {
          const end = landing === null ? null : landingOf(start, landing.targets[index] ?? null, landing.placement)
          const at = dark || end === null ? start : end
          return (
            <div key={index} className="lights-on-ghost" style={{ transform: `translate3d(${at.x}px, ${at.y}px, 0)` }}>
              <div className="lights-on-drift" style={{ animationDelay: `${-index * 1.7}s` }}>
                <Ghost
                  size={size}
                  edge={dark || end === null ? 'bottom' : end.edge}
                  upright={!dark && end !== null && end.upright}
                  mood={dark ? 'looking' : 'startled'}
                />
              </div>
            </div>
          )
        })}
      </div>
      {/* After the ghosts in the stacking order: a drifting ghost passes behind the words, never over them. */}
      {dark ? (
        <p className="lights-on-status" role="status">
          <Flame />
          <span>{status}</span>
        </p>
      ) : null}
    </div>
  )
}
