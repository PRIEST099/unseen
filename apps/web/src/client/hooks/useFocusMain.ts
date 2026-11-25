import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** React Router gives the first history entry of a page load this key. */
const INITIAL_LOCATION_KEY = 'default'

/**
 * Moves focus to `<main id="main">` when a view mounts after a client-side navigation.
 * It does nothing on the initial page load, so a keyboard user's first Tab still reaches
 * the skip link and the header instead of starting inside the page.
 */
export function useFocusMain(): void {
  const { key } = useLocation()
  useEffect(() => {
    if (key === INITIAL_LOCATION_KEY) return
    document.getElementById('main')?.focus()
  }, [key])
}
