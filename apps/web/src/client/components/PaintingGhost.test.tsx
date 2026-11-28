import { act, useLayoutEffect } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GhostsProvider, HIDE_GHOSTS_KEY, useGhosts, useHoldGhostsStill } from '../contexts/GhostsContext'
import type { PaintingLayout } from '../contexts/GhostsContext'
import { ReducedMotionProvider } from '../contexts/ReducedMotionContext'
import { REEMERGE_MS } from '../utils/ghost-spots'
import { PaintingGhost, WANDER_MIN_MS } from './PaintingGhost'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const WIDTH = 800
const HEIGHT = 400
const LEFT = 100
const TOP = 50
/** Moves the picture in the mocked layout, with no scroll or resize event (as a growing text column does). */
let shiftX = 0

let container: HTMLDivElement
let root: Root
let layout: () => PaintingLayout | null = () => null
let lantern: () => { x: number; y: number } | null = () => null
let setIntro: (active: boolean) => void = () => undefined

function Probe(): null {
  const { readPaintingLayout, setIntroActive, readLantern } = useGhosts()
  useLayoutEffect(() => {
    layout = readPaintingLayout
    lantern = readLantern
    setIntro = setIntroActive
  }, [readPaintingLayout, readLantern, setIntroActive])
  return null
}

function Held({ on }: { on: boolean }): null {
  useHoldGhostsStill(on)
  return null
}

type SceneProps = { calm?: boolean; daylight?: boolean; held?: boolean }

function Scene({ calm = false, daylight = false, held = false }: SceneProps): ReactElement {
  return (
    <GhostsProvider>
      <ReducedMotionProvider>
        <Probe />
        <Held on={held} />
        <div className="painting">
          <img alt="" />
          <PaintingGhost calm={calm} daylight={daylight} />
        </div>
      </ReducedMotionProvider>
    </GhostsProvider>
  )
}

function mount(props: SceneProps = {}): void {
  act(() => root.render(<Scene {...props} />))
}

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

const figure = (): SVGSVGElement | null => container.querySelector<SVGSVGElement>('svg.painting-ghost')
const layer = (): HTMLElement | null => container.querySelector<HTMLElement>('.painting-ghost-layer')
const bob = (): Element | null => container.querySelector('.painting-ghost-bob')

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function pointer(type: string, x: number, y: number, pointerType: string): void {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  act(() => {
    window.dispatchEvent(event)
  })
}

/** The middle of the part of the ghost that shows, in viewport px. */
function ghostCentre(): { x: number; y: number } {
  const shown = layout()?.visible
  if (shown === undefined) throw new Error('no ghost layout')
  return { x: (shown.left + shown.right) / 2, y: (shown.top + shown.bottom) / 2 }
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => window.setTimeout(() => callback(0), 16))
  vi.stubGlobal('cancelAnimationFrame', (handle: number): void => window.clearTimeout(handle))
  // jsdom has no layout: the picture's inner box is a fixed 800 x 400 at (100, 50).
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element): DOMRect {
    const sized = this.classList.contains('painting-ghost-layer')
    const [width, height] = sized ? [WIDTH, HEIGHT] : [0, 0]
    return new DOMRect(sized ? LEFT + shiftX : 0, sized ? TOP : 0, width, height)
  })
  shiftX = 0
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
})

describe('PaintingGhost', () => {
  it('is one ghost, aria-hidden, never focusable, with no text', () => {
    mount()
    expect(container.querySelectorAll('svg.painting-ghost')).toHaveLength(1)
    expect(layer()?.getAttribute('aria-hidden')).toBe('true')
    expect(figure()?.getAttribute('aria-hidden')).toBe('true')
    expect(figure()?.getAttribute('focusable')).toBe('false')
    expect(layer()?.querySelector('[tabindex], a, button, input')).toBeNull()
    expect(layer()?.textContent).toBe('')
  })

  it('its svg is cropped to the part that shows, so it is inside the picture', () => {
    mount()
    const svg = figure()
    const width = Number(svg?.getAttribute('width'))
    const height = Number(svg?.getAttribute('height'))
    const left = Number.parseFloat(svg?.style.left ?? '')
    const top = Number.parseFloat(svg?.style.top ?? '')
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(top).toBeGreaterThanOrEqual(0)
    expect(left + width).toBeLessThanOrEqual(WIDTH + 0.01)
    expect(top + height).toBeLessThanOrEqual(HEIGHT + 0.01)
  })

  it('"Hide ghosts" removes it', () => {
    window.localStorage.setItem(HIDE_GHOSTS_KEY, '1')
    mount()
    expect(layer()).toBeNull()
    expect(figure()).toBeNull()
  })

  it('bobs on a live page, and not on an audit lens', () => {
    mount()
    expect(bob()?.getAttribute('data-bob')).toBe('true')
    act(() => root.render(<Scene calm />))
    expect(bob()?.getAttribute('data-bob')).toBe('false')
  })

  it('on a lens it stands in its spot at once: nothing slides in on first mount', () => {
    mount({ calm: true })
    expect(figure()?.getAttribute('data-out')).toBe('false')
  })

  it('on Daylight it is smaller, sleepy, fainter, and never bobs', () => {
    mount()
    const normal = Number(figure()?.getAttribute('height'))
    const normalShown = layout()
    act(() => root.unmount())
    root = createRoot(container)
    mount({ calm: true, daylight: true })
    expect(figure()?.getAttribute('data-mood')).toBe('sleepy')
    expect(figure()?.getAttribute('data-daylight')).toBe('true')
    expect(bob()?.getAttribute('data-bob')).toBe('false')
    expect(layout()?.size ?? 0).toBeLessThan(normalShown?.size ?? 0)
    expect(layout()?.mood).toBe('sleepy')
    expect(normal).toBeGreaterThan(0)
  })

  it('under reduced motion it stands still: no bob, no lantern, no touch, no wandering', async () => {
    stubReducedMotion(true)
    mount()
    expect(bob()?.getAttribute('data-bob')).toBe('false')
    const before = layout()
    const at = ghostCentre()
    pointer('pointermove', at.x, at.y, 'mouse')
    pointer('pointerdown', at.x, at.y, 'touch')
    await advance(WANDER_MIN_MS * 4)
    expect(figure()?.getAttribute('data-out')).toBe('false')
    expect(layout()).toEqual(before)
  })

  it('is hidden while the intro plays, and visible in the commit in which it ends', () => {
    mount()
    act(() => setIntro(true))
    expect(layer()?.getAttribute('data-intro')).toBe('true')
    act(() => setIntro(false))
    expect(layer()?.getAttribute('data-intro')).toBe('false')
  })

  it('publishes where it stands for the intro to land on (viewport px, inside the picture)', () => {
    mount()
    const published = layout()
    expect(published).not.toBeNull()
    expect(published?.clip).toEqual({ left: LEFT, top: TOP, right: LEFT + WIDTH, bottom: TOP + HEIGHT })
    const shown = published?.visible
    expect(shown?.left ?? 0).toBeGreaterThanOrEqual(LEFT - 0.01)
    expect(shown?.right ?? 0).toBeLessThanOrEqual(LEFT + WIDTH + 0.01)
    expect(shown?.top ?? 0).toBeGreaterThanOrEqual(TOP - 0.01)
    expect(shown?.bottom ?? 0).toBeLessThanOrEqual(TOP + HEIGHT + 0.01)
  })

  it('the layout is measured when it is read: a painting that moved without any event is read where it is now', () => {
    mount()
    const before = layout()
    shiftX = 60
    const after = layout()
    expect(after?.clip.left).toBe(LEFT + 60)
    expect(after?.origin.x).toBe((before?.origin.x ?? 0) + 60)
  })

  it('does not startle or wander while the intro plays', async () => {
    mount()
    act(() => setIntro(true))
    const at = ghostCentre()
    pointer('pointermove', at.x, at.y, 'mouse')
    await advance(100)
    expect(figure()?.getAttribute('data-out')).toBe('false')
  })
})

describe('PaintingGhost: the lantern, touch and wandering', () => {
  it('a mouse within reach startles it: startled eyes, ducked behind the frame, hidden when it is done', async () => {
    mount()
    const at = ghostCentre()
    pointer('pointermove', at.x, at.y, 'mouse')
    await advance(20)
    expect(figure()?.getAttribute('data-out')).toBe('true')
    expect(figure()?.getAttribute('data-mood')).toBe('startled')
    await advance(400)
    expect(figure()?.getAttribute('data-gone')).toBe('true')
  })

  it('a mouse far away does not', async () => {
    mount()
    pointer('pointermove', 5000, 5000, 'mouse')
    await advance(50)
    expect(figure()?.getAttribute('data-out')).toBe('false')
  })

  it('comes back about 4 s after the pointer last came near, at another spot', async () => {
    mount()
    const first = layout()?.visible
    const at = ghostCentre()
    pointer('pointermove', at.x, at.y, 'mouse')
    await advance(20)
    expect(figure()?.getAttribute('data-out')).toBe('true')
    await advance(REEMERGE_MS - 100)
    expect(figure()?.getAttribute('data-out')).toBe('true')
    await advance(300)
    await advance(100)
    expect(figure()?.getAttribute('data-out')).toBe('false')
    expect(layout()?.visible).not.toEqual(first)
  })

  it('a touch inside this painting startles it, and a touch elsewhere does not', async () => {
    mount()
    pointer('pointerdown', 20, 20, 'touch')
    await advance(20)
    expect(figure()?.getAttribute('data-out')).toBe('false')
    const at = ghostCentre()
    pointer('pointerdown', at.x, at.y, 'touch')
    await advance(20)
    expect(figure()?.getAttribute('data-out')).toBe('true')
  })

  it('a touch never becomes the lantern, and is never prevented', () => {
    mount()
    pointer('pointermove', 10, 10, 'mouse')
    expect(lantern()).toEqual({ x: 10, y: 10 })
    const event = new MouseEvent('pointerdown', { clientX: 300, clientY: 200, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'pointerType', { value: 'touch' })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
    expect(lantern()).toEqual({ x: 10, y: 10 })
  })

  it('a calm ghost (an audit lens) does not startle on a touch inside its box', async () => {
    mount({ calm: true })
    const at = ghostCentre()
    pointer('pointerdown', at.x, at.y, 'touch')
    await advance(50)
    expect(figure()?.getAttribute('data-out')).toBe('false')
    expect(figure()?.getAttribute('data-mood')).not.toBe('startled')
  })

  it('a hold that begins after it ducked keeps it ducked past REEMERGE_MS, and it re-peeks once released', async () => {
    mount()
    const at = ghostCentre()
    pointer('pointermove', at.x, at.y, 'mouse')
    await advance(20)
    const ducked = figure()
    expect(ducked?.getAttribute('data-out')).toBe('true')
    mount({ held: true })
    await advance(REEMERGE_MS + 3000)
    expect(figure()).toBe(ducked)
    expect(figure()?.getAttribute('data-out')).toBe('true')
    mount({ held: false })
    await advance(1000)
    // The new spot slides in once it has been painted (two frames).
    await advance(100)
    expect(figure()).not.toBe(ducked)
    expect(figure()?.getAttribute('data-out')).toBe('false')
  })

  it('wanders to another spot in the same painting, no sooner than 20 s after mount', async () => {
    mount()
    const first = layout()?.visible
    await advance(WANDER_MIN_MS - 1000)
    expect(layout()?.visible).toEqual(first)
    await advance(21_000 + 1000)
    // The new spot slides in once it has been painted (two frames).
    await advance(100)
    expect(figure()?.getAttribute('data-out')).toBe('false')
    expect(layout()?.visible).not.toEqual(first)
  })

  it('holds completely still while a walk plays or the overlay is open: no ducking, no wandering', async () => {
    mount({ calm: true, held: true })
    const first = layout()?.visible
    const at = ghostCentre()
    pointer('pointermove', at.x, at.y, 'mouse')
    pointer('pointerdown', at.x, at.y, 'touch')
    await advance(120_000)
    expect(figure()?.getAttribute('data-out')).toBe('false')
    expect(layout()?.visible).toEqual(first)
  })

  it('moves while the tab is hidden: it is somewhere else when the tab is shown again', async () => {
    mount()
    const first = layout()?.visible
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await advance(100)
    expect(layout()?.visible).not.toEqual(first)
    expect(figure()?.getAttribute('data-out')).toBe('false')
  })
})
