import { Component, useEffect } from 'react'
import type { ErrorInfo, ReactElement, ReactNode } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

type ErrorBoundaryProps = {
  children: ReactNode
  /** When this value changes (for example the route), a boundary that has caught an error tries again. */
  resetKey?: string
}

type ErrorBoundaryState = { hasError: boolean }

/** The view shown when rendering fails: one h1, a way to reload, and a way home. */
function ErrorFallback(): ReactElement {
  useDocumentTitle('An error occurred')
  useEffect(() => {
    // A render error replaces the whole view, so focus goes to the new view's main region.
    document.getElementById('main')?.focus()
  }, [])
  return (
    <main id="main" tabIndex={-1} className="view">
      <h1>An error occurred</h1>
      <p>Something went wrong while showing this page. Reload the page to try again, or go back to the home page.</p>
      <div className="state-actions">
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          Reload page
        </button>
        {/* A plain link on purpose: it reloads the app, which clears whatever state caused the error. */}
        <a href="/" className="button">
          Back to home
        </a>
      </div>
    </main>
  )
}

/**
 * Catches errors thrown while rendering the routed view (requirement 31, design "Error Handling").
 * It sits inside the app shell, so the skip link, header and footer stay available.
 * Errors in event handlers and async code are not caught by React error boundaries.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Detail stays in the browser console; the page shows no stack trace or internal text.
    console.error('React error boundary caught:', error, info.componentStack)
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) this.setState({ hasError: false })
  }

  render(): ReactNode {
    return this.state.hasError ? <ErrorFallback /> : this.props.children
  }
}
