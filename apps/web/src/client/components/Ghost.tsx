import { useId } from 'react'
import type { ReactElement } from 'react'
import { EYES, EYE_SPREAD, EYE_Y, artTurn } from '../utils/ghost-art'
import type { GhostEdge, GhostMood } from '../utils/ghost-art'

type GhostProps = {
  /** Width and height in px. The drawing is square so a quarter turn never changes its box. */
  size: number
  /** The edge the hands hold. The ghost is turned so it leans in from that edge. */
  edge: GhostEdge
  mood?: GhostMood
  /** On a left or right edge: stand nearly upright with a gentle lean, instead of lying on the side. */
  upright?: boolean
}

/**
 * A soft bell: a big round dome, widest around the eyes, tapering a little to a hem of three rounded,
 * slightly uneven lobes (as if the cloth were drifting). No straight sides, no regular scallops.
 * The body is about 100 wide and 113 tall in a 120 x 120 box. The eyes and the turn are in
 * `utils/ghost-art.ts`, where the spot planner reads them too.
 */
const BODY =
  'M60 5 C90 5 110 26 110 54 C110 74 100 90 97 98 ' +
  'C99 110 80 116 73 104 C70 119 48 120 46 106 C43 115 24 116 23 100 ' +
  'C20 90 10 74 10 54 C10 26 30 5 60 5 Z'

/**
 * A chubby mint ghost in the style of the thumbnail: bell body, three-lobed hem, two big black oval
 * eyes, two small rounded hands. Pure decoration: hidden from assistive technology, never focusable,
 * never takes the pointer.
 */
export function Ghost({ size, edge, mood = 'looking', upright = false }: GhostProps): ReactElement {
  const id = useId()
  const bodyId = `${id}-body`
  const shadeId = `${id}-shade`
  const eyes = EYES[mood]
  const turn = artTurn(edge, upright)
  return (
    <svg
      className="ghost"
      data-mood={mood}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      style={{ transform: `rotate(${turn}deg)` }}
    >
      <defs>
        {/* Mint, lighter at the top left. */}
        <linearGradient id={bodyId} x1="0.15" y1="0" x2="0.65" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-ghost-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-ghost-bottom)' }} />
        </linearGradient>
        {/* A faint darker mint under the dome, to show form. */}
        <radialGradient id={shadeId} cx="0.36" cy="0.28" r="0.78">
          <stop offset="0.45" style={{ stopColor: 'var(--color-ghost-glow)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-ghost-glow)', stopOpacity: 0.38 }} />
        </radialGradient>
      </defs>
      <path d={BODY} fill={`url(#${bodyId})`} />
      <path d={BODY} fill={`url(#${shadeId})`} />
      <ellipse cx={60 - EYE_SPREAD} cy={EYE_Y} rx={eyes.rx} ry={eyes.ry} fill="var(--color-void)" />
      <ellipse cx={60 + EYE_SPREAD} cy={EYE_Y} rx={eyes.rx} ry={eyes.ry} fill="var(--color-void)" />
      <g fill={`url(#${bodyId})`} stroke="var(--color-ghost-glow)" strokeWidth="1.4" strokeLinecap="round">
        <ellipse cx="14" cy="82" rx="9" ry="7.5" />
        <ellipse cx="106" cy="82" rx="9" ry="7.5" />
        <path d="M9 77 v-2 M14 75 v-2 M19 77 v-2 M101 77 v-2 M106 75 v-2 M111 77 v-2" fill="none" />
      </g>
    </svg>
  )
}
