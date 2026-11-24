import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { DaylightReport } from '../components/DaylightReport'
import { SpiritSightView } from '../components/SpiritSightView'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'
import { cachedAudit, hostnameOf, loadAudit } from '../utils/audit-source'
import type { AuditLoadResult, AuditSource } from '../utils/audit-source'
import { LensPlaceholderPanel } from './LensPlaceholderPanel'
import { NotFoundView } from './NotFoundView'

type AuditResultViewProps = {
  source: 'job' | 'sample'
}

type LensRoute = 'spirit' | 'keyboard' | 'whisper' | 'daylight' | 'unknown'

const LENS_TITLES: Record<Exclude<LensRoute, 'unknown'>, string> = {
  spirit: 'Spirit Sight',
  keyboard: 'Keyboard Walk',
  whisper: 'Whisper Walk',
  daylight: 'Daylight report',
}

/** The sub-route below `/audit/:id` or `/sample/:id`. */
export function lensFromPath(pathname: string, basePath: string): LensRoute {
  const rest = pathname.startsWith(basePath) ? pathname.slice(basePath.length).replace(/^\/+|\/+$/g, '') : ''
  if (rest === '') return 'spirit'
  if (rest === 'keyboard' || rest === 'whisper' || rest === 'daylight') return rest
  return 'unknown'
}

/** Router state that the séance sets when it hands over to Spirit Sight. */
function isFromSeance(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'fromSeance' in state && state.fromSeance === true
}

function useAuditResult(source: AuditSource | null): AuditLoadResult | 'loading' {
  const [result, setResult] = useState<AuditLoadResult | 'loading'>(() => (source === null ? 'loading' : (cachedAudit(source) ?? 'loading')))
  const kind = source?.kind
  const id = source?.id

  useEffect(() => {
    if (kind === undefined || id === undefined) return undefined
    let cancelled = false
    const current: AuditSource = { kind, id }
    const cached = cachedAudit(current)
    setResult(cached ?? 'loading')
    if (cached === undefined) {
      void loadAudit(current).then((loaded) => {
        if (!cancelled) setResult(loaded)
      })
    }
    return () => {
      cancelled = true
    }
  }, [kind, id])

  return result
}

type StateMessageProps = { heading: string; message: string }

function StateMessage({ heading, message }: StateMessageProps): ReactElement {
  return (
    <main id="main" tabIndex={-1} className="view">
      <h1>{heading}</h1>
      <p>{message}</p>
      <Link to="/">Back to home</Link>
    </main>
  )
}

export function AuditResultView({ source: kind }: AuditResultViewProps): ReactElement {
  const params = useParams()
  const location = useLocation()
  const { pathname } = location
  const id = (kind === 'job' ? params.jobId : params.sampleId) ?? ''
  const source: AuditSource = { kind, id }
  const basePath = `/${kind === 'job' ? 'audit' : 'sample'}/${encodeURIComponent(id)}`
  const lens = lensFromPath(pathname, basePath)
  const result = useAuditResult(id === '' ? null : source)

  const notFoundHeading = kind === 'job' ? 'Audit not found' : 'Sample not found'
  let title = notFoundHeading
  if (result === 'loading') title = 'Loading audit'
  else if (result.status === 'ok' && lens !== 'unknown') title = LENS_TITLES[lens]
  useDocumentTitle(title)
  useFocusMain()
  const arrivedFromSeance = isFromSeance(location.state)
  const loaded = result !== 'loading' && result.status === 'ok'
  useEffect(() => {
    // Arriving from the séance: the new view's h1 takes focus (requirement 7.9).
    if (arrivedFromSeance && loaded && lens === 'spirit') document.getElementById('spirit-sight-heading')?.focus()
  }, [arrivedFromSeance, loaded, lens])

  if (lens === 'unknown') return <NotFoundView />
  if (result === 'loading') {
    return (
      <main id="main" tabIndex={-1} className="view">
        <h1>Loading audit</h1>
        <p role="status">Gathering the hauntings…</p>
      </main>
    )
  }
  if (result.status === 'in-progress') return <Navigate to={`/seance/${encodeURIComponent(id)}`} replace />
  if (result.status === 'failed') return <StateMessage heading="Audit unavailable" message={result.message} />
  if (result.status === 'not-found') {
    const message =
      kind === 'job'
        ? 'This séance has ended (results expire after 1 hour or when the server restarts).'
        : 'There is no sample with that name.'
    return <StateMessage heading={notFoundHeading} message={message} />
  }

  const hostname = hostnameOf(result.audit)
  return (
    <main id="main" tabIndex={-1} className="view view-wide" data-source={kind}>
      {lens === 'spirit' ? (
        <>
          <h1 id="spirit-sight-heading" tabIndex={-1}>
            Spirit Sight: {hostname}
          </h1>
          <SpiritSightView source={source} audit={result.audit} basePath={basePath} />
        </>
      ) : lens === 'daylight' ? (
        <DaylightReport audit={result.audit} hostname={hostname} basePath={basePath} />
      ) : (
        <LensPlaceholderPanel lens={lens} hostname={hostname} basePath={basePath} />
      )}
    </main>
  )
}
