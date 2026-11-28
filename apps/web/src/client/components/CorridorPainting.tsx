import type { ReactElement } from 'react'
import corridor from '../assets/manor/corridor.webp'
import corridorSmall from '../assets/manor/corridor-768.webp'
import { PaintingGhost } from './PaintingGhost'

/**
 * The corridor that leads nowhere, in its gilt frame, with the ghost that lives in it. Used by every
 * "not found" and "state" page. Decorative: the message is in the panel beside it.
 */
export function CorridorPainting(): ReactElement {
  return (
    <div className="painting">
      <img src={corridor} srcSet={`${corridorSmall} 768w, ${corridor} 1536w`} sizes="(max-width: 48rem) 100vw, 32rem" width={1536} height={1024} alt="" />
      <PaintingGhost />
    </div>
  )
}
