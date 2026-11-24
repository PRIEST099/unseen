import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

type SoundContextValue = {
  soundEnabled: boolean
  toggleSound: () => void
}

const SoundContext = createContext<SoundContextValue>({
  soundEnabled: false,
  toggleSound: () => undefined,
})

/** Sound is off by default and kept in memory only: never persisted (requirement 20.7). */
export function SoundProvider({ children }: { children: ReactNode }): ReactElement {
  const [soundEnabled, setSoundEnabled] = useState(false)
  const toggleSound = useCallback((): void => setSoundEnabled((previous) => !previous), [])
  const value = useMemo<SoundContextValue>(() => ({ soundEnabled, toggleSound }), [soundEnabled, toggleSound])
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}

export function useSound(): SoundContextValue {
  return useContext(SoundContext)
}
