import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { artEdge, artUpright, hiddenShift, peekPosition } from '../utils/ghost-spots'
import type { Placement, Spot } from '../utils/ghost-spots'
import { Ghost } from './Ghost'

type PeekingGhostProps = {
  spot: Spot
  placement: Placement
  hidden: boolean
  /** Bobs slowly and slides. Off under reduced motion. */
  animated: boolean
  /** Bobs in place, forever. Off on the audit views, which settle (the slides are finite and stay). Default: `animated`. */
  bob?: boolean
  /** Starts in its peeking spot. Otherwise it starts hidden and slides in on the next frames. */
  instant: boolean
  /** Offsets the bob so the ghosts do not move in step. */
  index: number
}

/**
 * One ghost peeking in from behind a screen edge or the content panel. Pure decoration:
 * `pointer-events: none` in CSS.
 *
 * The parent keys this component on the ghost's spot, so a ghost that moves is a NEW node: it mounts
 * already hidden (no transition from the old spot), then slides in once it has been painted.
 */
export function PeekingGhost({ spot, placement, hidden, animated, bob = animated, instant, index }: PeekingGhostProps): ReactElement {
  const [entered, setEntered] = useState<boolean>(instant || !animated)
  useEffect(() => {
    if (entered) return undefined
    let second = 0
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      window.cancelAnimationFrame(first)
      window.cancelAnimationFrame(second)
    }
  }, [entered])

  const out = hidden || !entered
  const origin = peekPosition(spot, placement)
  const shift = out ? hiddenShift(spot, placement) : { x: 0, y: 0 }
  return (
    <div
      className="margin-ghost"
      aria-hidden="true"
      data-edge={spot.edge}
      data-anchor={spot.anchor}
      data-pos={spot.pos}
      data-hidden={hidden}
      style={{ left: origin.x, top: origin.y, width: placement.size, height: placement.size }}
    >
      <div
        className="margin-ghost-slide"
        data-out={out}
        data-startled={hidden}
        style={{ transform: `translate3d(${shift.x}px, ${shift.y}px, 0)` }}
      >
        <div className="margin-ghost-bob" data-animated={bob} style={{ animationDelay: `${-index * 1.3}s` }}>
          <Ghost size={placement.size} edge={artEdge(spot)} upright={artUpright(spot, placement)} mood={hidden ? 'startled' : 'looking'} />
        </div>
      </div>
    </div>
  )
}
