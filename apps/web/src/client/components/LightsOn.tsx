import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useGhosts } from '../contexts/GhostsContext'
import type { MarginLayout, PaintingLayout } from '../contexts/GhostsContext'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import type { GhostEdge, GhostMood } from '../utils/ghost-art'
import {
  HIDE_EXTRA,
  artEdge,
  artUpright,
  boxesIntersect,
  distanceToPoint,
  ghostSizeFor,
  peekPosition,
  readPlacement,
  spotCenter,
} from '../utils/ghost-spots'
import type { Placement, Point, Spot } from '../utils/ghost-spots'
import { Ghost } from './Ghost'

export const INTRO_SESSION_KEY = 'unseen.intro-seen'
/** Set to "1" in sessionStorage to play the intro in an automated browser (the intro's own tests do). */
export const INTRO_FORCE_KEY = 'unseen.intro-force'
/** The dark lasts at least this long, even when the fonts are ready sooner: time for the ghosts to roam. */
export const INTRO_MIN_MS = 3200
/** The lights come on by this time after mount at the latest (so the fade ends well before the maximum). */
export const INTRO_LIGHTS_LATEST_MS = 3900
/** The fade of the dark layer. `.lights-on[data-phase='lights'] .lights-on-dark` in ghosts.css has the same duration. */
export const INTRO_FADE_MS = 600
/**
 * A timer started at mount ends the intro at this time whatever the phase, so the overlay is gone no
 * later than about 4.8 s after mount even with effect latency. The whole intro stays under 5 s (WCAG 2.2.2).
 */
export const INTRO_MAX_MS = 4600
/** After the end of a skipping gesture, how long the dark layer waits for the click that follows it. */
export const SKIP_CLICK_GRACE_MS = 350
/** A skipping gesture that never ends (a held press) lets go after this long. */
const SKIP_HOLD_MAX_MS = 5000
/** Fallback only: a ghost that darts into a painting is clipped to the picture at the end of the dart at the latest. */
const CLIP_AFTER_MS = 350
/** Four ghosts roam from this width, three below. */
const WIDE_PX = 768

type Phase = 'dark' | 'lights' | 'skipped' | 'done'

/** The path each intro ghost follows (see the `intro-roam-*` keyframes in ghosts.css). */
type RoamPath = 'circle' | 'chase-a' | 'chase-b' | 'sneak'

const PATHS_WIDE: readonly RoamPath[] = ['circle', 'chase-a', 'chase-b', 'sneak']
const PATHS_NARROW: readonly RoamPath[] = ['chase-a', 'chase-b', 'sneak']

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

/**
 * An automated browser (`navigator.webdriver`) skips the intro unless `sessionStorage["unseen.intro-force"]`
 * is "1": the self-audit loads every route in a fresh browser and captures about 1.5 s after the network
 * goes idle, which would otherwise land in the dark phase and audit the intro instead of the page. The
 * intro's own tests set the flag in an init script, so it is still tested in full.
 */
function skippedForAutomation(): boolean {
  if (navigator.webdriver !== true) return false
  try {
    return window.sessionStorage.getItem(INTRO_FORCE_KEY) !== '1'
  } catch {
    return true
  }
}

/** Resolves when the fonts have loaded (at once where the Font Loading API is missing). */
function fontsReady(): Promise<unknown> {
  return typeof document.fonts === 'undefined' ? Promise.resolve() : document.fonts.ready
}

/**
 * When the lights must come on at the latest, in ms after mount, and when the fade is over at the
 * latest. Fixed: the dark lasts a set minimum so the ghosts have time to roam, whatever the page did
 * before it mounted.
 */
export function introSchedule(): { lightsLatestMs: number; endLatestMs: number } {
  return { lightsLatestMs: INTRO_LIGHTS_LATEST_MS, endLatestMs: INTRO_LIGHTS_LATEST_MS + INTRO_FADE_MS }
}

/** Where an intro ghost goes when the lights come on. */
type Target =
  | { kind: 'margin'; spot: Spot }
  | { kind: 'painting'; layout: PaintingLayout }
  | { kind: 'exit' }

/** Where the lights found the page, and where each ghost was at that moment (top-left of its box, viewport px). */
type Landing = { placement: Placement; froms: Point[]; targets: Target[] }

/** Each ghost takes the nearest free spot; ghosts left over get no spot. */
function assignSpots(froms: readonly Point[], placement: Placement, spots: readonly Spot[]): (Spot | null)[] {
  const free = [...spots]
  const half = placement.size / 2
  return froms.map((start) => {
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

/** The index of the ghost nearest to the painting ghost's spot (the only one that goes there). */
function nearestToPainting(froms: readonly Point[], size: number, layout: PaintingLayout): number {
  const centre: Point = { x: (layout.visible.left + layout.visible.right) / 2, y: (layout.visible.top + layout.visible.bottom) / 2 }
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  froms.forEach((from, index) => {
    const distance = distanceToPoint({ x: from.x + size / 2, y: from.y + size / 2 }, centre)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/**
 * Each intro ghost darts to the nearest margin ghost that is waiting (invisible) for the hand-off. With
 * no margin ghosts, one ghost darts to the painting ghost's spot; the rest dart off the nearest screen
 * edge. Exactly one ghost ends at each waiting spot.
 */
function measureLanding(froms: readonly Point[], margin: MarginLayout | null, painting: PaintingLayout | null): Landing {
  const placement = margin?.placement ?? readPlacement()
  const spots = assignSpots(froms, placement, margin?.spots ?? [])
  const targets: Target[] = spots.map((spot) => (spot === null ? { kind: 'exit' } : { kind: 'margin', spot }))
  if (painting !== null && (margin?.spots.length ?? 0) === 0 && froms.length > 0) {
    targets[nearestToPainting(froms, placement.size, painting)] = { kind: 'painting', layout: painting }
  }
  return { placement, froms: [...froms], targets }
}

type Landed = {
  x: number
  y: number
  edge: GhostEdge
  upright: boolean
  mood: GhostMood
  /** The drawing is scaled to this multiple of its dark size (a painting ghost has its own size). */
  scale: number
  /** Darting out of sight: it fades on the way. */
  exit: boolean
  clip: PaintingLayout['clip'] | null
  /** The painting's outer box: the ghost is clipped from the first frame it touches it. */
  frame: PaintingLayout['frame'] | null
}

function landingOf(from: Point, target: Target, placement: Placement, size: number): Landed {
  if (target.kind === 'margin') {
    const at = peekPosition(target.spot, placement)
    return { ...at, edge: artEdge(target.spot), upright: artUpright(target.spot, placement), mood: 'startled', scale: 1, exit: false, clip: null, frame: null }
  }
  if (target.kind === 'painting') {
    const { layout } = target
    return { ...layout.origin, edge: layout.edge, upright: layout.upright, mood: layout.mood, scale: layout.size / size, exit: false, clip: layout.clip, frame: layout.frame }
  }
  const onLeft = from.x + size / 2 < placement.viewWidth / 2
  return {
    x: onLeft ? -(size + HIDE_EXTRA) : placement.viewWidth + HIDE_EXTRA,
    y: from.y,
    edge: onLeft ? 'left' : 'right',
    upright: false,
    mood: 'startled',
    scale: 1,
    exit: true,
    clip: null,
    frame: null,
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

type IntroGhostProps = {
  path: RoamPath
  index: number
  size: number
  dark: boolean
  /** The dart has started: the ghost leaves where it was and moves to where it lands. */
  launched: boolean
  /** Crossed into a painting: now clipped to the picture. */
  clipped: boolean
  from: Point | null
  landed: Landed | null
  roam: (element: HTMLDivElement | null) => void
}

/**
 * One intro ghost. `.lights-on-ghost` carries the landing as its own inline `translate3d`, from the
 * moment the lights come on. `.lights-on-roam` carries the dark phase's path (a CSS animation, `transform`
 * only), and then an offset that cancels the jump from where the ghost was to where the landing is, and
 * eases to nothing: so the ghost leaves exactly where it was, and never jumps.
 */
function IntroGhost({ path, index, size, dark, launched, clipped, from, landed, roam }: IntroGhostProps): ReactElement {
  const lit = !dark && landed !== null && from !== null ? { landed, from } : null
  const at = lit === null ? { x: 0, y: 0 } : lit.landed
  const offset = lit !== null && !launched ? { x: lit.from.x - lit.landed.x, y: lit.from.y - lit.landed.y } : { x: 0, y: 0 }
  const scale = lit !== null && launched ? lit.landed.scale : 1
  return (
    <div className="lights-on-clip" style={{ clipPath: lit === null ? undefined : introClip(lit.landed, clipped) }}>
      <div className="lights-on-ghost" data-index={index} style={{ transform: `translate3d(${at.x}px, ${at.y}px, 0)` }}>
        <div
          className="lights-on-roam"
          data-path={path}
          data-launched={launched}
          ref={roam}
          style={{ fontSize: size, transform: dark ? undefined : `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
        >
          <div className="lights-on-size" data-exit={lit !== null && launched && lit.landed.exit} style={{ transform: `scale(${scale})` }}>
            <Ghost
              size={size}
              edge={lit === null ? 'bottom' : lit.landed.edge}
              upright={lit !== null && lit.landed.upright}
              mood={lit === null ? 'looking' : lit.landed.mood}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** The picture's inner box as a `clip-path` in viewport px (the clip layer fills the viewport). */
function clipInset(box: PaintingLayout['clip']): string {
  const right = Math.max(0, window.innerWidth - box.right)
  const bottom = Math.max(0, window.innerHeight - box.bottom)
  return `inset(${Math.max(0, box.top)}px ${right}px ${bottom}px ${Math.max(0, box.left)}px)`
}

function rectPath(box: PaintingLayout['clip']): string {
  return `M${box.left} ${box.top}H${box.right}V${box.bottom}H${box.left}Z`
}

/**
 * Everything but the gilt frame band, as an `evenodd` path: the viewport, minus the painting's border box,
 * plus the picture's inner box. On its way to the painting the ghost is never drawn over the frame.
 */
function clipFrameBand(frame: PaintingLayout['frame'], inner: PaintingLayout['clip']): string {
  const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  return `path(evenodd, '${rectPath(viewport)} ${rectPath(frame)} ${rectPath(inner)}')`
}

/** The clip of a ghost bound for a painting: the frame band hidden until it reaches the frame, then the picture only. */
function introClip(landed: Landed, clipped: boolean): string | undefined {
  if (landed.clip === null || landed.frame === null) return undefined
  return clipped ? clipInset(landed.clip) : clipFrameBand(landed.frame, landed.clip)
}

/**
 * The lights-on intro, once per browser session: a dark screen, a candle-flame spinner and a few ghosts
 * that roam: one circles the candle, two chase each other, one sneaks up behind the words, peeks over
 * them and shies away. When the page is ready the dark fades and the ghosts dart from where they are to
 * the waiting margin ghosts (or to the painting ghost, or off the screen). The real page renders
 * underneath the whole time. The dark lasts at least 3.2 s and the overlay is gone by 4.6 s.
 *
 * Any key, click or touch skips. A key press is never prevented, so Tab still moves focus. A pointer
 * gesture ends the dark at once but keeps the (clear) layer mounted until the click that follows has
 * landed on it, so a skipping tap never activates the control underneath.
 */
export function LightsOn(): ReactElement | null {
  const { ghostsHidden, setIntroActive, readMarginLayout, readPaintingLayout } = useGhosts()
  const reducedMotion = useReducedMotion()
  const enabled = !ghostsHidden && !reducedMotion && !skippedForAutomation()
  const [phase, setPhase] = useState<Phase>(() => (enabled && !introSeen() ? 'dark' : 'done'))
  const [paths] = useState<readonly RoamPath[]>(() => (window.innerWidth >= WIDE_PX ? PATHS_WIDE : PATHS_NARROW))
  const [landing, setLanding] = useState<Landing | null>(null)
  const [launched, setLaunched] = useState(false)
  const [clipped, setClipped] = useState(false)
  const [status, setStatus] = useState('')
  // One size from the first dark frame to the hand-off: the fitted one, measured when the intro mounts.
  const [size, setSize] = useState(() => ghostSizeFor(window.innerWidth))
  const phaseRef = useRef<Phase>(phase)
  const layer = useRef<HTMLDivElement>(null)
  const roams = useRef<(HTMLDivElement | null)[]>([])

  const finish = useCallback((): void => {
    phaseRef.current = 'done'
    setPhase('done')
  }, [])

  /** Where each ghost is on screen right now: its rendered position, read from the moving element. */
  const readFroms = useCallback((): Point[] => {
    return paths.map((_, index) => {
      const rect = roams.current[index]?.getBoundingClientRect()
      return { x: rect?.left ?? 0, y: rect?.top ?? 0 }
    })
  }, [paths])

  /** Ends the dark: `lights` fades it, `skipped` clears it at once. Measures the page only now. */
  const lightsOn = useCallback(
    (next: 'lights' | 'skipped'): void => {
      if (phaseRef.current !== 'dark') return
      setLanding(measureLanding(readFroms(), readMarginLayout(), readPaintingLayout()))
      phaseRef.current = next
      setPhase(next)
    },
    [readFroms, readMarginLayout, readPaintingLayout],
  )

  useEffect(() => {
    if (!enabled) finish()
  }, [enabled, finish])

  // The margin and painting ghosts wait invisible while this is on screen; the hand-off happens in the same commit.
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

  // The hard cap, started at mount: the overlay is gone by then whatever the phase.
  useEffect(() => {
    if (phaseRef.current === 'done') return undefined
    const cap = window.setTimeout(finish, INTRO_MAX_MS)
    return () => window.clearTimeout(cap)
  }, [finish])

  useEffect(() => {
    if (phase !== 'dark') return undefined
    markIntroSeen()
    let minElapsed = false
    let ready = false
    const minTimer = window.setTimeout(() => {
      minElapsed = true
      if (ready) lightsOn('lights')
    }, INTRO_MIN_MS)
    const latestTimer = window.setTimeout(() => lightsOn('lights'), introSchedule().lightsLatestMs)
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

  // One frame after the lights come on the ghosts leave where they were (so the first frame shows no jump).
  // A ghost bound for a painting is clipped to the picture from the first frame its box touches the
  // painting's frame (at launch already, if it overlaps then); the timer is only the fallback.
  useEffect(() => {
    if (phase !== 'lights') return undefined
    const frames = (landing?.targets ?? []).map((target) => (target.kind === 'painting' ? target.layout.frame : null))
    const touchesFrame = (): boolean =>
      frames.some((frame, index) => {
        const rect = roams.current[index]?.firstElementChild?.getBoundingClientRect()
        return frame !== null && rect !== undefined && boxesIntersect({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, frame)
      })
    let watching = 0
    const watch = (): void => {
      if (touchesFrame()) setClipped(true)
      else watching = window.requestAnimationFrame(watch)
    }
    let second = 0
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        setLaunched(true)
        if (frames.some((frame) => frame !== null)) watch()
      })
    })
    const clip = window.setTimeout(() => setClipped(true), CLIP_AFTER_MS + 2 * 16)
    return () => {
      window.cancelAnimationFrame(first)
      window.cancelAnimationFrame(second)
      window.cancelAnimationFrame(watching)
      window.clearTimeout(clip)
    }
  }, [phase, landing])

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
        {paths.map((path, index) => {
          const from = landing?.froms[index] ?? null
          const target = landing?.targets[index] ?? null
          const landed = landing === null || target === null || from === null ? null : landingOf(from, target, landing.placement, size)
          return (
            <IntroGhost
              key={path}
              path={path}
              index={index}
              size={size}
              dark={dark}
              launched={launched}
              clipped={clipped}
              from={from}
              landed={landed}
              roam={(element) => {
                roams.current[index] = element
              }}
            />
          )
        })}
      </div>
      {/* After the ghosts in the stacking order: a roaming ghost passes behind the words, never over them. */}
      {dark ? (
        <div className="lights-on-center">
          <p className="lights-on-status" role="status">
            <Flame />
            <span>{status}</span>
          </p>
          <p className="lights-on-hint" aria-hidden="true">
            Press any key or tap to skip
          </p>
        </div>
      ) : null}
    </div>
  )
}
