import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { SampleCard } from '../components/SampleCard'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'
import { INVALID_URL_MESSAGE, parseAuditUrl, submitAudit } from '../utils/audit-api'
import { fetchSamples } from '../utils/samples'
import type { SampleMetadata } from '../utils/samples'

type SamplesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; samples: SampleMetadata[] }

function useSamples(): SamplesState {
  const [state, setState] = useState<SamplesState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchSamples(controller.signal).then(
      (samples) => setState({ status: 'ready', samples }),
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [])

  return state
}

function SampleList({ state, onSelect }: { state: SamplesState; onSelect: (id: string) => void }): ReactElement {
  if (state.status === 'loading') return <p>Loading samples…</p>
  if (state.status === 'error') return <p>The samples could not be loaded.</p>
  if (state.samples.length === 0) return <p>No samples are available.</p>
  return (
    <ul className="sample-cards" role="list">
      {state.samples.map((sample) => (
        <li key={sample.id}>
          <SampleCard {...sample} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  )
}

export function LandingView(): ReactElement {
  useDocumentTitle('THE UNSEEN')
  useFocusMain()
  const navigate = useNavigate()
  const samples = useSamples()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting) return
    const canonical = parseAuditUrl(url)
    if (canonical === undefined) {
      setError(INVALID_URL_MESSAGE)
      return
    }
    setError('')
    setSubmitting(true)
    const result = await submitAudit(canonical)
    setSubmitting(false)
    if (result.ok) {
      navigate(`/seance/${encodeURIComponent(result.id)}`)
    } else {
      setError(result.message)
    }
  }

  return (
    <main id="main" tabIndex={-1} className="view">
      <h1>THE UNSEEN</h1>
      <p className="tagline">Which site do you dare to see through their eyes?</p>
      <form className="url-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <div className="field">
          <label htmlFor="url-input">Enter a URL to audit</label>
          <input
            id="url-input"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={error === '' ? undefined : true}
            aria-describedby="url-error"
          />
        </div>
        <button type="submit" className="button button-primary" aria-disabled={submitting}>
          Begin audit
        </button>
        <p id="url-error" className="form-error" aria-live="assertive">
          {error}
        </p>
      </form>
      <h2>Try a sample</h2>
      <SampleList state={samples} onSelect={(id) => navigate(`/sample/${encodeURIComponent(id)}`)} />
    </main>
  )
}
