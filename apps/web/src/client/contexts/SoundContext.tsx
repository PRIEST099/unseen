import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

type SoundContextValue = {
  /**
   * The header Sound toggle: ambient sound (the drone and the chimes) is on. Only the header toggle
   * changes it (requirements 33.2 and 33.3); the Whisper walk's Play button never does, because its
   * own click is the user gesture that allows Web Speech (requirement 20.4).
   */
  ambientEnabled: boolean
  /** Flips `ambientEnabled`. Call it from the header Sound toggle only. */
  toggleAmbient: () => void
  /**
   * Read-only alias of `ambientEnabled`, kept for the readers that predate it (Spirit Sight's chimes
   * and its opening whisper both follow the header toggle).
   */
  soundEnabled: boolean
}

const SoundContext = createContext<SoundContextValue>({
  ambientEnabled: false,
  toggleAmbient: () => undefined,
  soundEnabled: false,
})

/** Sound is off by default and kept in memory only: never persisted (requirements 20.1, 20.7, 33.3). */
export function SoundProvider({ children }: { children: ReactNode }): ReactElement {
  const [ambientEnabled, setAmbientEnabled] = useState(false)
  const toggleAmbient = useCallback((): void => setAmbientEnabled((previous) => !previous), [])
  const value = useMemo<SoundContextValue>(
    () => ({ ambientEnabled, toggleAmbient, soundEnabled: ambientEnabled }),
    [ambientEnabled, toggleAmbient],
  )
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}

export function useSound(): SoundContextValue {
  return useContext(SoundContext)
}
