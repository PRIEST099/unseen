import { useLayoutEffect } from 'react'
import type { ReactElement } from 'react'
import { useLocation } from 'react-router-dom'
import { useGhosts } from '../contexts/GhostsContext'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import { useMarginGhosts } from '../hooks/useMarginGhosts'
import { Lantern } from './Lantern'
import { PeekingGhost } from './PeekingGhost'

/**
 * Margin ghosts live on every route except the loaded Daylight lens, "the morning after", where the
 * ghosts are gone by design (one sleepy ghost remains in its painting). The Daylight view publishes
 * the flag through `GhostsContext`, so a not-found page under a `.../daylight` path still has them.
 */
export function marginGhostsAllowed(daylight: boolean): boolean {
  return !daylight
}

/** The audit views settle: no endless animation, so their margin ghosts stand still between ducks. */
export function marginGhostsCalm(pathname: string): boolean {
  return pathname.startsWith('/audit/') || pathname.startsWith('/sample/')
}

/**
 * Ghosts peeking in from behind the page: from the side edges of the window, from behind the content
 * panel, and up from the bottom edge. They appear wherever the wall beside the page is wide enough
 * to show a face (narrow windows and the wide audit views have fewer, or none: the ghost in the
 * painting covers those). The layer sits under the header, the panel and the footer (see ghosts.css),
 * so a ghost can never cover text, controls or a focus outline. Pure decoration: every element is
 * `aria-hidden`, never focusable and `pointer-events: none`. They duck out of the way of the lantern
 * (the pointer) and of keyboard focus, and come back somewhere else. On an audit view they do not bob.
 */
export function MarginGhosts(): ReactElement | null {
  const { pathname } = useLocation()
  const { ghostsHidden, daylight, introActive, publishMarginLayout } = useGhosts()
  const reducedMotion = useReducedMotion()
  const enabled = !ghostsHidden && marginGhostsAllowed(daylight)
  const calm = marginGhostsCalm(pathname)
  const { ghosts, placement } = useMarginGhosts({ enabled, dynamic: !reducedMotion, routeKey: pathname, paused: introActive })
  // The intro's ghosts land where these stand: it reads the spots from here when the lights come on.
  useLayoutEffect(() => {
    const spots = ghosts.filter((ghost) => !ghost.hidden).map((ghost) => ghost.spot)
    publishMarginLayout(enabled && spots.length > 0 ? { placement, spots } : null)
  }, [enabled, ghosts, placement, publishMarginLayout])
  useLayoutEffect(() => () => publishMarginLayout(null), [publishMarginLayout])
  if (!enabled || ghosts.length === 0) return null
  return (
    // While the intro plays its own ghosts stand in for these: they wait here, unseen, for the hand-off.
    <div className="margin-ghosts" aria-hidden="true" data-intro={introActive}>
      {reducedMotion ? null : <Lantern routeKey={pathname} />}
      {ghosts.map((ghost, index) => (
        <PeekingGhost
          key={`${ghost.id}:${ghost.spot.edge}:${ghost.spot.anchor}:${ghost.spot.pos}`}
          spot={ghost.spot}
          placement={placement}
          hidden={ghost.hidden}
          animated={!reducedMotion}
          bob={!reducedMotion && !calm}
          instant={ghost.instant}
          index={index}
        />
      ))}
    </div>
  )
}
