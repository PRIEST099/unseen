import type { ClassifiedAudit, Haunting } from '@the-unseen/core'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import { useSound } from '../contexts/SoundContext'
import { useScale } from '../hooks/useScale'
import type { PngSize } from '../hooks/useScale'
import { screenshotEndpoint } from '../utils/audit-source'
import type { AuditSource } from '../utils/audit-source'
import { fogOpacityForStyle } from '../utils/fog-density'
import { createFogPainter } from '../utils/fog-canvas'
import type { FogPainter } from '../utils/fog-canvas'
import { OVERLAY_FADE_OUT_MS, revealedCount, waveCenter, waveProgress } from '../utils/fog-wave'
import { buildAxLookup, buildOverlayLabel, elementLabel } from '../utils/overlay-label'
import { hitRect, placeOverlays, stackingLevels } from '../utils/overlay-geometry'
import { pickSpokenHaunting, speakWhisper } from '../utils/whisper-speech'
import { HauntingDetailDialog } from './HauntingDetailDialog'
import { HauntingOverlay, OverlayDefs } from './HauntingOverlay'
import { HauntingSidebar } from './HauntingSidebar'
import { LensNav } from './LensNav'

type SpiritSightViewProps = {
  source: AuditSource
  audit: ClassifiedAudit
  basePath: string
}

type DialogState = { haunting: Haunting }

const NO_IDS: ReadonlySet<string> = new Set()
const REDUCED_MOTION_FILTER = 'saturate(0.7) brightness(0.9)'

/** The skip link that must come first in the tab order lives in the app shell's slot. */
function HauntingListSkipLink(): ReactElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => setSlot(document.getElementById('skip-link-slot')), [])
  return slot === null
    ? null
    : createPortal(
        <a href="#haunting-list" className="skip-link">
          Skip to the haunting list
        </a>,
        slot,
      )
}

function escapableNodeIds(audit: ClassifiedAudit): ReadonlySet<string> {
  const ids = audit.raw.tabWalkResult.cycles.filter((cycle) => cycle.escapable === true).flatMap((cycle) => cycle.nodeIds)
  return new Set(ids)
}

export function SpiritSightView({ source, audit, basePath }: SpiritSightViewProps): ReactElement {
  const reducedMotion = useReducedMotion()
  const { soundEnabled } = useSound()

  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(NO_IDS)
  const [closing, setClosing] = useState(false)
  const [status, setStatus] = useState('')
  const [natural, setNatural] = useState<PngSize | null>(null)
  const [imageFailed, setImageFailed] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)

  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogTrigger = useRef<HTMLElement | null>(null)

  const scale = useScale(natural, frameRef)
  const pngWidth = natural?.width ?? audit.raw.viewportWidth
  const axLookup = useMemo(() => buildAxLookup(audit.raw.axNodes), [audit])
  const labels = useMemo(
    () => new Map(audit.hauntings.map((haunting) => [haunting.id, buildOverlayLabel(haunting, axLookup)] as const)),
    [audit, axLookup],
  )
  const placed = useMemo(() => placeOverlays(audit.hauntings, pngWidth), [audit, pngWidth])
  const levels = useMemo(() => stackingLevels(placed.map((item) => item.box)), [placed])
  const escapable = useMemo(() => escapableNodeIds(audit), [audit])
  const hauntingCount = audit.hauntings.length

  // The reveal effect reads these through a ref so a resize or re-render never restarts the wave.
  const latest = useRef({ scale, placed, audit, soundEnabled, reducedMotion, revealed })
  latest.current = { scale, placed, audit, soundEnabled, reducedMotion, revealed }

  const readNaturalSize = useCallback((): void => {
    const image = imgRef.current
    if (image === null || image.naturalWidth <= 0 || image.naturalHeight <= 0) return
    const next = { width: image.naturalWidth, height: image.naturalHeight }
    setNatural((previous) => (previous?.width === next.width && previous.height === next.height ? previous : next))
  }, [])

  useLayoutEffect(readNaturalSize, [readNaturalSize])

  const announceOpen = useCallback((): void => {
    const { audit: current, placed: items, soundEnabled: sound, reducedMotion: reduced } = latest.current
    setStatus(`Spirit Sight open: ${current.hauntings.length} hauntings, score ${current.score}`)
    const spoken = pickSpokenHaunting(items.map((item) => item.haunting))
    if (sound && !reduced && spoken?.speech !== undefined) speakWhisper(spoken.speech)
  }, [])

  const hasScale = scale !== null

  useEffect(() => {
    if (!open) return undefined
    setClosing(false)
    if (!hasScale) return undefined
    const items = latest.current.placed
    const allIds = new Set(items.map((item) => item.haunting.id))
    const finish = (): void => {
      setRevealed(allIds)
      announceOpen()
    }
    const painter: FogPainter | null =
      latest.current.reducedMotion || canvasRef.current === null ? null : createFogPainter(canvasRef.current)
    if (painter === null) {
      finish()
      return undefined
    }
    const ys = items.map((item) => item.box.y)
    const start = performance.now()
    let shown = 0
    let frame = 0
    const tick = (now: number): void => {
      const current = latest.current.scale
      if (current === null) return
      const progress = waveProgress(now - start)
      const center = waveCenter(progress, current.scaledHeight)
      const count = revealedCount(center, ys, current.scaleFactor)
      if (count !== shown) {
        shown = count
        setRevealed(new Set(items.slice(0, count).map((item) => item.haunting.id)))
      }
      if (progress >= 1) {
        painter.clear()
        finish()
        return
      }
      painter.paint(center)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      painter.clear()
    }
  }, [open, hasScale, announceOpen])

  useEffect(() => {
    if (open) return undefined
    setStatus('')
    if (latest.current.revealed.size === 0) return undefined
    if (latest.current.reducedMotion) {
      setRevealed(NO_IDS)
      return undefined
    }
    setClosing(true)
    const timer = window.setTimeout(() => {
      setRevealed(NO_IDS)
      setClosing(false)
    }, OVERLAY_FADE_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (dialog !== null || dialogTrigger.current === null) return
    dialogTrigger.current.focus()
    dialogTrigger.current = null
  }, [dialog])

  const openDialog = useCallback((haunting: Haunting, trigger: HTMLElement): void => {
    dialogTrigger.current = trigger
    setDialog({ haunting })
  }, [])
  const closeDialog = useCallback((): void => setDialog(null), [])

  const rendered = placed.map((item, index) => ({ item, index })).filter(({ item }) => revealed.has(item.haunting.id))
  const imageFilter = open && reducedMotion ? REDUCED_MOTION_FILTER : undefined
  const imageSize = scale === null ? undefined : { width: scale.scaledWidth, height: scale.scaledHeight }

  return (
    <>
      <HauntingListSkipLink />
      <div className="spirit-toolbar">
        {hauntingCount > 0 ? (
          <button type="button" className="button button-primary" aria-pressed={open} onClick={() => setOpen((previous) => !previous)}>
            Open Spirit Sight
          </button>
        ) : null}
        <p className="status-line" role="status">
          {status}
        </p>
        <Link to="/" className="button">
          Audit another site
        </Link>
      </div>
      <div className="spirit-layout">
        <HauntingSidebar audit={audit} labels={labels} onOpen={openDialog} onActiveChange={setActiveId}>
          <div className="sidebar-nav">
            <LensNav basePath={basePath} current="spirit" />
          </div>
        </HauntingSidebar>
        <div className="stage-frame" ref={frameRef}>
          <div className="spirit-stage" style={imageSize}>
            <img
              ref={imgRef}
              src={screenshotEndpoint(source)}
              alt="Audited page screenshot"
              style={{ ...imageSize, filter: imageFilter }}
              onLoad={readNaturalSize}
              onError={() => setImageFailed(true)}
            />
            {scale !== null ? (
              <>
                {rendered.length > 0 ? (
                  <svg
                    className="haunting-overlay"
                    aria-hidden="true"
                    focusable="false"
                    width={scale.scaledWidth}
                    height={scale.scaledHeight}
                    viewBox={`0 0 ${scale.pngWidth} ${scale.pngHeight}`}
                  >
                    <OverlayDefs />
                    {rendered.map(({ item }) => (
                      <HauntingOverlay
                        key={item.haunting.id}
                        haunting={item.haunting}
                        box={item.box}
                        reducedMotion={reducedMotion}
                        fogOpacity={fogOpacityForStyle(audit.raw.textNodeStyles[String(item.haunting.nodeIds[0])])}
                        escapable={item.haunting.nodeIds.some((id) => escapable.has(String(id)))}
                        active={activeId === item.haunting.id}
                        fadingOut={closing}
                      />
                    ))}
                  </svg>
                ) : null}
                <canvas
                  id="spirit-sight"
                  aria-hidden="true"
                  width={Math.round(scale.scaledWidth)}
                  height={Math.round(scale.scaledHeight)}
                  style={{ opacity: open ? 1 : 0 }}
                />
                {rendered.length > 0 ? (
                  <div className="overlay-buttons">
                    {rendered.map(({ item, index }) => {
                      const rect = hitRect(item.box, scale.scaleFactor, { width: scale.scaledWidth, height: scale.scaledHeight })
                      const label = labels.get(item.haunting.id) ?? ''
                      const banner = item.haunting.type === 'SilentTongue'
                      return (
                        <button
                          key={item.haunting.id}
                          type="button"
                          className={`haunting-overlay-button ${closing ? 'overlay-leave' : 'overlay-enter'}${banner ? ' is-banner' : ''}`}
                          aria-label={label}
                          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: levels[index] }}
                          onClick={(event) => openDialog(item.haunting, event.currentTarget)}
                          onFocus={() => setActiveId(item.haunting.id)}
                          onBlur={() => setActiveId(null)}
                          onMouseEnter={() => setActiveId(item.haunting.id)}
                          onMouseLeave={() => setActiveId(null)}
                        >
                          {banner ? 'The spirits speak a garbled tongue' : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          {imageFailed ? <p className="image-error">The screenshot could not be loaded.</p> : null}
        </div>
      </div>
      {dialog !== null ? (
        <HauntingDetailDialog
          haunting={dialog.haunting}
          elementLabel={elementLabel(dialog.haunting, axLookup)}
          auditedUrl={audit.raw.auditedUrl}
          onClose={closeDialog}
        />
      ) : null}
    </>
  )
}
