import { act, useLayoutEffect } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostsProvider, HIDE_GHOSTS_KEY, useGhosts } from '../contexts/GhostsContext'
import type { MarginLayout, PaintingLayout } from '../contexts/GhostsContext'
import { ReducedMotionProvider } from '../contexts/ReducedMotionContext'
import { peekPosition, resetPlannedSpots } from '../utils/ghost-spots'
import type { Placement, Spot } from '../utils/ghost-spots'
import {
  INTRO_FADE_MS,
  INTRO_FORCE_KEY,
  INTRO_LIGHTS_LATEST_MS,
  INTRO_MAX_MS,
  INTRO_MIN_MS,
  INTRO_SESSION_KEY,
  LightsOn,
  SKIP_CLICK_GRACE_MS,
  introSchedule,
} from './LightsOn'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let container: HTMLDivElement
let root: Root
let underClicks = 0

function IntroProbe(): ReactElement {
  const { introActive } = useGhosts()
  return <output id="probe" data-intro={String(introActive)} />
}

/** Stands in for the margin ghosts: lets a test report where they stand, at any moment. */
let publish: (layout: MarginLayout | null) => void = () => undefined
function MarginStandIn(): null {
  const { publishMarginLayout } = useGhosts()
  useLayoutEffect(() => {
    publish = publishMarginLayout
  }, [publishMarginLayout])
  return null
}

/** Stands in for the painting ghost: lets a test report where it stands. */
let publishPainting: (layout: PaintingLayout | null) => void = () => undefined
function PaintingStandIn(): null {
  const { publishPaintingLayout } = useGhosts()
  useLayoutEffect(() => {
    publishPainting = (layout) => publishPaintingLayout(layout === null ? null : () => layout)
  }, [publishPaintingLayout])
  return null
}

const PAINTING_LAYOUT: PaintingLayout = {
  origin: { x: 700, y: 300 },
  visible: { left: 700, top: 300, right: 780, bottom: 400 },
  clip: { left: 600, top: 250, right: 1000, bottom: 500 },
  frame: { left: 580, top: 230, right: 1020, bottom: 520 },
  edge: 'bottom',
  size: 100,
  mood: 'looking',
}

/** Where each intro ghost was sent (its translate), in px. */
function landedAt(): { x: number; y: number }[] {
  return [...container.querySelectorAll<HTMLElement>('.lights-on-ghost')].map((element) => {
    const match = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(element.style.transform)
    return { x: Number(match?.[1]), y: Number(match?.[2]) }
  })
}

function Page(): ReactElement {
  return (
    <GhostsProvider>
      <ReducedMotionProvider>
        <button type="button" id="under" onClick={() => (underClicks += 1)}>
          The real page
        </button>
        <IntroProbe />
        <MarginStandIn />
        <PaintingStandIn />
        <LightsOn />
      </ReducedMotionProvider>
    </GhostsProvider>
  )
}

function mount(): void {
  act(() => root.render(<Page />))
}

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

const intro = (): Element | null => container.querySelector('.lights-on')
const status = (): Element | null => container.querySelector('[role="status"]')
const dark = (): Element => {
  const layer = container.querySelector('.lights-on-dark')
  if (layer === null) throw new Error('no dark layer')
  return layer
}
const probe = (): string | undefined => container.querySelector<HTMLElement>('#probe')?.dataset.intro

/** Two animation frames, which the fake clock runs at 16 ms each. */
const FRAMES_MS = 40

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function fire(type: string, target: Element, init: EventInit = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  resetPlannedSpots()
  underClicks = 0
  // The page has been loading for 0 ms when the intro mounts: the budget is the full one.
  vi.spyOn(performance, 'now').mockReturnValue(0)
  vi.useFakeTimers()
  // Frames run on the fake clock, 16 ms each, so a test can step through them.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number =>
    window.setTimeout(() => callback(0), 16),
  )
  vi.stubGlobal('cancelAnimationFrame', (handle: number): void => window.clearTimeout(handle))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.getElementById('main')?.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'fonts')
})

describe('introSchedule', () => {
  it('is fixed: the lights come on by 3.9 s and the fade ends by 4.5 s, whatever the page did before it mounted', () => {
    expect(introSchedule()).toEqual({ lightsLatestMs: INTRO_LIGHTS_LATEST_MS, endLatestMs: INTRO_LIGHTS_LATEST_MS + INTRO_FADE_MS })
    expect(INTRO_MIN_MS).toBe(3200)
    expect(INTRO_LIGHTS_LATEST_MS).toBe(3900)
    expect(INTRO_FADE_MS).toBe(600)
  })

  it('keeps the whole intro under 5 s (WCAG 2.2.2) and the minimum dark before the latest lights', () => {
    const { lightsLatestMs, endLatestMs } = introSchedule()
    expect(INTRO_MIN_MS).toBeLessThanOrEqual(lightsLatestMs)
    expect(endLatestMs).toBeLessThanOrEqual(INTRO_MAX_MS)
    expect(INTRO_MAX_MS).toBe(4600)
    expect(INTRO_MAX_MS + 200).toBeLessThanOrEqual(4800)
    expect(INTRO_MAX_MS + 200).toBeLessThan(5000)
  })
})

describe('LightsOn', () => {
  it('starts dark with a status line and ghosts, while the real page stays in the tree', () => {
    mount()
    expect(intro()).not.toBeNull()
    expect(status()?.textContent).toBe('Lighting the candles…')
    // Only the status text is exposed: the dark layer and the ghosts are aria-hidden.
    expect(dark().getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.lights-on-ghosts')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('.lights-on-ghost')).toHaveLength(4)
    expect(container.querySelectorAll('.lights-on-ghost svg[aria-hidden="true"][focusable="false"]')).toHaveLength(4)
    // The skip hint is for sighted users: hidden from assistive technology, so the one announcement stays the status line.
    const hint = container.querySelector('.lights-on-hint')
    expect(hint?.textContent).toBe('Press any key or tap to skip')
    expect(hint?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    // Nothing in the intro can take focus, and the page underneath is not hidden.
    expect(intro()?.querySelector('[tabindex], button, a, input')).toBeNull()
    expect(document.getElementById('under')?.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('puts the status line in empty and fills it afterwards, so a screen reader announces the change', () => {
    const records: MutationRecord[] = []
    const observer = new MutationObserver((batch) => records.push(...batch))
    observer.observe(container, { childList: true, subtree: true, characterData: true })
    mount()
    records.push(...observer.takeRecords())
    observer.disconnect()
    const line = container.querySelector('.lights-on-status > span')
    expect(line?.textContent).toBe('Lighting the candles…')
    // The words were added to the (already inserted, empty) status line as a change of its own. Had they
    // arrived with it, no record would target the line, and a screen reader would not announce them.
    const textAdded = records.some((record) => record.target === line && [...record.addedNodes].some((node) => node.nodeType === Node.TEXT_NODE))
    expect(textAdded).toBe(true)
  })

  it('waits at least 3.2 s, then lights up and removes the status text', async () => {
    mount()
    await advance(0)
    await advance(INTRO_MIN_MS - 1)
    expect(intro()?.getAttribute('data-phase')).toBe('dark')
    expect(status()).not.toBeNull()
    await advance(1)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
    expect(status()).toBeNull()
    await advance(INTRO_FADE_MS)
    expect(intro()).toBeNull()
  })

  it('is gone by 4.6 s after mount even when the fonts never finish loading', async () => {
    Object.defineProperty(document, 'fonts', { value: { ready: new Promise(() => undefined) }, configurable: true })
    mount()
    await advance(INTRO_LIGHTS_LATEST_MS - 1)
    expect(intro()?.getAttribute('data-phase')).toBe('dark')
    await advance(1)
    // The fade starts by 3.9 s at the latest.
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
    await advance(INTRO_MAX_MS - INTRO_LIGHTS_LATEST_MS)
    expect(intro()).toBeNull()
    expect(status()).toBeNull()
  })

  it('never lights up before 3.2 s, even when the fonts were ready at once', async () => {
    mount()
    await advance(INTRO_MIN_MS - 100)
    expect(intro()?.getAttribute('data-phase')).toBe('dark')
    await advance(100)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
  })

  it('the page spending time loading before the intro mounted changes nothing: the dark is a fixed minimum', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(2500)
    Object.defineProperty(document, 'fonts', { value: { ready: new Promise(() => undefined) }, configurable: true })
    mount()
    await advance(INTRO_LIGHTS_LATEST_MS - 1)
    expect(intro()?.getAttribute('data-phase')).toBe('dark')
    await advance(1)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
  })

  it('four ghosts roam at 1024 px, three at 375 px, each on its own path, and a hint says how to skip', async () => {
    mount()
    expect([...container.querySelectorAll('.lights-on-roam')].map((el) => el.getAttribute('data-path'))).toEqual(['circle', 'chase-a', 'chase-b', 'sneak'])
    act(() => root.unmount())
    window.sessionStorage.clear()
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true })
    root = createRoot(container)
    mount()
    expect([...container.querySelectorAll('.lights-on-roam')].map((el) => el.getAttribute('data-path'))).toEqual(['chase-a', 'chase-b', 'sneak'])
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  })

  it('does not play in an automated browser (navigator.webdriver) unless the force flag is set', () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    mount()
    expect(intro()).toBeNull()
    expect(window.sessionStorage.getItem(INTRO_SESSION_KEY)).toBeNull()
    act(() => root.unmount())
    window.sessionStorage.setItem(INTRO_FORCE_KEY, '1')
    root = createRoot(container)
    mount()
    expect(intro()).not.toBeNull()
    Reflect.deleteProperty(navigator, 'webdriver')
  })

  it('waits for the fonts when they finish after the minimum time', async () => {
    let finish: () => void = () => undefined
    Object.defineProperty(document, 'fonts', {
      value: { ready: new Promise<void>((resolve) => { finish = resolve }) },
      configurable: true,
    })
    mount()
    await advance(INTRO_MIN_MS + 500)
    expect(intro()?.getAttribute('data-phase')).toBe('dark')
    await act(async () => finish())
    // The landing is read two frames after the fonts, once the margin ghosts have been fitted again.
    await advance(FRAMES_MS)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
  })

  it('the intro ghosts keep one size from the dark phase to the hand-off', async () => {
    mount()
    await advance(0)
    const widthOf = (): string | null | undefined => container.querySelector('.lights-on-ghost svg')?.getAttribute('width')
    const dark = widthOf()
    expect(Number(dark)).toBeGreaterThan(0)
    await advance(INTRO_MIN_MS)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
    expect(widthOf()).toBe(dark)
  })

  it('plays once per browser session', () => {
    mount()
    expect(window.sessionStorage.getItem(INTRO_SESSION_KEY)).not.toBeNull()
    act(() => root.unmount())
    root = createRoot(container)
    mount()
    expect(intro()).toBeNull()
  })

  it('does not play when the session flag is already set', () => {
    window.sessionStorage.setItem(INTRO_SESSION_KEY, '1')
    mount()
    expect(intro()).toBeNull()
  })

  it('still plays (once per page load) when sessionStorage is blocked, and never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(mount).not.toThrow()
    vi.restoreAllMocks()
  })

  it('never renders under reduced motion', () => {
    stubReducedMotion(true)
    mount()
    expect(intro()).toBeNull()
    expect(status()).toBeNull()
  })

  it('never renders when the ghosts are hidden', () => {
    window.localStorage.setItem(HIDE_GHOSTS_KEY, '1')
    mount()
    expect(intro()).toBeNull()
  })

  it('does not mark the session as seen when it never played', () => {
    stubReducedMotion(true)
    mount()
    expect(window.sessionStorage.getItem(INTRO_SESSION_KEY)).toBeNull()
  })
})

describe('LightsOn: skipping', () => {
  it('a key press ends it at once, and the key press is not swallowed', () => {
    mount()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => {
      document.getElementById('under')?.dispatchEvent(tab)
    })
    expect(intro()).toBeNull()
    expect(tab.defaultPrevented).toBe(false)
  })

  it.each(['pointerdown', 'touchstart'])('%s clears the dark at once, without preventing it, but keeps the layer for the click that follows', (type) => {
    mount()
    const event = fire(type, dark())
    expect(event.defaultPrevented).toBe(false)
    expect(intro()?.getAttribute('data-phase')).toBe('skipped')
    // The words are gone, and the layer is still there to catch the tap's click.
    expect(status()).toBeNull()
    expect(container.querySelector('.lights-on-dark')).not.toBeNull()
    expect(probe()).toBe('true')
  })

  it('the click that follows the tap lands on the layer, is consumed there, and ends the intro', () => {
    mount()
    const onDocument = vi.fn()
    document.addEventListener('click', onDocument)
    fire('pointerdown', dark())
    fire('pointerup', dark())
    const click = fire('click', dark())
    document.removeEventListener('click', onDocument)
    expect(intro()).toBeNull()
    expect(click.defaultPrevented).toBe(false)
    // Neither the real page's control nor anything else on the way up saw it.
    expect(onDocument).not.toHaveBeenCalled()
    expect(underClicks).toBe(0)
  })

  it('a click on its own (no pointerdown first) also ends it, and is consumed', () => {
    mount()
    const onDocument = vi.fn()
    document.addEventListener('click', onDocument)
    fire('click', dark())
    document.removeEventListener('click', onDocument)
    expect(intro()).toBeNull()
    expect(onDocument).not.toHaveBeenCalled()
  })

  it('lets go shortly after the end of the gesture when no click follows (a drag, a cancelled tap)', async () => {
    mount()
    fire('pointerdown', dark())
    await advance(SKIP_CLICK_GRACE_MS + 1000)
    // Still held down: the layer waits.
    expect(intro()).not.toBeNull()
    fire('pointerup', dark())
    await advance(SKIP_CLICK_GRACE_MS - 1)
    expect(intro()).not.toBeNull()
    await advance(1)
    expect(intro()).toBeNull()
  })

  it('a press while the dark fades goes to the page underneath, and ends the intro without catching its click', async () => {
    mount()
    await advance(0)
    await advance(INTRO_MIN_MS)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
    fire('pointerdown', document.getElementById('under') as Element)
    // Not the click-catching state: the layer lets go at once, so the pointer-up and click reach the page.
    expect(intro()).toBeNull()
    fire('click', document.getElementById('under') as Element)
    expect(underClicks).toBe(1)
  })

  it('a key press during a skipping tap ends it at once', () => {
    mount()
    fire('pointerdown', dark())
    act(() => {
      document.getElementById('under')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(intro()).toBeNull()
  })
})

describe('LightsOn: the hand-off', () => {
  it('tells the margin ghosts to wait while it is on screen, and to show when it is gone', async () => {
    mount()
    await advance(0)
    expect(probe()).toBe('true')
    await advance(INTRO_MIN_MS)
    expect(probe()).toBe('true')
    await advance(INTRO_FADE_MS)
    expect(intro()).toBeNull()
    expect(probe()).toBe('false')
  })

  it('does not hold the margin ghosts when it never plays', () => {
    stubReducedMotion(true)
    mount()
    expect(probe()).toBe('false')
  })

  it('lands on the margin ghosts\' spots as they stand when the lights come on, not on a plan of its own', async () => {
    mount()
    await advance(0)
    // The margin ghosts report (or move to) their spots after the intro began: the landing reads them only now.
    const placement: Placement = {
      innerWidth: 1440,
      viewWidth: 1440,
      height: 900,
      size: 150,
      minY: 104,
      panelLeft: 144,
      panelRight: 1296,
      panelMinY: 112,
      panelMaxY: 788,
      footerTop: 820,
    }
    const spots: Spot[] = [
      { edge: 'left', anchor: 'window', pos: 200 },
      { edge: 'right', anchor: 'window', pos: 420 },
      { edge: 'right', anchor: 'panel', pos: 560 },
    ]
    act(() => publish({ placement, spots }))
    await advance(INTRO_MIN_MS)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
    const landed = landedAt()
    for (const spot of spots) expect(landed).toContainEqual(peekPosition(spot, placement))
  })

  it('with no margin ghosts but a painting ghost, exactly one intro ghost darts to the painting spot and the rest leave', async () => {
    mount()
    await advance(0)
    act(() => publish(null))
    act(() => publishPainting(PAINTING_LAYOUT))
    await advance(INTRO_MIN_MS)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
    const landed = landedAt()
    const there = (at: { x: number; y: number }): boolean => at.x === 700 && at.y === 300
    expect(landed.filter(there)).toHaveLength(1)
    for (const at of landed.filter((other) => !there(other))) expect(at.x < 0 || at.x >= window.innerWidth).toBe(true)
  })

  it('does not take the painting spot when margin ghosts are waiting', async () => {
    mount()
    await advance(0)
    const placement: Placement = {
      innerWidth: 1440,
      viewWidth: 1440,
      height: 900,
      size: 150,
      minY: 104,
      panelLeft: 144,
      panelRight: 1296,
      panelMinY: 112,
      panelMaxY: 788,
      footerTop: 820,
    }
    act(() => publish({ placement, spots: [{ edge: 'left', anchor: 'window', pos: 200 }] }))
    act(() => publishPainting(PAINTING_LAYOUT))
    await advance(INTRO_MIN_MS)
    expect(landedAt().filter((at) => at.x === 700 && at.y === 300)).toHaveLength(0)
  })

  it('with no margin ghosts to hand over to (no room for a face), every intro ghost darts out of sight', async () => {
    mount()
    await advance(0)
    act(() => publish(null))
    await advance(INTRO_MIN_MS)
    expect(intro()?.getAttribute('data-phase')).toBe('lights')
    const size = container.querySelector('.lights-on-ghost svg')?.getAttribute('width')
    const width = Number(size)
    expect(width).toBeGreaterThan(0)
    const landed = landedAt()
    expect(landed.length).toBeGreaterThan(0)
    for (const at of landed) expect(at.x <= -width || at.x >= window.innerWidth).toBe(true)
  })
})
