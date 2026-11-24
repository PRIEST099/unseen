import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useScale } from '../hooks/useScale'
import type { PngSize } from '../hooks/useScale'
import { screenshotEndpoint } from '../utils/audit-source'
import type { AuditSource } from '../utils/audit-source'
import type { ScaleState } from '../utils/scale'

type ScreenshotStageProps = {
  source: AuditSource
  /** Decorative layers drawn over the screenshot. They get the same scale, so they cannot drift. */
  children: (scale: ScaleState) => ReactNode
}

/**
 * The audited screenshot at its fitted size, with a render prop for layers on top of it. The scale
 * comes from the PNG's natural size and the container width (requirement 8.3, 8.4).
 */
export function ScreenshotStage({ source, children }: ScreenshotStageProps): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState<PngSize | null>(null)
  const [imageFailed, setImageFailed] = useState(false)
  const scale = useScale(natural, frameRef)

  const readNaturalSize = useCallback((): void => {
    const image = imgRef.current
    if (image === null || image.naturalWidth <= 0 || image.naturalHeight <= 0) return
    const next = { width: image.naturalWidth, height: image.naturalHeight }
    setNatural((previous) => (previous?.width === next.width && previous.height === next.height ? previous : next))
  }, [])

  useLayoutEffect(readNaturalSize, [readNaturalSize])

  const size = scale === null ? undefined : { width: scale.scaledWidth, height: scale.scaledHeight }
  return (
    <div className="stage-frame" ref={frameRef}>
      <div className="spirit-stage" style={size}>
        <img
          ref={imgRef}
          src={screenshotEndpoint(source)}
          alt="Audited page screenshot"
          style={size}
          onLoad={readNaturalSize}
          onError={() => setImageFailed(true)}
        />
        {scale !== null ? children(scale) : null}
      </div>
      {imageFailed ? <p className="image-error">The screenshot could not be loaded.</p> : null}
    </div>
  )
}
