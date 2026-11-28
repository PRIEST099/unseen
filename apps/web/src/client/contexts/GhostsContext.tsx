import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { Placement, Spot } from '../utils/ghost-spots'

export const HIDE_GHOSTS_KEY = 'unseen.hide-ghosts'

/** Where the margin ghosts stand right now: the intro's ghosts land exactly there. */
export type MarginLayout = { placement: Placement; spots: readonly Spot[] }

type GhostsContextValue = {
  /** The "Hide ghosts" switch (WCAG 2.2.2): no intro, no ghosts, no lantern. */
  ghostsHidden: boolean
  toggleGhostsHidden: () => void
  /** True while a not-found state has asked for the margin ghosts. */
  extraAllowed: boolean
  /** Asks for the margin ghosts on a not-found state. Returns the way to withdraw the request. */
  allowGhosts: () => () => void
  /** True while the lights-on intro is on screen: the margin ghosts wait invisible until it is done. */
  introActive: boolean
  setIntroActive: (active: boolean) => void
  /** The margin ghosts report their spots here (null: there are none). Kept in a ref: nothing re-renders. */
  publishMarginLayout: (layout: MarginLayout | null) => void
  readMarginLayout: () => MarginLayout | null
}

const GhostsContext = createContext<GhostsContextValue>({
  ghostsHidden: false,
  toggleGhostsHidden: () => undefined,
  extraAllowed: false,
  allowGhosts: () => () => undefined,
  introActive: false,
  setIntroActive: () => undefined,
  publishMarginLayout: () => undefined,
  readMarginLayout: () => null,
})

export function readGhostsHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDE_GHOSTS_KEY) === '1'
  } catch {
    return false
  }
}

function writeGhostsHidden(hidden: boolean): void {
  try {
    window.localStorage.setItem(HIDE_GHOSTS_KEY, hidden ? '1' : '0')
  } catch {
    // Storage can be blocked: the choice then lasts for this page only.
  }
}

export function GhostsProvider({ children }: { children: ReactNode }): ReactElement {
  const [ghostsHidden, setGhostsHidden] = useState<boolean>(readGhostsHidden)
  const [requests, setRequests] = useState(0)
  const [introActive, setIntroActive] = useState(false)
  const hiddenRef = useRef(ghostsHidden)
  const marginLayout = useRef<MarginLayout | null>(null)

  const publishMarginLayout = useCallback((layout: MarginLayout | null): void => {
    marginLayout.current = layout
  }, [])
  const readMarginLayout = useCallback((): MarginLayout | null => marginLayout.current, [])

  const toggleGhostsHidden = useCallback((): void => {
    const next = !hiddenRef.current
    hiddenRef.current = next
    setGhostsHidden(next)
    writeGhostsHidden(next)
  }, [])

  const allowGhosts = useCallback((): (() => void) => {
    setRequests((count) => count + 1)
    return () => setRequests((count) => count - 1)
  }, [])

  const value = useMemo<GhostsContextValue>(
    () => ({
      ghostsHidden,
      toggleGhostsHidden,
      extraAllowed: requests > 0,
      allowGhosts,
      introActive,
      setIntroActive,
      publishMarginLayout,
      readMarginLayout,
    }),
    [ghostsHidden, toggleGhostsHidden, requests, allowGhosts, introActive, publishMarginLayout, readMarginLayout],
  )
  return <GhostsContext.Provider value={value}>{children}</GhostsContext.Provider>
}

export function useGhosts(): GhostsContextValue {
  return useContext(GhostsContext)
}

/** Rendered inside a "not found" state: the margin ghosts may show there, whatever the path. */
export function AllowGhosts(): null {
  const { allowGhosts } = useGhosts()
  useEffect(() => allowGhosts(), [allowGhosts])
  return null
}
