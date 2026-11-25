import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import { useSound } from '../contexts/SoundContext'
import { shouldPlayDrone } from '../utils/ambient-drone'
import { createDroneEngine } from '../utils/drone-engine'
import type { DroneEngine } from '../utils/drone-engine'

/**
 * Plays the ambient drone while sound is on and reduced motion is off. Mounted once, in `App`.
 *
 * The drone is never started on its own: it follows `soundEnabled`, which only the header toggle (or
 * the Whisper walk's Play button) can turn on. React runs the effect for that click before the event
 * ends, so the AudioContext is created and resumed while the user's activation is still valid.
 * Sound off, reduced motion on, or unmount stops it (unmount also closes the AudioContext).
 */
export function useAmbientDrone(): void {
  const { soundEnabled } = useSound()
  const reducedMotion = useReducedMotion()
  const engineRef = useRef<DroneEngine | null>(null)
  const play = shouldPlayDrone(soundEnabled, reducedMotion)

  useEffect(() => {
    const engine = createDroneEngine()
    engineRef.current = engine
    // Also runs on the simulated unmount of React StrictMode: the next mount builds a new engine.
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!play) return undefined
    const engine = engineRef.current
    engine?.start()
    return () => engine?.stop()
  }, [play])
}
