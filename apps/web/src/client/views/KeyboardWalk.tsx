import type { ClassifiedAudit, Haunting } from '@the-unseen/core'
import { buildSpeechTrack } from '@the-unseen/core/speech'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { LostSoulGlass, OverlayDefs } from '../components/HauntingOverlay'
import { LensNav } from '../components/LensNav'
import { ScreenshotStage } from '../components/ScreenshotStage'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import { useKeyboardWalkPlayback } from '../hooks/useKeyboardWalkPlayback'
import type { AuditSource } from '../utils/audit-source'
import {
  boxesByNode,
  buildWalkModel,
  frameEvents,
  ghostBoxAt,
  parseWalkSpeed,
  planSoulReveals,
  revealedSoulIds,
  SOUL_FADE_MS,
  speechByNode,
  STEP_MS,
  stepCaption,
  stepIntervalMs,
  WALK_SPEED_OPTIONS,
  walkSpeedLabel,
} from '../utils/keyboard-walk'
import type { WalkSpeed } from '../utils/keyboard-walk'
import { buildAxLookup, elementLabel } from '../utils/overlay-label'

type KeyboardWalkProps = {
  source: AuditSource
  audit: ClassifiedAudit
  hostname: string
  basePath: string
}

/** Pads the focus box so a very small element still reads as a box. */
const FOCUS_PAD = 4
/** The ghost is drawn about this many CSS px across, whatever the scale of the screenshot. */
const GHOST_RADIUS_CSS_PX = 14

type GhostProps = { x: number; y: number; scaleFactor: number; transition: string }

/** The Tab ghost: a `<g>` inside the same overlay SVG, so it scales with the screenshot. */
function Ghost({ x, y, scaleFactor, transition }: GhostProps): ReactElement {
  return (
    <g className="tab-ghost" style={{ transform: `translate(${x}px, ${y}px)`, transition }}>
      <g transform={`scale(${1 / scaleFactor})`}>
        <circle className="ghost-aura" cx={0} cy={0} r={GHOST_RADIUS_CSS_PX} />
        <path className="ghost-body" d="M-6,-4 Q-6,-9 0,-9 Q6,-9 6,-4 L6,5 L3,3 L0,6 L-3,3 L-6,5 Z" />
        <circle className="ghost-eye" cx={-2.2} cy={-3} r={1.2} />
        <circle className="ghost-eye" cx={2.2} cy={-3} r={1.2} />
      </g>
    </g>
  )
}

type SpeedProps = { speed: WalkSpeed; onSpeed: (speed: WalkSpeed) => void }

function SpeedControl({ speed, onSpeed }: SpeedProps): ReactElement {
  return (
    <div className="walk-field">
      <label htmlFor="walk-speed">Speed</label>
      <select id="walk-speed" value={String(speed)} onChange={(event: ChangeEvent<HTMLSelectElement>) => onSpeed(parseWalkSpeed(event.target.value))}>
        {WALK_SPEED_OPTIONS.map((option) => (
          <option key={option} value={String(option)}>
            {walkSpeedLabel(option)}
          </option>
        ))}
      </select>
    </div>
  )
}

function soulsOf(audit: ClassifiedAudit): Haunting[] {
  return audit.hauntings.filter((haunting) => haunting.type === 'LostSoul' && haunting.box !== null)
}

/**
 * The Keyboard walk: a ghost presses Tab through the page in the recorded order. Lost Souls (clickable
 * elements Tab skips) appear behind glass as the ghost passes them, an escapable cycle is circled
 * twice before the ghost breaks free, and a Cursed Loop traps it (requirement 15).
 */
export function KeyboardWalk({ source, audit, hostname, basePath }: KeyboardWalkProps): ReactElement {
  const reducedMotion = useReducedMotion()
  const [speed, setSpeed] = useState<WalkSpeed>(1)
  const model = useMemo(() => buildWalkModel(audit.raw.tabWalkResult, audit.hauntings), [audit])
  const boxes = useMemo(() => boxesByNode(audit.raw.boundingBoxes), [audit])
  const speech = useMemo(() => speechByNode(buildSpeechTrack(audit.raw)), [audit])
  const axLookup = useMemo(() => buildAxLookup(audit.raw.axNodes), [audit])
  const souls = useMemo(() => soulsOf(audit), [audit])
  const plan = useMemo(() => planSoulReveals(model.frames, boxes, audit.hauntings, model.trap !== null), [model, boxes, audit])
  const playback = useKeyboardWalkPlayback(model.frames.length, speed)

  const focusRef = useRef<SVGGElement>(null)
  const engaged = useRef(false)
  const frame = model.frames[playback.index]
  const elementBox = frame === undefined ? null : (boxes.get(frame.nodeId) ?? null)
  const ghostBox = ghostBoxAt(model.frames, boxes, playback.index)
  const revealed = useMemo(() => revealedSoulIds(plan, playback.index), [plan, playback.index])
  const skipped = (plan[playback.index] ?? []).map((soul) => elementLabel(soul, axLookup))
  const atEnd = playback.index >= model.frames.length - 1
  const events = frame === undefined ? [] : frameEvents(frame, skipped)
  if (playback.finished && atEnd && model.trap === null) events.push(`End of the Tab walk: ${model.stepCount} steps.`)
  const trapRing = model.trap !== null && playback.index >= model.trap.entryFrame ? model.trap.haunting.box : null
  const transition = reducedMotion ? 'none' : `transform ${Math.min(STEP_MS, stepIntervalMs(speed))}ms ease-in-out`

  useEffect(() => {
    // Keep the focused element in view, but never move the page before the user has used a control.
    if (!engaged.current) return
    focusRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
  }, [playback.index])

  const engage = (action: () => void) => (): void => {
    engaged.current = true
    action()
  }

  return (
    <>
      <h1>Keyboard Walk: {hostname}</h1>
      <div className="lens-bar">
        <LensNav basePath={basePath} current="keyboard" />
      </div>
      <div className="walk-layout">
        <section className="walk-panel" aria-labelledby="walk-heading">
          <h2 id="walk-heading">Tab sequence</h2>
          {frame === undefined ? (
            <p>Pressing Tab found no keyboard stops on this page.</p>
          ) : (
            <>
              <p>Press Play to watch a ghost press Tab through the page. A Lost Soul is something a mouse can click that Tab skips.</p>
              <div className="walk-caption" aria-live={playback.playing ? 'off' : 'polite'} aria-atomic="true">
                <p className="walk-step">{stepCaption(frame, model.stepCount, speech)}</p>
              </div>
              <div className="walk-events" role="status">
                {events.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div className="walk-controls" role="group" aria-label="Walk controls">
                <button
                  type="button"
                  className="button button-primary"
                  aria-pressed={playback.playing}
                  onClick={engage(playback.playing ? playback.pause : playback.play)}
                >
                  Play
                </button>
                <button type="button" className="button" onClick={engage(playback.stepBack)}>
                  Step back
                </button>
                <button type="button" className="button" onClick={engage(playback.stepForward)}>
                  Step forward
                </button>
                <button type="button" className="button" onClick={engage(playback.restart)}>
                  Restart
                </button>
              </div>
              <div className="walk-settings" role="group" aria-label="Keyboard walk settings">
                <SpeedControl speed={speed} onSpeed={setSpeed} />
              </div>
            </>
          )}
        </section>
        <ScreenshotStage source={source}>
          {(scale) => (
            <svg
              className="haunting-overlay ghost-layer"
              aria-hidden="true"
              focusable="false"
              width={scale.scaledWidth}
              height={scale.scaledHeight}
              viewBox={`0 0 ${scale.pngWidth} ${scale.pngHeight}`}
            >
              <OverlayDefs />
              {souls.map((soul) => {
                const visible = revealed.has(soul.id)
                return soul.box === null ? null : (
                  <g
                    key={soul.id}
                    className="haunting-visual lost-soul-reveal"
                    data-soul-id={soul.id}
                    data-revealed={visible}
                    style={{ opacity: visible ? 1 : 0, transition: reducedMotion ? 'none' : `opacity ${SOUL_FADE_MS}ms ease-out` }}
                  >
                    <LostSoulGlass box={soul.box} />
                  </g>
                )
              })}
              {trapRing === null ? null : (
                <g className="haunting-visual trap-ring">
                  <ellipse
                    className={reducedMotion ? 'v-ember-ring' : 'v-ember-ring cursed-loop-glow'}
                    cx={trapRing.x + trapRing.width / 2}
                    cy={trapRing.y + trapRing.height / 2}
                    rx={trapRing.width / 2 + 10}
                    ry={trapRing.height / 2 + 10}
                  />
                </g>
              )}
              {elementBox === null ? null : (
                <g ref={focusRef} className="walk-focus" data-node-id={frame?.nodeId}>
                  <rect
                    className="walk-focus-halo"
                    x={elementBox.x - FOCUS_PAD}
                    y={elementBox.y - FOCUS_PAD}
                    width={elementBox.width + 2 * FOCUS_PAD}
                    height={elementBox.height + 2 * FOCUS_PAD}
                  />
                  <rect
                    className="walk-focus-box"
                    x={elementBox.x - FOCUS_PAD}
                    y={elementBox.y - FOCUS_PAD}
                    width={elementBox.width + 2 * FOCUS_PAD}
                    height={elementBox.height + 2 * FOCUS_PAD}
                  />
                </g>
              )}
              {ghostBox === null ? null : (
                <Ghost
                  x={ghostBox.x + ghostBox.width / 2}
                  y={ghostBox.y + ghostBox.height / 2}
                  scaleFactor={scale.scaleFactor}
                  transition={transition}
                />
              )}
            </svg>
          )}
        </ScreenshotStage>
      </div>
    </>
  )
}
