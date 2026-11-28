import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import corridor from '../assets/manor/corridor.webp'
import corridorSmall from '../assets/manor/corridor-768.webp'
import { AllowGhosts } from '../contexts/GhostsContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'

export function NotFoundView(): ReactElement {
  useDocumentTitle('Page not found')
  useFocusMain()
  return (
    <main id="main" tabIndex={-1} className="view">
      <AllowGhosts />
      <div className="manor-scene">
        <div className="painting">
          {/* Decorative: a corridor that leads nowhere. The message is in the panel beside it. */}
          <img src={corridor} srcSet={`${corridorSmall} 768w, ${corridor} 1536w`} sizes="(max-width: 48rem) 100vw, 32rem" width={1536} height={1024} alt="" />
        </div>
        <div>
          <h1>Page not found</h1>
          <p className="flavor">This corridor leads nowhere. Even the ghosts avoid it.</p>
          <p>The page you are looking for does not exist.</p>
          <Link to="/">Return to home</Link>
        </div>
      </div>
    </main>
  )
}
