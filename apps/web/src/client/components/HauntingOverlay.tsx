import type { Haunting } from '@the-unseen/core'
import type { ReactElement } from 'react'
import type { Rect } from '../utils/overlay-geometry'

export const FOG_FILTER_ID = 'unseen-fog-noise'
export const GHOST_GRADIENT_ID = 'unseen-ghost-gradient'
export const GLASS_GRADIENT_ID = 'unseen-glass-gradient'

/**
 * Shared SVG paint servers. Everything in the overlay SVG is decorative and hidden from assistive
 * technology as a whole; the interactive controls are real buttons in a separate layer.
 */
export function OverlayDefs(): ReactElement {
  return (
    <defs>
      <linearGradient id={GHOST_GRADIENT_ID} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" className="stop-mist" stopOpacity="0.8" />
        <stop offset="100%" className="stop-mist" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id={GLASS_GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" className="stop-mist" stopOpacity="0.4" />
        <stop offset="100%" className="stop-mist" stopOpacity="0.6" />
      </linearGradient>
      <filter id={FOG_FILTER_ID} x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="3" seed="4" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -0.3" result="density" />
        <feFlood className="flood-mist" result="tint" />
        <feComposite in="tint" in2="density" operator="in" />
      </filter>
    </defs>
  )
}

type VisualProps = { box: Rect; haunting: Haunting; reducedMotion: boolean; fogOpacity: number; escapable: boolean }

function NamelessSpirit({ box, reducedMotion }: VisualProps): ReactElement {
  return (
    <rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      rx={4}
      fill={`url(#${GHOST_GRADIENT_ID})`}
      className={reducedMotion ? undefined : 'ghost-bob'}
    />
  )
}

function HollowPortrait({ box }: VisualProps): ReactElement {
  const radius = Math.min(8, box.width / 8, box.height / 8)
  return (
    <>
      <rect x={box.x} y={box.y} width={box.width} height={box.height} className="v-desaturate" />
      <rect x={box.x} y={box.y} width={box.width} height={box.height} className="v-mist-dashed" />
      <circle cx={box.x + box.width * 0.33} cy={box.y + box.height * 0.4} r={radius} className="v-ink-fill" />
      <circle cx={box.x + box.width * 0.67} cy={box.y + box.height * 0.4} r={radius} className="v-ink-fill" />
    </>
  )
}

function TheFog({ box, haunting, reducedMotion, fogOpacity }: VisualProps): ReactElement {
  const clipId = `fog-clip-${haunting.id}`
  return (
    <>
      <clipPath id={clipId}>
        <rect x={box.x} y={box.y} width={box.width} height={box.height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`} opacity={fogOpacity}>
        <rect
          x={box.x - 48}
          y={box.y}
          width={box.width + 96}
          height={box.height}
          filter={`url(#${FOG_FILTER_ID})`}
          className={reducedMotion ? 'v-mist-fill' : 'v-mist-fill fog-drift'}
        />
      </g>
    </>
  )
}

/** The Lost Soul treatment: frosted glass with a cross. Shared with the Keyboard walk, which reveals it. */
export function LostSoulGlass({ box }: { box: Rect }): ReactElement {
  return (
    <>
      <rect x={box.x} y={box.y} width={box.width} height={box.height} fill={`url(#${GLASS_GRADIENT_ID})`} />
      <line x1={box.x} y1={box.y} x2={box.x + box.width} y2={box.y + box.height} className="v-mist-stroke" />
      <line x1={box.x + box.width} y1={box.y} x2={box.x} y2={box.y + box.height} className="v-mist-stroke" />
    </>
  )
}

function LostSoul({ box }: VisualProps): ReactElement {
  return <LostSoulGlass box={box} />
}

function CursedLoop({ box, reducedMotion, escapable }: VisualProps): ReactElement {
  const motion = reducedMotion ? '' : escapable ? ' cursed-loop-pulse' : ' cursed-loop-glow'
  return (
    <ellipse
      cx={box.x + box.width / 2}
      cy={box.y + box.height / 2}
      rx={box.width / 2 + 10}
      ry={box.height / 2 + 10}
      className={`v-ember-ring${motion}`}
    />
  )
}

const FOOTPRINT = 'M5,15 Q7,12 10,12 Q12,12 12,15 L11,20 Q10,22 8,22 Q6,22 5,20 Z'

function InvisibleWanderer({ box }: VisualProps): ReactElement {
  const size = Math.min(Math.max(Math.min(box.width, box.height) / 22, 0.6), 1.6)
  const place = (fx: number, fy: number, flip: boolean): string => {
    const x = box.x + box.width * fx - 8 * size
    const y = box.y + box.height * fy - 17 * size
    return `translate(${x}, ${y}) scale(${flip ? -size : size}, ${size})${flip ? ' translate(-16, 0)' : ''}`
  }
  return (
    <>
      <path d={FOOTPRINT} transform={place(0.3, 0.35, false)} className="v-mist-print" />
      <path d={FOOTPRINT} transform={place(0.7, 0.75, true)} className="v-mist-print" />
    </>
  )
}

function WhisperingField({ box }: VisualProps): ReactElement {
  const baseline = box.y + box.height - 10
  return (
    <>
      <rect x={box.x} y={box.y} width={box.width} height={box.height} className="v-ecto-dashed" />
      <path
        d={`M ${box.x + 10} ${baseline} Q ${box.x + box.width / 2} ${baseline - 10} ${box.x + box.width - 10} ${baseline}`}
        className="v-mist-mouth"
      />
    </>
  )
}

function SilentTongue({ box }: VisualProps): ReactElement {
  return <rect x={box.x} y={box.y} width={box.width} height={box.height} className="v-ember-fill" />
}

function TheVeiled({ box, reducedMotion }: VisualProps): ReactElement {
  return (
    <rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      className={reducedMotion ? 'v-ink-veil' : 'v-ink-veil veiled-pulse'}
    />
  )
}

function Treatment(props: VisualProps): ReactElement | null {
  switch (props.haunting.type) {
    case 'NamelessSpirit':
      return <NamelessSpirit {...props} />
    case 'HollowPortrait':
      return <HollowPortrait {...props} />
    case 'TheFog':
      return <TheFog {...props} />
    case 'LostSoul':
      return <LostSoul {...props} />
    case 'CursedLoop':
      return <CursedLoop {...props} />
    case 'InvisibleWanderer':
      return <InvisibleWanderer {...props} />
    case 'WhisperingField':
      return <WhisperingField {...props} />
    case 'SilentTongue':
      return <SilentTongue {...props} />
    case 'TheVeiled':
      return <TheVeiled {...props} />
    case 'ShatteredOrder':
      return null
  }
}

type HauntingOverlayProps = VisualProps & {
  active: boolean
  fadingOut: boolean
  /** The "takes form" exit of a previewed fix: the treatment resolves into a crisp ecto outline, then fades. */
  takesForm?: boolean
}

/** One haunting's visual treatment inside the overlay SVG (requirement 9). Decorative only. */
export function HauntingOverlay(props: HauntingOverlayProps): ReactElement {
  const { box, active, fadingOut, takesForm = false } = props
  const phase = takesForm ? 'takes-form' : fadingOut ? 'overlay-leave' : 'overlay-enter'
  return (
    <g className={`haunting-visual ${phase}`} data-haunting-type={props.haunting.type}>
      <Treatment {...props} />
      {takesForm ? (
        <rect x={box.x} y={box.y} width={box.width} height={box.height} className="v-takes-form-outline" />
      ) : null}
      {active && !takesForm ? (
        <rect x={box.x} y={box.y} width={box.width} height={box.height} className="v-active-ring" />
      ) : null}
    </g>
  )
}
