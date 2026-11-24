import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

type ReducedMotionContextValue = { reducedMotion: boolean }

const ReducedMotionContext = createContext<ReducedMotionContextValue>({ reducedMotion: false })

function readPreference(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
}

export function ReducedMotionProvider({ children }: { children: ReactNode }): ReactElement {
  const [reducedMotion, setReducedMotion] = useState<boolean>(readPreference)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent): void => setReducedMotion(event.matches)
    setReducedMotion(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return <ReducedMotionContext.Provider value={{ reducedMotion }}>{children}</ReducedMotionContext.Provider>
}

export function useReducedMotion(): boolean {
  return useContext(ReducedMotionContext).reducedMotion
}
