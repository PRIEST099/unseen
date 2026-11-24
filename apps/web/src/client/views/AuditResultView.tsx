import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'

type AuditResultViewProps = {
  source: 'job' | 'sample'
}

/** PLACEHOLDER: task 1.6 replaces this with the Spirit Sight view. */
export function AuditResultView({ source }: AuditResultViewProps): ReactElement {
  useDocumentTitle('Spirit Sight')
  useFocusMain()
  return (
    <main id="main" tabIndex={-1} className="view" data-source={source}>
      <h1>Spirit Sight</h1>
      <p>The audit result is not shown yet.</p>
      <Link to="/">Back to home</Link>
    </main>
  )
}
