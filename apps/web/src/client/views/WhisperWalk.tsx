import type { ClassifiedAudit } from '@the-unseen/core'
import { buildSpeechTrack } from '@the-unseen/core/speech'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { LensNav } from '../components/LensNav'
import { ScreenshotStage } from '../components/ScreenshotStage'
import { useHoldGhostsStill } from '../contexts/GhostsContext'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import { useWhisperPlayback } from '../hooks/useWhisperPlayback'
import type { AuditSource } from '../utils/audit-source'
import { isSpeechAvailable } from '../utils/whisper-speech'
import { counterText, parseSpeed, SPEED_OPTIONS, speedLabel } from '../utils/whisper-walk'
import type { WhisperSpeed } from '../utils/whisper-walk'

type WhisperWalkProps = {
  source: AuditSource
  audit: ClassifiedAudit
  hostname: string
  basePath: string
}

/** Pads the highlight so a very small element still reads as a box. */
const HIGHLIGHT_PAD = 4

function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!isSpeechAvailable()) return undefined
    const synth = window.speechSynthesis
    const load = (): void => setVoices(synth.getVoices())
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

type SettingsProps = {
  speed: WhisperSpeed
  onSpeed: (speed: WhisperSpeed) => void
  voices: readonly SpeechSynthesisVoice[]
  voiceUri: string
  onVoice: (voiceUri: string) => void
  captionsOnly: boolean
  speechAvailable: boolean
  onCaptionsOnly: (value: boolean) => void
}

function WhisperSettings(props: SettingsProps): ReactElement {
  const { speed, onSpeed, voices, voiceUri, onVoice, captionsOnly, speechAvailable, onCaptionsOnly } = props
  return (
    <div className="whisper-settings" role="group" aria-label="Whisper walk settings">
      <div className="whisper-field">
        <label htmlFor="whisper-speed">Speed</label>
        <select id="whisper-speed" value={String(speed)} onChange={(event: ChangeEvent<HTMLSelectElement>) => onSpeed(parseSpeed(event.target.value))}>
          {SPEED_OPTIONS.map((option) => (
            <option key={option} value={String(option)}>
              {speedLabel(option)}
            </option>
          ))}
        </select>
      </div>
      <div className="whisper-field">
        <label htmlFor="whisper-voice">Voice</label>
        <select
          id="whisper-voice"
          value={voiceUri}
          disabled={voices.length === 0}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onVoice(event.target.value)}
        >
          <option value="">Default voice</option>
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </div>
      <label className="whisper-check" htmlFor="whisper-captions-only">
        <input
          id="whisper-captions-only"
          type="checkbox"
          checked={captionsOnly}
          disabled={!speechAvailable}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onCaptionsOnly(event.target.checked)}
        />
        Captions only
      </label>
    </div>
  )
}

/**
 * The Whisper walk: what a screen reader says for each element in accessibility-tree order, spoken in a
 * whisper (Web Speech), captioned, and highlighted on the screenshot (requirement 14).
 */
export function WhisperWalk({ source, audit, hostname, basePath }: WhisperWalkProps): ReactElement {
  const reducedMotion = useReducedMotion()
  const track = useMemo(() => buildSpeechTrack(audit.raw), [audit])
  const [speechAvailable] = useState(isSpeechAvailable)
  const [speed, setSpeed] = useState<WhisperSpeed>(1)
  const [captionsPreference, setCaptionsPreference] = useState(false)
  const [voiceUri, setVoiceUri] = useState('')
  const voices = useVoices()
  const voice = voices.find((candidate) => candidate.voiceURI === voiceUri) ?? null
  const captionsOnly = captionsPreference || !speechAvailable
  const playback = useWhisperPlayback({ track, speed, captionsOnly, voice })
  // A moving painting ghost could be mistaken for the walk's Tab ghost: it holds still while this plays.
  useHoldGhostsStill(playback.playing)

  const highlightRef = useRef<SVGGElement>(null)
  const engaged = useRef(false)
  const line = track[playback.index]
  const box = line?.box ?? null

  useEffect(() => {
    // Bring the spoken element into view, but never move the page before the user has used a control.
    if (!engaged.current) return
    highlightRef.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [playback.index, reducedMotion])

  const handlePlay = (): void => {
    engaged.current = true
    // This click is the user gesture that allows Web Speech (requirement 20.4). It never touches the
    // header's ambient sound flag, so it never starts the drone (requirement 33.2).
    playback.play()
  }
  const handleStep = (direction: 'back' | 'forward'): void => {
    engaged.current = true
    if (direction === 'back') playback.stepBack()
    else playback.stepForward()
  }

  return (
    <>
      <h1>Whisper Walk: {hostname}</h1>
      <div className="lens-bar">
        <LensNav basePath={basePath} current="whisper" />
      </div>
      <div className="whisper-layout">
        <section className="whisper-panel" aria-labelledby="whisper-heading">
          <h2 id="whisper-heading">Screen reader announcements</h2>
          {track.length === 0 ? (
            <p>This page has nothing for a screen reader to announce.</p>
          ) : (
            <>
              <p>Press Play to hear what a screen reader says for each element, in page order. Play speaks the walk on its own; the header Sound toggle controls only the ambient sound.</p>
              {speechAvailable ? null : <p>This browser cannot speak, so the walk shows captions only.</p>}
              <div className="whisper-caption" aria-live={playback.playing && !captionsOnly ? 'off' : 'polite'} aria-atomic="true">
                <p className="whisper-text">{line?.text}</p>
                {line?.note !== undefined ? <p className="whisper-note">{line.note}</p> : null}
                <p className="whisper-counter">{counterText(playback.index, track.length)}</p>
              </div>
              <p className="status-line" role="status">
                {playback.finished ? `End of the walk: ${track.length} announcements.` : ''}
              </p>
              <div className="whisper-controls" role="group" aria-label="Playback controls">
                <button type="button" className="button button-primary" onClick={playback.playing ? playback.pause : handlePlay}>
                  {playback.playing ? 'Pause' : 'Play'}
                </button>
                <button type="button" className="button" onClick={() => handleStep('back')}>
                  Step back
                </button>
                <button type="button" className="button" onClick={() => handleStep('forward')}>
                  Step forward
                </button>
              </div>
              <WhisperSettings
                speed={speed}
                onSpeed={setSpeed}
                voices={voices}
                voiceUri={voiceUri}
                onVoice={setVoiceUri}
                captionsOnly={captionsOnly}
                speechAvailable={speechAvailable}
                onCaptionsOnly={setCaptionsPreference}
              />
            </>
          )}
        </section>
        <ScreenshotStage source={source}>
          {(scale) => (
            <svg
              className="haunting-overlay"
              aria-hidden="true"
              focusable="false"
              width={scale.scaledWidth}
              height={scale.scaledHeight}
              viewBox={`0 0 ${scale.pngWidth} ${scale.pngHeight}`}
            >
              {box === null ? null : (
                <g ref={highlightRef} className="whisper-highlight" data-node-id={line?.backendDOMNodeId}>
                  <rect
                    className="whisper-highlight-halo"
                    x={box.x - HIGHLIGHT_PAD}
                    y={box.y - HIGHLIGHT_PAD}
                    width={box.width + 2 * HIGHLIGHT_PAD}
                    height={box.height + 2 * HIGHLIGHT_PAD}
                  />
                  <rect
                    className="whisper-highlight-box"
                    x={box.x - HIGHLIGHT_PAD}
                    y={box.y - HIGHLIGHT_PAD}
                    width={box.width + 2 * HIGHLIGHT_PAD}
                    height={box.height + 2 * HIGHLIGHT_PAD}
                  />
                </g>
              )}
            </svg>
          )}
        </ScreenshotStage>
      </div>
    </>
  )
}
