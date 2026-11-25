import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import heroManor from '../assets/manor/hero-manor.webp'
import heroManorSmall from '../assets/manor/hero-manor-768.webp'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'
import { INVALID_URL_MESSAGE, parseAuditUrl, submitAudit } from '../utils/audit-api'
import { rememberJobUrl } from '../utils/job-urls'
import { SCORE_EXPLANATION, scoreBandLabel, scoreOutOf } from '../utils/score-band'
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

const SCORE_EXPLANATION_ID = 'sample-score-explanation'

type SampleCardProps = SampleMetadata & { onSelect: (id: string) => void }

/**
 * A sample card. The visible text is the accessible name (label in name, WCAG 2.5.3), e.g.
 * "Cursed Shop — Home Haunting Score 98 / 100 · heavily haunted" (the dot stays exposed: hiding visible
 * text from assistive technology is itself a haunting, The Veiled); the shared explanation that a higher
 * score means more barriers is its description.
 */
function SampleCard({ id, name, score, thumbnailUrl, onSelect }: SampleCardProps): ReactElement {
  return (
    <button type="button" className="sample-card" aria-describedby={SCORE_EXPLANATION_ID} onClick={() => onSelect(id)}>
      <img src={thumbnailUrl} alt="" loading="lazy" />
      <span className="sample-card-name">{name}</span>{' '}
      <span className="sample-card-score">
        <span className="sample-card-score-label">Haunting Score</span>{' '}
        <span className="sample-card-score-value">{scoreOutOf(score)}</span>
        <span className="sample-card-sep"> ·</span>{' '}
        <span className="sample-card-band">{scoreBandLabel(score)}</span>
      </span>
    </button>
  )
}

/** The decorative candle above the title. Its flame flickers unless reduced motion is preferred. */
function Candle(): ReactElement {
  return (
    <svg className="landing-candle" viewBox="0 0 32 64" aria-hidden="true" focusable="false">
      <path className="landing-candle-flame" d="M16 4c4 7 7 11 7 16a7 7 0 0 1-14 0c0-5 3-9 7-16z" />
      <path className="landing-candle-core" d="M16 14c2 4 3 6 3 8a3 3 0 0 1-6 0c0-2 1-4 3-8z" />
      <path className="landing-candle-wick" d="M16 27v5" />
      <rect className="landing-candle-body" x="9" y="32" width="14" height="30" rx="2" />
    </svg>
  )
}

function SampleList({ state, onSelect }: { state: SamplesState; onSelect: (id: string) => void }): ReactElement {
  if (state.status === 'loading') return <p>Loading samples…</p>
  if (state.status === 'error') return <p>The samples could not be loaded.</p>
  if (state.samples.length === 0) return <p>No samples are available.</p>
  return (
    <>
      <p id={SCORE_EXPLANATION_ID} className="sample-score-explanation">
        {SCORE_EXPLANATION}
      </p>
      <ul className="sample-cards" role="list">
        {state.samples.map((sample) => (
          <li key={sample.id}>
            <SampleCard {...sample} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </>
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
      rememberJobUrl(result.id, canonical)
      navigate(`/seance/${encodeURIComponent(result.id)}`)
    } else {
      setError(result.message)
    }
  }

  return (
    <main id="main" tabIndex={-1} className="view landing">
      {/* The hero is the brand on this route: the header leaves its wordmark out on "/". */}
      <div className="landing-hero">
        <div className="painting hero-painting">
          {/* Decorative: the haunted manor the app is named for. The plaque below carries all the text. */}
          <img
            src={heroManor}
            srcSet={`${heroManorSmall} 768w, ${heroManor} 1536w`}
            sizes="(max-width: 72rem) 100vw, 72rem"
            width={1536}
            height={864}
            alt=""
            fetchPriority="high"
          />
        </div>
        <div className="hero-plaque">
          <Candle />
          <h1 className="landing-title">THE UNSEEN</h1>
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
        </div>
      </div>
      <h2>Try a sample</h2>
      <SampleList state={samples} onSelect={(id) => navigate(`/sample/${encodeURIComponent(id)}`)} />
    </main>
  )
}
