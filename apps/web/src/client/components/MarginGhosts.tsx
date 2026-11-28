import { useLayoutEffect } from 'react'
import type { ReactElement } from 'react'
import { useLocation } from 'react-router-dom'
import { useGhosts } from '../contexts/GhostsContext'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import { useMarginGhosts } from '../hooks/useMarginGhosts'
import { Lantern } from './Lantern'
import { PeekingGhost } from './PeekingGhost'

/**
 * Where the ghosts live: the landing page, the séance, and every "not found" state (those ask for
 * them with `AllowGhosts`). Never the audit result views (Spirit Sight, Keyboard walk, Whisper
 * walk), and never Daylight, where "the ghosts are gone" by design.
 */
export function marginGhostsRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/seance/')
}

/**
 * Ghosts peeking in from behind the page: from the side edges of the window, from behind the content
 * panel, and up from the bottom edge. The layer sits under the header, the panel and the footer (see
 * ghosts.css), so a ghost can never cover text, controls or a focus outline. Pure decoration: every
 * element is `aria-hidden`, never focusable and `pointer-events: none`. They duck out of the way of
 * the lantern (the pointer) and of keyboard focus, and come back somewhere else.
 */
export function MarginGhosts(): ReactElement | null {
  const { pathname } = useLocation()
  const { ghostsHidden, extraAllowed, introActive, publishMarginLayout } = useGhosts()
  const reducedMotion = useReducedMotion()
  const enabled = !ghostsHidden && (marginGhostsRoute(pathname) || extraAllowed)
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
          instant={ghost.instant}
          index={index}
        />
      ))}
    </div>
  )
}
