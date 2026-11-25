import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { PropsWithChildren, ReactElement } from 'react'

type AnnouncerContextValue = {
  announce: (message: string) => void
}

const AnnouncerContext = createContext<AnnouncerContextValue>({ announce: () => undefined })

/**
 * Owns one persistent polite live region for the whole app. It is rendered empty and only its
 * text changes, so announcements made just before a route change still reach screen readers.
 */
export function AnnouncerProvider({ children }: PropsWithChildren): ReactElement {
  const [message, setMessage] = useState('')
  const announce = useCallback((next: string): void => setMessage(next), [])
  const value = useMemo(() => ({ announce }), [announce])
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div id="app-announcer" role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </AnnouncerContext.Provider>
  )
}

export function useAnnouncer(): AnnouncerContextValue {
  return useContext(AnnouncerContext)
}
