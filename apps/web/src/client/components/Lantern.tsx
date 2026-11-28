import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'

const RADIUS = 180
const PADDING = 7
const PANELS = 'header.app-header, #main, footer.app-footer'

/**
 * The clip that keeps the light on the wall: the whole viewport minus the header, the content
 * panel and the footer (even-odd, so each panel is a hole). Light never falls on text, so it can
 * only brighten the wall and never lowers the contrast of anything that is read.
 */
export function lanternClipPath(width: number, height: number, panels: readonly DOMRect[]): string {
  const holes = panels
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => {
      const left = Math.round(rect.left - PADDING)
      const top = Math.round(rect.top - PADDING)
      const right = Math.round(rect.right + PADDING)
      const bottom = Math.round(rect.bottom + PADDING)
      return `M${left} ${top}H${right}V${bottom}H${left}Z`
    })
  return `path(evenodd, "M0 0H${width}V${height}H0Z ${holes.join(' ')}")`
}

type LanternProps = {
  /** Changes when the page behind the light changes (a route change): the clip is worked out again. */
  routeKey: string
}

/**
 * The lantern: a soft warm light that follows the mouse pointer. Decoration only (`aria-hidden`,
 * `pointer-events: none`). It moves with `transform` and fades with `opacity`. It sits behind the
 * panels (see ghosts.css) and is also clipped to the wall, so it never touches text.
 *
 * The clip follows the layout: a `ResizeObserver` watches the header, the panel, the footer and the
 * page, and a route change measures again.
 */
export function Lantern({ routeKey }: LanternProps): ReactElement {
  const layer = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const reclip = useRef<() => void>(() => undefined)

  useEffect(() => {
    let frame = 0
    const clip = (): void => {
      frame = 0
      const rects = [...document.querySelectorAll(PANELS)].map((element) => element.getBoundingClientRect())
      layer.current?.style.setProperty('clip-path', lanternClipPath(window.innerWidth, window.innerHeight, rects))
    }
    const scheduleClip = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(clip)
    }
    reclip.current = scheduleClip
    const move = (event: PointerEvent): void => {
      if (event.pointerType === 'touch' || glow.current === null) return
      scheduleClip()
      glow.current.style.transform = `translate3d(${event.clientX - RADIUS}px, ${event.clientY - RADIUS}px, 0)`
      glow.current.style.opacity = '1'
    }
    const leave = (): void => {
      if (glow.current !== null) glow.current.style.opacity = '0'
    }
    clip()
    void document.fonts?.ready.then(scheduleClip)
    window.addEventListener('pointermove', move)
    window.addEventListener('resize', scheduleClip)
    window.addEventListener('scroll', scheduleClip, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.cancelAnimationFrame(frame)
      reclip.current = () => undefined
      window.removeEventListener('pointermove', move)
      window.removeEventListener('resize', scheduleClip)
      window.removeEventListener('scroll', scheduleClip)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [])

  // A route change swaps the panel for a new element: watch the new ones, and clip again at once.
  useEffect(() => {
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => reclip.current())
    for (const target of [document.body, ...document.querySelectorAll(PANELS)]) observer?.observe(target)
    reclip.current()
    // The glow fades out until the next pointer move, so a resting light never sits on a new layout.
    if (glow.current !== null) glow.current.style.opacity = '0'
    return () => observer?.disconnect()
  }, [routeKey])

  return (
    <div className="lantern" ref={layer} aria-hidden="true">
      <div className="lantern-glow" ref={glow} style={{ width: RADIUS * 2, height: RADIUS * 2 }} />
    </div>
  )
}
