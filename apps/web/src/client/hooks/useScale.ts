import { useCallback, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { computeScale } from '../utils/scale'
import type { ScaleState } from '../utils/scale'

export type PngSize = { width: number; height: number }

/**
 * Scale state for the screenshot: `min(1, containerWidth / naturalWidth)`, recomputed when the
 * container is resized (requirement 8.4, 8.5). Null until the PNG size and container width are known.
 */
export function useScale(png: PngSize | null, containerRef: RefObject<HTMLElement>): ScaleState | null {
  const [scale, setScale] = useState<ScaleState | null>(null)

  const measure = useCallback((): void => {
    const container = containerRef.current
    if (png === null || container === null || png.width <= 0 || png.height <= 0 || container.clientWidth <= 0) {
      setScale(null)
      return
    }
    const next = computeScale(png.width, png.height, container.clientWidth)
    setScale((previous) =>
      previous !== null && previous.scaleFactor === next.scaleFactor && previous.pngWidth === next.pngWidth && previous.pngHeight === next.pngHeight
        ? previous
        : next,
    )
  }, [png, containerRef])

  useLayoutEffect(() => {
    measure()
    const container = containerRef.current
    if (container === null) return undefined
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure)
      observer.observe(container)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, containerRef])

  return scale
}
