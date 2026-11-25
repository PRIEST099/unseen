import { useCallback, useEffect, useState } from 'react'
import { stepIntervalMs } from '../utils/keyboard-walk'

export type KeyboardWalkPlayback = {
  index: number
  playing: boolean
  /** The ghost reached the last frame; Play starts again from the first. */
  finished: boolean
  play: () => void
  pause: () => void
  stepForward: () => void
  stepBack: () => void
  restart: () => void
}

/**
 * Drives the ghost through `frameCount` frames, one every `stepIntervalMs(speed)` (300 ms at 1x,
 * also under reduced motion, where only the CSS transition is removed). Stepping and Restart stop
 * the walk; reaching the last frame stops it too.
 */
export function useKeyboardWalkPlayback(frameCount: number, speed: number): KeyboardWalkPlayback {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [finished, setFinished] = useState(false)
  const last = Math.max(frameCount - 1, 0)

  useEffect(() => {
    if (!playing) return undefined
    if (index >= last) {
      setPlaying(false)
      setFinished(true)
      return undefined
    }
    const timer = window.setTimeout(() => setIndex(index + 1), stepIntervalMs(speed))
    return () => window.clearTimeout(timer)
  }, [playing, index, last, speed])

  const play = useCallback((): void => {
    if (frameCount === 0) return
    if (finished || index >= last) {
      setIndex(0)
      setFinished(false)
    }
    setPlaying(true)
  }, [frameCount, finished, index, last])

  const pause = useCallback((): void => setPlaying(false), [])

  const stepTo = useCallback(
    (target: number): void => {
      setPlaying(false)
      setFinished(false)
      setIndex(Math.min(Math.max(target, 0), last))
    },
    [last],
  )

  const stepForward = useCallback((): void => stepTo(index + 1), [stepTo, index])
  const stepBack = useCallback((): void => stepTo(index - 1), [stepTo, index])
  const restart = useCallback((): void => stepTo(0), [stepTo])

  return { index, playing, finished, play, pause, stepForward, stepBack, restart }
}
