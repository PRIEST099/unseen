import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'

/** PLACEHOLDER: task 2.1 replaces this with the real stage-polling séance. */
export function SeanceView(): ReactElement {
  useDocumentTitle('The séance')
  useFocusMain()
  return (
    <main id="main" tabIndex={-1} className="view">
      <h1>The séance</h1>
      <p>Progress for this audit is not shown yet.</p>
      <Link to="/">Back to home</Link>
    </main>
  )
}
