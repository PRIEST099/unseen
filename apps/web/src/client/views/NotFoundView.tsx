import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'

export function NotFoundView(): ReactElement {
  useDocumentTitle('Page not found')
  useFocusMain()
  return (
    <main id="main" tabIndex={-1} className="view">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link to="/">Return to home</Link>
    </main>
  )
}
