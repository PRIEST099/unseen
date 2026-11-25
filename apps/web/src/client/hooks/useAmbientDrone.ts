import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../contexts/ReducedMotionContext'
import { useSound } from '../contexts/SoundContext'
import { shouldPlayDrone } from '../utils/ambient-drone'
import { createDroneEngine } from '../utils/drone-engine'
import type { DroneEngine } from '../utils/drone-engine'

/**
 * Plays the ambient drone while ambient sound is on and reduced motion is off. Mounted once, in `App`.
 *
 * The drone is never started on its own: it follows `ambientEnabled`, which only the header Sound
 * toggle can turn on (requirement 33.2). The Whisper walk's Play button speaks through its own gesture
 * and never starts the drone. React runs the effect for the toggle's click before the event ends, so
 * the AudioContext is created and resumed while the user's activation is still valid.
 * Ambient off, reduced motion on, or unmount stops it (unmount also closes the AudioContext).
 */
export function useAmbientDrone(): void {
  const { ambientEnabled } = useSound()
  const reducedMotion = useReducedMotion()
  const engineRef = useRef<DroneEngine | null>(null)
  const play = shouldPlayDrone(ambientEnabled, reducedMotion)

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
