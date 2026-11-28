import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act as reactAct, useLayoutEffect } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostsProvider, HIDE_GHOSTS_KEY, useDaylightFlag, useGhosts } from '../contexts/GhostsContext'
import type { MarginLayout } from '../contexts/GhostsContext'
import { ReducedMotionProvider } from '../contexts/ReducedMotionContext'
import {
  FOOTER_GAP,
  NEAR_PX,
  PANEL_RING,
  REEMERGE_MS,
  boxesIntersect,
  distanceToBox,
  distanceToPoint,
  ghostCountForPlacement,
  isDifferentSpot,
  readPlacement,
  resetPlannedSpots,
  showsFace,
  spotCenter,
  visibleBox,
} from '../utils/ghost-spots'
import type { Anchor, Edge, Spot } from '../utils/ghost-spots'
import { MarginGhosts, marginGhostsAllowed } from './MarginGhosts'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const HEADER_HEIGHT = 80
const PANEL_TOP = 112
const FOOTER_HEIGHT = 76

let container: HTMLDivElement
let root: Root
let frameQueue = new Map<number, FrameRequestCallback>()
let frameId = 0
let offsetHeightDescriptor: PropertyDescriptor | undefined

/** React's `act` for callbacks that may return a value (React warns when one returns anything). */
function act(callback: () => unknown): void {
  reactAct(() => {
    callback()
  })
}

/** Runs the queued animation frames (and the frames they queue), the way a browser would, one frame at a time. */
function flushFrames(rounds = 4): void {
  for (let round = 0; round < rounds; round += 1) {
    const batch = [...frameQueue.values()]
    frameQueue = new Map()
    if (batch.length === 0) return
    act(() => {
      for (const callback of batch) callback(0)
    })
  }
}

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

/** The content column the real layout gives `#main`: 72rem wide at most, centred, 24 px in from each side. */
function panelEdges(): { left: number; right: number } {
  const column = Math.min(window.innerWidth - 48, 1152)
  const left = (window.innerWidth - column) / 2
  return { left, right: left + column }
}

function stubLayout(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element): DOMRect {
    if (this.id === 'main') {
      const { left, right } = panelEdges()
      return new DOMRect(left, PANEL_TOP, right - left, 2000)
    }
    if (this.matches('header.app-header')) return new DOMRect(0, 0, window.innerWidth, HEADER_HEIGHT)
    // A short page: the footer stands at the bottom of the window.
    if (this.matches('footer.app-footer')) return new DOMRect(0, window.innerHeight - FOOTER_HEIGHT, window.innerWidth, FOOTER_HEIGHT)
    return new DOMRect(0, 0, 0, 0)
  })
  offsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement): number {
      return this.matches('header.app-header') ? HEADER_HEIGHT : 0
    },
  })
}

function stubReducedMotion(matches: boolean): { change: (next: boolean) => void } {
  let current = matches
  const listeners = new Set<(event: { matches: boolean }) => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches(): boolean {
      return current
    },
    media: query,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  }))
  return {
    change: (next) => {
      current = next
      act(() => {
        for (const listener of listeners) listener({ matches: next })
      })
    },
  }
}

function SetIntro({ active }: { active: boolean }): null {
  const { setIntroActive } = useGhosts()
  useLayoutEffect(() => {
    setIntroActive(active)
  }, [active, setIntroActive])
  return null
}

/** Captures what the margin ghosts report for the intro's hand-off. */
let readLayout: () => MarginLayout | null = () => null
function LayoutProbe(): null {
  const { readMarginLayout } = useGhosts()
  readLayout = readMarginLayout
  return null
}

type SceneProps = { path: string; daylight?: boolean; intro?: boolean; footer?: boolean }

function DaylightFlag(): null {
  useDaylightFlag(true)
  return null
}

function Scene({ path, daylight = false, intro = false, footer = false }: SceneProps): ReactElement {
  return (
    <MemoryRouter initialEntries={[path]}>
      <GhostsProvider>
        <ReducedMotionProvider>
          <header className="app-header">Header</header>
          <main id="main" tabIndex={-1}>
            <button type="button" id="inside">
              Inside
            </button>
          </main>
          {footer ? <footer className="app-footer">Footer</footer> : null}
          {daylight ? <DaylightFlag /> : null}
          <SetIntro active={intro} />
          <LayoutProbe />
          <MarginGhosts />
        </ReducedMotionProvider>
      </GhostsProvider>
    </MemoryRouter>
  )
}

function mount(path = '/', options: Omit<SceneProps, 'path'> = {}): void {
  act(() => root.render(<Scene path={path} {...options} />))
}

const ghostEls = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.margin-ghost')]
const slideOf = (element: HTMLElement): HTMLElement => {
  const slide = element.querySelector<HTMLElement>('.margin-ghost-slide')
  if (slide === null) throw new Error('no slide')
  return slide
}
const spotOf = (element: HTMLElement): Spot => ({
  edge: (element.dataset.edge ?? 'left') as Edge,
  anchor: (element.dataset.anchor ?? 'window') as Anchor,
  pos: Number(element.dataset.pos),
})
const spots = (): Spot[] => ghostEls().map(spotOf)
const hiddenFlags = (): string[] => ghostEls().map((element) => element.dataset.hidden ?? '')

function pointerAt(point: { x: number; y: number }): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: point.x, clientY: point.y, bubbles: true }))
  })
  flushFrames()
}

function visibilityChange(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  flushFrames()
}

const centreOf = (spot: Spot): { x: number; y: number } => spotCenter(spot, readPlacement())
const first = (): Spot => {
  const spot = spots()[0]
  if (spot === undefined) throw new Error('no ghost')
  return spot
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  resetPlannedSpots()
  setWidth(1280)
  frameQueue = new Map()
  frameId = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frameId += 1
    frameQueue.set(frameId, callback)
    return frameId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frameQueue.delete(id)
  })
  stubLayout()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (offsetHeightDescriptor !== undefined) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeightDescriptor)
  Reflect.deleteProperty(document, 'visibilityState')
})

function useFakeClock(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
}

describe('MarginGhosts: how many', () => {
  // The real column is 72rem (1152 px) at most, 24 px in from each side below 1200 px: from about 1210 px
  // down, no margin can show a ghost's dome and both eyes, so there are none rather than eyeless slivers.
  it.each([
    [1920, 3],
    [1440, 3],
    [1280, 3],
    [1240, 0],
    [1100, 0],
    [1099, 0],
    [900, 0],
    [768, 0],
    [767, 0],
    [375, 0],
  ])('at %i px wide there are %i ghosts', (width, count) => {
    setWidth(width)
    mount()
    expect(ghostEls()).toHaveLength(count)
    expect(ghostCountForPlacement(readPlacement())).toBe(count)
  })

  it('every ghost drawn shows its dome and both eyes, whatever the width', () => {
    for (let width = 768; width <= 1920; width += 16) {
      setWidth(width)
      resetPlannedSpots()
      mount()
      const placement = readPlacement()
      for (const spot of spots()) expect(showsFace(spot, placement), `${width} px: ${JSON.stringify(spot)}`).toBe(true)
      act(() => root.render(<div />))
    }
  })

  it('follows the window when it is resized across a breakpoint', () => {
    mount()
    expect(ghostEls()).toHaveLength(3)
    for (const [width, count] of [[1100, 0], [500, 0], [1400, 3]] as const) {
      setWidth(width)
      act(() => window.dispatchEvent(new Event('resize')))
      flushFrames()
      expect(ghostEls()).toHaveLength(count)
    }
    expect(container.querySelector('.margin-ghosts')).not.toBeNull()
  })
})

describe('MarginGhosts: the footer', () => {
  it('a short page with its footer in view: no bottom ghost, and nothing of a ghost behind the footer', () => {
    setWidth(1920)
    for (let run = 0; run < 40; run += 1) {
      resetPlannedSpots()
      mount('/', { footer: true })
      const placement = readPlacement()
      expect(placement.footerTop).toBe(window.innerHeight - FOOTER_HEIGHT)
      expect(ghostEls()).toHaveLength(3)
      for (const spot of spots()) {
        expect(spot.edge).not.toBe('bottom')
        // The whole ghost box (so both eyes) stands above the footer's top.
        expect(spot.pos + placement.size).toBeLessThanOrEqual(placement.footerTop - FOOTER_GAP)
        expect(showsFace(spot, placement)).toBe(true)
      }
      act(() => root.render(<div />))
    }
  })
})

describe('MarginGhosts: where', () => {
  it.each(['/', '/seance/job-1', '/sample/cursed-shop-index', '/sample/cursed-shop-index/keyboard', '/sample/cursed-shop-index/whisper', '/audit/job-1', '/nonexistent'])(
    'shows on %s',
    (path) => {
      mount(path)
      expect(ghostEls().length).toBeGreaterThan(0)
    },
  )

  it.each(['/sample/cursed-shop-index/daylight', '/audit/job-1/daylight'])('shows nothing on the loaded Daylight lens (%s)', (path) => {
    mount(path, { daylight: true })
    expect(ghostEls()).toHaveLength(0)
    expect(container.querySelector('.lantern')).toBeNull()
  })

  it('still shows on a not-found page under a .../daylight path: the Daylight lens is told by the view, not the path', () => {
    mount('/sample/no-such-sample/daylight')
    expect(ghostEls().length).toBeGreaterThan(0)
  })

  it('knows which views get margin ghosts: every one except the loaded Daylight lens', () => {
    expect(marginGhostsAllowed(false)).toBe(true)
    expect(marginGhostsAllowed(true)).toBe(false)
  })

  it('on an audit view the margin ghosts do not bob (they still slide)', () => {
    mount('/sample/cursed-shop-index')
    expect(container.querySelectorAll('.margin-ghost-bob[data-animated="true"]')).toHaveLength(0)
    expect(container.querySelectorAll('.margin-ghost-bob').length).toBeGreaterThan(0)
  })

  it('elsewhere the margin ghosts bob', () => {
    mount('/')
    expect(container.querySelectorAll('.margin-ghost-bob[data-animated="true"]').length).toBeGreaterThan(0)
  })

  it('is decoration only: aria-hidden, nothing focusable, no text', () => {
    mount()
    expect(container.querySelector('.margin-ghosts')?.getAttribute('aria-hidden')).toBe('true')
    for (const element of ghostEls()) {
      expect(element.getAttribute('aria-hidden')).toBe('true')
      expect(element.textContent).toBe('')
      expect(element.querySelector('svg')?.getAttribute('focusable')).toBe('false')
      expect(element.querySelector('[tabindex], a, button, input')).toBeNull()
    }
    expect(container.querySelector('.lantern')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('MarginGhosts: placement', () => {
  it('plans after the header and the panel exist: no ghost is ever planned under the header', () => {
    // The first render has no measured page. If the spots were planned then, the header offset would be
    // 24 px and a ghost could sit at the top of the right edge, over the header buttons.
    const minimum = HEADER_HEIGHT + 24
    for (let run = 0; run < 40; run += 1) {
      resetPlannedSpots()
      mount()
      for (const spot of spots()) if (spot.edge !== 'bottom') expect(spot.pos).toBeGreaterThanOrEqual(minimum)
      act(() => root.render(<div />))
    }
  })

  it('every visible part is in the wall: never in the header, never in the panel or its ring', () => {
    setWidth(1920)
    const header = { left: 0, top: 0, right: 1920, bottom: HEADER_HEIGHT }
    for (let run = 0; run < 40; run += 1) {
      resetPlannedSpots()
      mount()
      const { left, right } = panelEdges()
      const panel = { left: left - PANEL_RING, top: PANEL_TOP, right: right + PANEL_RING, bottom: 5000 }
      const placement = readPlacement()
      expect(ghostEls()).toHaveLength(3)
      for (const spot of spots()) {
        const box = visibleBox(spot, placement)
        expect(boxesIntersect(box, header)).toBe(false)
        expect(boxesIntersect(box, panel)).toBe(false)
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(placement.viewWidth)
      }
      act(() => root.render(<div />))
    }
  })

  it('where the margin is wide, every ghost shows its dome and both eyes (at least 70% of its width or depth)', () => {
    setWidth(1920)
    for (let run = 0; run < 60; run += 1) {
      resetPlannedSpots()
      mount()
      const placement = readPlacement()
      expect(ghostEls()).toHaveLength(3)
      for (const spot of spots()) {
        const box = visibleBox(spot, placement)
        expect((box.right - box.left) / placement.size).toBeGreaterThanOrEqual(0.7)
      }
      act(() => root.render(<div />))
    }
  })

  it('is not planned twice for the same page: measuring again does not move a ghost', () => {
    mount()
    const before = spots()
    act(() => window.dispatchEvent(new Event('resize')))
    flushFrames()
    expect(spots()).toEqual(before)
  })
})

describe('MarginGhosts: the lantern', () => {
  it('hides a ghost when the pointer comes within range, and leaves the others', () => {
    mount()
    const target = first()
    const centre = centreOf(target)
    const point = { x: centre.x + NEAR_PX - 5, y: centre.y }
    pointerAt(point)
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
    expect(ghostEls()[0]?.querySelector('svg')?.getAttribute('data-mood')).toBe('startled')
    spots().slice(1).forEach((spot, index) => {
      const near = distanceToPoint(centreOf(spot), point) <= NEAR_PX
      expect(ghostEls()[index + 1]?.dataset.hidden).toBe(String(near))
    })
  })

  it('leaves every ghost alone while the pointer is out of range', () => {
    mount()
    const placement = readPlacement()
    const point = { x: placement.viewWidth / 2, y: placement.height / 2 }
    expect(spots().every((spot) => distanceToPoint(centreOf(spot), point) > NEAR_PX)).toBe(true)
    pointerAt(point)
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
  })

  it('ignores touch pointers', () => {
    mount()
    const centre = centreOf(first())
    act(() => {
      const touch = new MouseEvent('pointermove', { clientX: centre.x, clientY: centre.y, bubbles: true })
      Object.defineProperty(touch, 'pointerType', { value: 'touch' })
      window.dispatchEvent(touch)
    })
    flushFrames()
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
  })

  it('looks at one pointer position per frame, however many moves arrive', () => {
    mount()
    const centre = centreOf(first())
    act(() => {
      for (let step = 0; step < 50; step += 1) {
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: centre.x + 400 + step, clientY: centre.y, bubbles: true }))
      }
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: centre.x, clientY: centre.y, bubbles: true }))
    })
    // Nothing is looked at until the frame; then only the newest position counts.
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
    flushFrames()
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
  })

  it('brings the ghost back at a different spot a few seconds after the lantern has gone', () => {
    useFakeClock()
    mount()
    const old = first()
    pointerAt(centreOf(old))
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
    act(() => vi.advanceTimersByTime(REEMERGE_MS - 1))
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
    expect(spotOf(ghostEls()[0] as HTMLElement)).toEqual(old)
    act(() => vi.advanceTimersByTime(1))
    const element = ghostEls()[0] as HTMLElement
    expect(element.dataset.hidden).toBe('false')
    expect(isDifferentSpot(spotOf(element), old)).toBe(true)
  })

  it('keeps a ghost hidden while the lantern stays near, and counts the delay from its last move', () => {
    useFakeClock()
    mount()
    const target = first()
    pointerAt(centreOf(target))
    act(() => vi.advanceTimersByTime(REEMERGE_MS - 500))
    pointerAt(centreOf(target))
    act(() => vi.advanceTimersByTime(REEMERGE_MS - 500))
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
    act(() => vi.advanceTimersByTime(500))
    expect(ghostEls()[0]?.dataset.hidden).toBe('false')
  })

  it('never re-emerges within range of the lantern', () => {
    useFakeClock()
    mount()
    const lantern = centreOf(first())
    pointerAt(lantern)
    act(() => vi.advanceTimersByTime(REEMERGE_MS))
    const next = ghostEls()[0]
    if (next === undefined) throw new Error('no ghost')
    expect(distanceToPoint(centreOf(spotOf(next)), lantern)).toBeGreaterThan(NEAR_PX)
  })
})

describe('MarginGhosts: a ghost that moves never crosses the page', () => {
  it('comes back as a new node that starts out of sight, and only slides in after it has been painted', () => {
    useFakeClock()
    mount()
    const old = ghostEls()[0] as HTMLElement
    pointerAt(centreOf(spotOf(old)))
    act(() => vi.advanceTimersByTime(REEMERGE_MS))
    const next = ghostEls()[0] as HTMLElement
    // A new node for the new spot: nothing is transitioned from the old edge to the new one.
    expect(next).not.toBe(old)
    expect(old.isConnected).toBe(false)
    expect(slideOf(next).dataset.out).toBe('true')
    expect(slideOf(next).style.transform).not.toBe('translate3d(0px, 0px, 0)')
    flushFrames()
    expect(slideOf(ghostEls()[0] as HTMLElement).dataset.out).toBe('false')
    expect(slideOf(ghostEls()[0] as HTMLElement).style.transform).toBe('translate3d(0px, 0px, 0)')
  })

  it('a ghost that is startled stays the same node and slides out in place', () => {
    mount()
    const element = ghostEls()[0] as HTMLElement
    pointerAt(centreOf(spotOf(element)))
    expect(ghostEls()[0]).toBe(element)
    expect(slideOf(element).dataset.out).toBe('true')
  })

  it('the first planning stands in place (the intro hands over to it); nothing slides at load', () => {
    mount()
    for (const element of ghostEls()) expect(slideOf(element).dataset.out).toBe('false')
  })
})

describe('MarginGhosts: keyboard focus', () => {
  beforeEach(() => {
    // jsdom has no keyboard modality: say that whatever has focus got it from the keyboard, as a Tab press does.
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string): boolean {
      return selector === ':focus-visible' ? document.activeElement === this : matches.call(this, selector)
    })
  })

  function control(centre: { x: number; y: number }, tabIndex?: number): HTMLButtonElement {
    const button = document.createElement('button')
    button.textContent = 'Focus me'
    if (tabIndex !== undefined) button.tabIndex = tabIndex
    container.append(button)
    button.getBoundingClientRect = (): DOMRect => new DOMRect(centre.x - 40 + NEAR_PX - 20, centre.y - 15, 80, 30)
    return button
  }

  it('hides a ghost when focus lands on a control within range', () => {
    mount()
    act(() => control(centreOf(first())).focus())
    flushFrames()
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
  })

  it('leaves the ghosts when focus lands far away', () => {
    mount()
    const placement = readPlacement()
    act(() => control({ x: placement.viewWidth / 2 - NEAR_PX, y: placement.height / 2 }).focus())
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
  })

  it('does not react to programmatic focus on #main (the skip link and every navigation do that)', () => {
    mount()
    const main = document.getElementById('main')
    if (main === null) throw new Error('no #main')
    // The panel is right beside every ghost: if this focus counted, every ghost would hide.
    const mainBox = main.getBoundingClientRect()
    const box = { left: mainBox.left, top: mainBox.top, right: mainBox.right, bottom: mainBox.bottom }
    expect(spots().every((spot) => distanceToBox(centreOf(spot), box) <= NEAR_PX)).toBe(true)
    act(() => main.focus())
    flushFrames()
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
  })

  it('does not react to focus on any other tabindex="-1" container either', () => {
    mount()
    const target = control(centreOf(first()), -1)
    act(() => target.focus())
    flushFrames()
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
  })

  it('comes back at a different spot after the focus has moved on', () => {
    useFakeClock()
    mount()
    const old = first()
    act(() => control(centreOf(old)).focus())
    act(() => vi.advanceTimersByTime(REEMERGE_MS))
    const element = ghostEls()[0] as HTMLElement
    expect(element.dataset.hidden).toBe('false')
    expect(isDifferentSpot(spotOf(element), old)).toBe(true)
  })
})

describe('MarginGhosts: looking away', () => {
  it('moves every ghost while the tab is hidden, so nobody sees it happen', () => {
    mount()
    const before = spots()
    visibilityChange('hidden')
    const after = spots()
    expect(after).toHaveLength(before.length)
    after.forEach((spot, index) => {
      const old = before[index]
      expect(old !== undefined && isDifferentSpot(spot, old)).toBe(true)
    })
  })

  it('does not move when the tab is shown again', () => {
    mount()
    visibilityChange('hidden')
    const moved = spots()
    visibilityChange('visible')
    expect(spots()).toEqual(moved)
  })
})

describe('MarginGhosts: a hidden ghost always comes back', () => {
  it('across a size change (the timers survive the effects being rebuilt)', () => {
    useFakeClock()
    mount()
    pointerAt(centreOf(first()))
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
    const smaller = readPlacement().size
    setWidth(1920)
    act(() => window.dispatchEvent(new Event('resize')))
    flushFrames()
    expect(readPlacement().size).toBeGreaterThan(smaller)
    expect(ghostEls()).toHaveLength(3)
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
    act(() => vi.advanceTimersByTime(REEMERGE_MS))
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
  })

  it('when the window changes twice while it is hidden', () => {
    useFakeClock()
    mount()
    pointerAt(centreOf(first()))
    for (const width of [1920, 1400]) {
      setWidth(width)
      act(() => window.dispatchEvent(new Event('resize')))
      flushFrames()
    }
    act(() => vi.advanceTimersByTime(REEMERGE_MS))
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
  })

  it('when reduced motion turns on mid-session: shown still at a spot, no lantern, no bob', () => {
    useFakeClock()
    const media = stubReducedMotion(false)
    mount()
    pointerAt(centreOf(first()))
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
    media.change(true)
    flushFrames()
    expect(ghostEls()).toHaveLength(3)
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
    expect(container.querySelector('.lantern')).toBeNull()
    for (const bob of container.querySelectorAll('.margin-ghost-bob')) expect(bob.getAttribute('data-animated')).toBe('false')
    const still = spots()
    act(() => vi.advanceTimersByTime(REEMERGE_MS * 2))
    expect(spots()).toEqual(still)
  })
})

describe('MarginGhosts: the intro hand-off', () => {
  it('waits invisible while the intro plays, and shows in the same commit the intro ends', () => {
    mount('/', { intro: true })
    expect(container.querySelector('.margin-ghosts')?.getAttribute('data-intro')).toBe('true')
    expect(ghostEls()).toHaveLength(3)
    mount('/', { intro: false })
    expect(container.querySelector('.margin-ghosts')?.getAttribute('data-intro')).toBe('false')
  })

  it('while the intro plays nothing startles or relocates them: they stay where its ghosts will land', () => {
    useFakeClock()
    mount('/', { intro: true })
    const before = spots()
    pointerAt(centreOf(first()))
    visibilityChange('hidden')
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
    expect(spots()).toEqual(before)
    // Once it is over, the lantern works again.
    mount('/', { intro: false })
    pointerAt(centreOf(first()))
    expect(ghostEls()[0]?.dataset.hidden).toBe('true')
  })

  it('reports exactly the spots it shows, for the intro to land on; nothing when there are no ghosts', () => {
    mount()
    const layout = readLayout()
    expect(layout?.spots).toEqual(spots())
    expect(layout?.placement).toEqual(readPlacement())
    setWidth(1100)
    act(() => window.dispatchEvent(new Event('resize')))
    flushFrames()
    expect(ghostEls()).toHaveLength(0)
    expect(readLayout()).toBeNull()
  })
})

describe('MarginGhosts: switched off, or reduced motion', () => {
  it('renders nothing when the ghosts are hidden', () => {
    window.localStorage.setItem(HIDE_GHOSTS_KEY, '1')
    mount()
    expect(container.querySelector('.margin-ghosts')).toBeNull()
    expect(container.querySelector('.lantern')).toBeNull()
  })

  it('under reduced motion shows still ghosts: no lantern, no bob, no hiding, no creeping', () => {
    stubReducedMotion(true)
    mount()
    expect(ghostEls()).toHaveLength(3)
    expect(container.querySelector('.lantern')).toBeNull()
    for (const bob of container.querySelectorAll('.margin-ghost-bob')) expect(bob.getAttribute('data-animated')).toBe('false')
    const before = spots()
    pointerAt(centreOf(first()))
    visibilityChange('hidden')
    expect(hiddenFlags()).toEqual(['false', 'false', 'false'])
    expect(spots()).toEqual(before)
  })

  it('under reduced motion "Hide ghosts" still removes them', () => {
    stubReducedMotion(true)
    window.localStorage.setItem(HIDE_GHOSTS_KEY, '1')
    mount()
    expect(ghostEls()).toHaveLength(0)
  })
})

describe('ghosts.css', () => {
  const raw = readFileSync(join(__dirname, '..', 'styles', 'ghosts.css'), 'utf8')
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

  function rule(selector: string): string {
    const start = css.indexOf(`\n${selector} {`)
    if (start < 0) throw new Error(`no rule for ${selector}`)
    return css.slice(start, css.indexOf('}', start))
  }

  it.each(['.margin-ghosts', '.lantern', '.lantern-glow', '.margin-ghost', '.margin-ghost-slide', '.margin-ghost-bob', '.lights-on', '.lights-on-ghosts', '.lights-on-ghost'])(
    '%s never takes the pointer',
    (selector) => {
      expect(rule(selector)).toContain('pointer-events: none')
    },
  )

  it('hides the ghosts behind the page: under the header, the panel and the footer, above the wall', () => {
    // A negative z-index inside the body's own stacking context paints above the body background and
    // under all of the page, with no change to the header, the panel or the footer.
    expect(rule('.margin-ghosts')).toMatch(/position:\s*fixed/)
    expect(Number(/z-index:\s*(-?\d+)/.exec(rule('.margin-ghosts'))?.[1])).toBeLessThan(0)
    expect(rule('body')).toContain('isolation: isolate')
    // The lantern lives in that layer; no ghost element lifts itself out of it.
    expect(css).not.toMatch(/\.(?:margin-ghost(?!s)|lantern)[^{]*\{[^}]*z-index/)
  })

  it('the intro is the only thing above the dialogs (z-index 100)', () => {
    expect(Number(/z-index:\s*(\d+)/.exec(rule('.lights-on'))?.[1])).toBeGreaterThan(100)
  })

  it('animates only transform and opacity', () => {
    const transitioned = [...css.matchAll(/transition(?:-property)?:\s*([^;]+);/g)].map((match) => match[1] ?? '')
    for (const value of transitioned) {
      if (value.trim() === 'none') continue
      const properties = value.replace(/\([^)]*\)/g, '').split(',').map((part) => part.trim().split(/\s+/)[0])
      for (const property of properties) expect(['transform', 'opacity']).toContain(property)
    }
    const keyframes = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)].map((match) => match[1] ?? '')
    expect(keyframes.length).toBeGreaterThan(0)
    for (const body of keyframes) {
      const declared = [...body.matchAll(/^\s+([a-z-]+):/gm)].map((match) => match[1])
      for (const property of declared) expect(['transform', 'opacity']).toContain(property)
    }
  })

  /** Class, attribute and pseudo-class selectors count the same in the cascade; the type selectors count less. */
  function specificity(selector: string): number {
    return (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length
  }
  const lastClass = (selector: string): string => [...selector.matchAll(/\.([\w-]+)/g)].at(-1)?.[1] ?? selector

  it('the reduced-motion block can switch off every animation and transition (it is as specific as the rule it overrides)', () => {
    const start = css.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(start).toBeGreaterThan(0)
    const media = css.slice(start)
    const base = css.slice(0, start)
    const selectorsOf = (text: string, needle: RegExp): string[] =>
      [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) => needle.test(match[2] ?? ''))
        .flatMap((match) => (match[1] ?? '').split(',').map((selector) => selector.trim()))
        .filter((selector) => selector.length > 0 && !/^\d|^from|^to/.test(selector))
    const animated = /(?:animation|transition):\s*(?!none)/
    const off = /(?:animation|transition):\s*none/
    const baseSelectors = selectorsOf(base, animated)
    const offSelectors = selectorsOf(media, off)
    expect(baseSelectors.length).toBeGreaterThan(3)
    for (const selector of baseSelectors) {
      const covered = offSelectors.some((candidate) => lastClass(candidate) === lastClass(selector) && specificity(candidate) >= specificity(selector))
      expect(covered, `reduced motion must beat ${selector}`).toBe(true)
    }
  })
})
