import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import seanceTable from '../assets/manor/seance-table.webp'
import { SessionEnded } from '../components/SessionEnded'
import { useAnnouncer } from '../contexts/AnnouncerContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFocusMain } from '../hooks/useFocusMain'
import { useJobPoll } from '../hooks/useJobPoll'
import type { JobPollState } from '../hooks/useJobPoll'
import { primeAudit } from '../utils/audit-source'
import { canCancel, completedStages, completionAnnouncement, formatElapsed, seanceStatusText } from '../utils/seance'

function CompletedList({ state }: { state: JobPollState }): ReactElement | null {
  if (state.phase !== 'running') return null
  const stages = completedStages(state.stages)
  if (stages.length === 0) return null
  return (
    <ul className="seance-stages" aria-label="Completed stages">
      {stages.map((stage) => (
        <li key={stage.stage}>
          {stage.label} {formatElapsed(stage.elapsedMs)}
        </li>
      ))}
    </ul>
  )
}

type SeanceActionsProps = { state: JobPollState; jobId: string; onRetry: () => void }

/**
 * What the user can do at each point: Cancel while the audit is on its way (requirement 31.1),
 * "Try another URL" while the server is being retried, and the failure actions once it stopped.
 */
function SeanceActions({ state, jobId, onRetry }: SeanceActionsProps): ReactElement | null {
  const navigate = useNavigate()
  if (canCancel(state)) {
    return (
      <div className="state-actions">
        {/* Leaving the séance stops polling; the server finishes or drops the job on its own. */}
        <Link to="/" className="button button-primary">
          Cancel
        </Link>
      </div>
    )
  }
  if (state.phase === 'retrying') {
    return (
      <div className="state-actions">
        <button type="button" className="button button-primary" onClick={() => navigate('/')}>
          Try another URL
        </button>
      </div>
    )
  }
  if (state.phase !== 'failed') return null
  if (state.reason === 'ended') return <SessionEnded jobId={jobId} />
  return (
    <div className="state-actions">
      {state.reason === 'unreachable' ? (
        <button type="button" className="button button-primary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      <button
        type="button"
        className={state.reason === 'unreachable' ? 'button' : 'button button-primary'}
        onClick={() => navigate('/')}
      >
        Try another URL
      </button>
    </div>
  )
}

export function SeanceView(): ReactElement {
  useDocumentTitle('The séance')
  useFocusMain()
  const { jobId = '' } = useParams()
  const navigate = useNavigate()
  const { announce } = useAnnouncer()
  const { state, retry } = useJobPoll(jobId)

  useEffect(() => {
    if (state.phase !== 'done') return
    primeAudit({ kind: 'job', id: jobId }, state.audit)
    announce(completionAnnouncement(state.audit))
    navigate(`/audit/${encodeURIComponent(jobId)}`, { replace: true, state: { fromSeance: true } })
  }, [state, jobId, navigate, announce])

  const handleRetry = (): void => {
    // The Retry button leaves the page when polling restarts, so keep focus in the view.
    document.getElementById('main')?.focus()
    retry()
  }

  return (
    <main id="main" tabIndex={-1} className="view">
      <div className="manor-scene">
        <div className="painting seance-painting">
          {/* Decorative: the séance table. Every word of the séance is in the panel beside it. */}
          <img src={seanceTable} width={1200} height={800} alt="" />
        </div>
        <div>
          <h1>The séance</h1>
          <p className="flavor">Hush. The spirits are walking the page.</p>
          {/* The live regions are always in the DOM; only their text changes. */}
          <p className="seance-stage" role="status" aria-live="polite">
            {seanceStatusText(state)}
          </p>
          <CompletedList state={state} />
          <p className="form-error" aria-live="assertive">
            {state.phase === 'failed' ? state.message : ''}
          </p>
          <SeanceActions state={state} jobId={jobId} onRetry={handleRetry} />
        </div>
      </div>
    </main>
  )
}
