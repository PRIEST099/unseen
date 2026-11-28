import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useGhosts } from '../contexts/GhostsContext'
import { useSound } from '../contexts/SoundContext'
import { KeyboardHelpDialog } from './KeyboardHelpDialog'

const HELP_HASH = '#keyboard-help'

function SoundIcon({ enabled }: { enabled: boolean }): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {enabled ? (
        <>
          <path d="M16.5 9a4 4 0 0 1 0 6" />
          <path d="M19 6.5a8 8 0 0 1 0 11" />
        </>
      ) : (
        <path d="M17 9l5 6M22 9l-5 6" />
      )}
    </svg>
  )
}

/** A small ghost outline; struck through while the ghosts are hidden. */
function GhostIcon({ hidden }: { hidden: boolean }): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-2-2.4 2-2.3-2-2.3 2-2.4-2z" />
      <path d="M9.5 10.5v2M14.5 10.5v2" />
      {hidden ? <path d="M3 3l18 18" /> : null}
    </svg>
  )
}

function KeyboardIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  )
}

export function AppHeader(): ReactElement {
  const { ambientEnabled, toggleAmbient } = useSound()
  const { ghostsHidden, toggleGhostsHidden } = useGhosts()
  // On Landing the hero title is the brand, so the header does not repeat the name (and its link to '/').
  const onLanding = useLocation().pathname === '/'
  const [helpOpen, setHelpOpen] = useState<boolean>(() => window.location.hash === HELP_HASH)
  const helpButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onHashChange = (): void => setHelpOpen(window.location.hash === HELP_HASH)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const closeHelp = useCallback((): void => {
    setHelpOpen(false)
    if (window.location.hash === HELP_HASH) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
    helpButton.current?.focus()
  }, [])

  return (
    <header className="app-header">
      {onLanding ? null : (
        <Link to="/" className="wordmark">
          THE UNSEEN
        </Link>
      )}
      <button
        type="button"
        className="button button-icon"
        aria-label="Toggle sound"
        aria-pressed={ambientEnabled}
        onClick={toggleAmbient}
      >
        <SoundIcon enabled={ambientEnabled} />
      </button>
      <button
        type="button"
        className="button button-icon"
        aria-label="Hide ghosts"
        aria-pressed={ghostsHidden}
        onClick={toggleGhostsHidden}
      >
        <GhostIcon hidden={ghostsHidden} />
      </button>
      <button
        ref={helpButton}
        type="button"
        className="button"
        aria-haspopup="dialog"
        onClick={() => setHelpOpen(true)}
      >
        <KeyboardIcon />
        Keyboard help
      </button>
      {helpOpen ? <KeyboardHelpDialog onClose={closeHelp} /> : null}
    </header>
  )
}
