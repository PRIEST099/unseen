import type { SpeechLine } from '@the-unseen/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { WHISPER_PITCH } from '../utils/whisper-speech'
import { captionDelayMs, clampIndex, pauseBetweenMs, utteranceTimeoutMs, whisperRate } from '../utils/whisper-walk'
import type { WhisperSpeed } from '../utils/whisper-walk'

type PlaybackOptions = {
  track: readonly SpeechLine[]
  speed: WhisperSpeed
  /** No audio: captions advance on a timer. Also used when the browser cannot speak. */
  captionsOnly: boolean
  voice: SpeechSynthesisVoice | null
}

export type WhisperPlayback = {
  index: number
  playing: boolean
  /** The last utterance has ended; Play starts again from the first. */
  finished: boolean
  play: () => void
  pause: () => void
  stepForward: () => void
  stepBack: () => void
}

/** Queues one whispered utterance; `onDone` runs when it ends or fails. */
function queueUtterance(text: string, rate: number, voice: SpeechSynthesisVoice | null, onDone: () => void): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.pitch = WHISPER_PITCH
  utterance.rate = rate
  if (voice !== null) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  utterance.onend = onDone
  utterance.onerror = onDone
  window.speechSynthesis.speak(utterance)
  return utterance
}

/**
 * Drives the Whisper walk. `index` (and so the caption and highlight) comes from app state when an
 * utterance is queued; the walk moves on at `onend`, at `onerror`, or after twice the estimated
 * duration, whichever comes first (requirement 14.11). Captions-only mode uses a timer instead.
 */
export function useWhisperPlayback({ track, speed, captionsOnly, voice }: PlaybackOptions): WhisperPlayback {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [finished, setFinished] = useState(false)
  // Chrome can drop an utterance's events when the object is garbage collected; keep a reference.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const length = track.length
  const line = track[index]

  useEffect(() => {
    if (!playing || line === undefined) return undefined
    let settled = false
    const timers: number[] = []
    const clearTimers = (): void => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.length = 0
    }
    const moveOn = (): void => {
      if (index >= length - 1) {
        setPlaying(false)
        setFinished(true)
      } else {
        setIndex(index + 1)
      }
    }
    const settle = (): void => {
      if (settled) return
      settled = true
      clearTimers()
      timers.push(window.setTimeout(moveOn, pauseBetweenMs(speed)))
    }

    if (captionsOnly) {
      timers.push(window.setTimeout(settle, captionDelayMs(line.text)))
    } else {
      const rate = whisperRate(speed)
      utteranceRef.current = queueUtterance(line.text, rate, voice, settle)
      timers.push(window.setTimeout(settle, utteranceTimeoutMs(line.text, rate)))
    }

    return () => {
      // Mark as settled first: cancelling fires `onerror` on the interrupted utterance.
      settled = true
      clearTimers()
      if (!captionsOnly) window.speechSynthesis.cancel()
      utteranceRef.current = null
    }
  }, [playing, index, line, length, speed, captionsOnly, voice])

  const play = useCallback((): void => {
    if (length === 0) return
    if (finished) {
      setIndex(0)
      setFinished(false)
    }
    setPlaying(true)
  }, [finished, length])

  const pause = useCallback((): void => setPlaying(false), [])

  const stepTo = useCallback(
    (target: number): void => {
      setFinished(false)
      setIndex(clampIndex(target, length))
    },
    [length],
  )

  const stepForward = useCallback((): void => stepTo(index + 1), [stepTo, index])
  const stepBack = useCallback((): void => stepTo(index - 1), [stepTo, index])

  return { index, playing, finished, play, pause, stepForward, stepBack }
}
